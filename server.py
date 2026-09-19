#!/usr/bin/env python3
"""
server.py — server local pentru antrenamentul de puzzle-uri.

    python server.py                 # http://127.0.0.1:8000
    python server.py --port 9000
    python server.py --no-browser

Nu are nicio dependinta in afara de biblioteca standard Python.
"""

import argparse
import json
import mimetypes
import os
import posixpath
import sqlite3
import threading
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "web")
DB_PATH = os.path.join(HERE, "puzzles.db")

_local = threading.local()


def db():
    if not hasattr(_local, "con"):
        _local.con = sqlite3.connect(DB_PATH, check_same_thread=False)
        _local.con.row_factory = sqlite3.Row
    return _local.con


# --------------------------------------------------------------- rating ---

DEFAULT_RATING = 1200


def get_meta(key, default=None):
    row = db().execute("SELECT v FROM meta WHERE k = ?", (key,)).fetchone()
    return row["v"] if row else default


def set_meta(key, value):
    con = db()
    con.execute("INSERT OR REPLACE INTO meta VALUES (?,?)", (key, str(value)))
    con.commit()


def user_rating():
    try:
        return int(float(get_meta("rating", DEFAULT_RATING)))
    except (TypeError, ValueError):
        return DEFAULT_RATING


def update_rating(puzzle_rating, solved_ok):
    """Elo simplu, K adaptiv: se misca mai repede la inceput."""
    r = user_rating()
    played = int(float(get_meta("played", 0) or 0))
    k = 40 if played < 30 else (24 if played < 120 else 16)
    expected = 1.0 / (1.0 + 10 ** ((puzzle_rating - r) / 400.0))
    new = r + k * ((1.0 if solved_ok else 0.0) - expected)
    new = max(400, min(3200, int(round(new))))
    set_meta("rating", new)
    set_meta("played", played + 1)
    return new


# ---------------------------------------------------------------- query ---

def pick_puzzle(params):
    con = db()
    try:
        lo = int(params.get("min", [0])[0])
        hi = int(params.get("max", [4000])[0])
    except ValueError:
        lo, hi = 0, 4000
    theme = (params.get("theme", [""])[0] or "").strip()
    skip_solved = params.get("unseen", ["1"])[0] != "0"
    exclude = (params.get("exclude", [""])[0] or "").strip()

    where = ["rating BETWEEN ? AND ?"]
    args = [lo, hi]
    if theme:
        where.append("themes LIKE ?")
        args.append(f"%{theme}%")
    if skip_solved:
        where.append("NOT EXISTS (SELECT 1 FROM solved s WHERE s.id = puzzles.id)")
    if exclude:
        where.append("id <> ?")
        args.append(exclude)

    # Alegerea indexului conteaza enorm.
    #
    # Cu idx_rating_rnd (rating, rnd), un "ORDER BY rnd" peste un INTERVAL de
    # rating nu poate folosi ordinea din index: SQLite aduce toate randurile din
    # interval si le sorteaza intr-un B-tree temporar. Pe 6 milioane de randuri
    # si un interval larg inseamna peste o secunda la fiecare puzzle.
    #
    # Cu idx_rnd (doar rnd), scanam indexul in ordinea lui de la un pivot
    # aleatoriu si ne oprim la primul rand care se potriveste — sub o milisecunda
    # cand intervalul prinde o felie decenta din baza.
    #
    # Invers, pe un interval foarte ingust potrivirile sunt rare si scanarea
    # dupa rnd ar merge mult; acolo (rating, rnd) e cel bun, pentru ca are
    # putine randuri de sortat. Alegem dupa latimea intervalului.
    narrow = (hi - lo) <= 120
    hint = "INDEXED BY idx_rating_rnd" if narrow else "INDEXED BY idx_rnd"
    sql_base = f"SELECT * FROM puzzles {hint} WHERE " + " AND ".join(where)

    import random as _r
    pivot = _r.random()

    def try_sql(base, a):
        r = con.execute(base + " AND rnd >= ? ORDER BY rnd LIMIT 1", a + [pivot]).fetchone()
        if r is None:   # am trecut de capatul listei — o luam de la inceput
            r = con.execute(base + " AND rnd < ? ORDER BY rnd DESC LIMIT 1", a + [pivot]).fetchone()
        return r

    try:
        row = try_sql(sql_base, args)
    except sqlite3.OperationalError:
        # baza e dintr-o versiune fara indecsii astia — mergem fara hint
        sql_base = "SELECT * FROM puzzles WHERE " + " AND ".join(where)
        row = try_sql(sql_base, args)

    if row is None and skip_solved:
        # tot ce se potriveste a fost deja rezolvat — reluam puzzle-urile vechi
        where = [w for w in where if not w.startswith("NOT EXISTS")]
        args = [lo, hi] + ([f"%{theme}%"] if theme else []) + ([exclude] if exclude else [])
        row = try_sql(f"SELECT * FROM puzzles {hint} WHERE " + " AND ".join(where), args)

    if row is None:
        return None

    return {
        "id": row["id"],
        "fen": row["fen"],
        "moves": row["moves"].split(),
        "rating": row["rating"],
        "popularity": row["popularity"],
        "plays": row["plays"],
        "themes": row["themes"].split() if row["themes"] else [],
        "url": row["url"],
        "openings": row["openings"].split() if row["openings"] else [],
    }


PIECE_NAMES = [c + p for c in "wb" for p in "KQRBNP"]


def have_piece_files():
    """True doar daca toate cele 12 fisiere exista — altfel tabla ar fi mixta."""
    d = os.path.join(WEB, "pieces")
    return all(os.path.isfile(os.path.join(d, n + ".svg")) for n in PIECE_NAMES)


def stats():
    con = db()
    total = con.execute("SELECT COUNT(*) c FROM puzzles").fetchone()["c"]
    done = con.execute("SELECT COUNT(*) c FROM solved").fetchone()["c"]
    ok = con.execute("SELECT COUNT(*) c FROM solved WHERE ok = 1").fetchone()["c"]
    lo, hi = con.execute("SELECT MIN(rating), MAX(rating) FROM puzzles").fetchone()
    return {
        "total": total,
        "attempted": done,
        "correct": ok,
        "rating": user_rating(),
        "minRating": lo or 0,
        "maxRating": hi or 0,
        "streak": int(float(get_meta("streak", 0) or 0)),
        "bestStreak": int(float(get_meta("best_streak", 0) or 0)),
        "pieceFiles": have_piece_files(),
    }


def record(puzzle_id, puzzle_rating, ok):
    con = db()
    con.execute(
        "INSERT OR REPLACE INTO solved VALUES (?,?,strftime('%s','now'))",
        (puzzle_id, 1 if ok else 0),
    )
    con.commit()
    streak = int(float(get_meta("streak", 0) or 0))
    streak = streak + 1 if ok else 0
    set_meta("streak", streak)
    if streak > int(float(get_meta("best_streak", 0) or 0)):
        set_meta("best_streak", streak)
    new_rating = update_rating(puzzle_rating, ok)
    return {"rating": new_rating, "streak": streak}


# --------------------------------------------------------------- server ---

class Handler(BaseHTTPRequestHandler):
    server_version = "PuzzleTrainer/1.0"

    def log_message(self, fmt, *args):
        pass  # liniste in consola

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        if path == "/api/puzzle":
            p = pick_puzzle(params)
            return self._json(p if p else {"error": "Niciun puzzle in intervalul cerut."},
                              200 if p else 404)
        if path == "/api/stats":
            return self._json(stats())
        if path == "/api/themes":
            return self._json(THEMES)

        return self._static(path)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self._json({"error": "JSON invalid"}, 400)

        if parsed.path == "/api/result":
            pid = payload.get("id")
            rating = int(payload.get("rating") or 1500)
            ok = bool(payload.get("ok"))
            if not pid:
                return self._json({"error": "lipseste id"}, 400)
            return self._json(record(pid, rating, ok))

        if parsed.path == "/api/reset":
            con = db()
            con.execute("DELETE FROM solved")
            con.execute("DELETE FROM meta")
            con.commit()
            return self._json(stats())

        return self._json({"error": "necunoscut"}, 404)

    def _static(self, path):
        if path == "/":
            path = "/index.html"
        clean = posixpath.normpath(urllib.parse.unquote(path)).lstrip("/")
        full = os.path.join(WEB, clean)
        if not os.path.abspath(full).startswith(os.path.abspath(WEB)) or not os.path.isfile(full):
            self.send_error(404, "Not found")
            return
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        data = open(full, "rb").read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


# Temele Lichess folosite cel mai des, cu eticheta in romana.
THEMES = [
    {"id": "", "label": "Toate temele"},
    {"id": "mateIn1", "label": "Mat în 1"},
    {"id": "mateIn2", "label": "Mat în 2"},
    {"id": "mateIn3", "label": "Mat în 3"},
    {"id": "mate", "label": "Mat (orice)"},
    {"id": "fork", "label": "Furculiță"},
    {"id": "pin", "label": "Țintuire"},
    {"id": "skewer", "label": "Frigăruie"},
    {"id": "discoveredAttack", "label": "Atac descoperit"},
    {"id": "doubleCheck", "label": "Șah dublu"},
    {"id": "sacrifice", "label": "Sacrificiu"},
    {"id": "deflection", "label": "Deviere"},
    {"id": "attraction", "label": "Atragere"},
    {"id": "clearance", "label": "Degajare"},
    {"id": "interference", "label": "Interpunere"},
    {"id": "trappedPiece", "label": "Piesă capturată"},
    {"id": "hangingPiece", "label": "Piesă în priză"},
    {"id": "defensiveMove", "label": "Mutare defensivă"},
    {"id": "quietMove", "label": "Mutare liniștită"},
    {"id": "zugzwang", "label": "Zugzwang"},
    {"id": "promotion", "label": "Promovare"},
    {"id": "underPromotion", "label": "Subpromovare"},
    {"id": "enPassant", "label": "En passant"},
    {"id": "endgame", "label": "Final"},
    {"id": "middlegame", "label": "Joc de mijloc"},
    {"id": "opening", "label": "Deschidere"},
    {"id": "rookEndgame", "label": "Final de turnuri"},
    {"id": "queenEndgame", "label": "Final de dame"},
    {"id": "pawnEndgame", "label": "Final de pioni"},
    {"id": "short", "label": "Scurt (2 mutări)"},
    {"id": "long", "label": "Lung (3 mutări)"},
    {"id": "veryLong", "label": "Foarte lung (4+)"},
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--db", default=DB_PATH)
    args = ap.parse_args()

    globals()["DB_PATH"] = os.path.abspath(args.db)
    db_path = globals()["DB_PATH"]

    if not os.path.exists(db_path):
        raise SystemExit(
            f"Nu exista baza de date: {db_path}\n"
            "Ruleaza mai intai:  python setup.py"
        )

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    total = con.execute("SELECT COUNT(*) c FROM puzzles").fetchone()["c"]
    con.close()

    url = f"http://{args.host}:{args.port}/"
    print(f"{total:,} puzzle-uri incarcate.")
    print(f"Server pornit pe {url}")
    print("Opreste cu Ctrl+C.")
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nOprit.")


if __name__ == "__main__":
    main()
