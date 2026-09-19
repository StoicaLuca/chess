#!/usr/bin/env python3
"""
setup.py — descarca baza de puzzle-uri Lichess (licenta CC0) si o transforma
intr-o baza SQLite locala, indexata pentru extragere rapida si aleatorie.

Rulare normala (descarca ~300 MB, scrie ~1,3 GB in puzzles.db):
    python setup.py

Daca ai deja fisierul descarcat manual:
    python setup.py --csv C:\\cale\\catre\\lichess_db_puzzle.csv.zst
    python setup.py --csv C:\\cale\\catre\\lichess_db_puzzle.csv

Test rapid, doar primele 50.000 de puzzle-uri:
    python setup.py --limit 50000
"""

import argparse
import csv
import io
import os
import random
import sqlite3
import sys
import time
import urllib.request

URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "puzzles.db")
ARCHIVE = os.path.join(HERE, "lichess_db_puzzle.csv.zst")

SCHEMA = """
PRAGMA journal_mode = OFF;
PRAGMA synchronous = OFF;
DROP TABLE IF EXISTS puzzles;
CREATE TABLE puzzles (
    id         TEXT PRIMARY KEY,
    fen        TEXT NOT NULL,
    moves      TEXT NOT NULL,
    rating     INTEGER NOT NULL,
    deviation  INTEGER,
    popularity INTEGER,
    plays      INTEGER,
    themes     TEXT,
    url        TEXT,
    openings   TEXT,
    rnd        REAL NOT NULL
);
"""

# Tabelul de progres supravietuieste unui re-import al puzzle-urilor.
PROGRESS_SCHEMA = """
CREATE TABLE IF NOT EXISTS solved (
    id        TEXT PRIMARY KEY,
    ok        INTEGER NOT NULL,
    at        REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
    k TEXT PRIMARY KEY,
    v TEXT
);
"""


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.1f} {unit}"
        n /= 1024


def download(url, dest):
    print(f"Descarc {url}")
    print("(~300 MB — dureaza cateva minute pe o conexiune normala)")
    start = time.time()
    last = [0.0]

    def hook(blocks, block_size, total):
        got = blocks * block_size
        now = time.time()
        if now - last[0] < 0.5 and got < total:
            return
        last[0] = now
        if total > 0:
            pct = min(100.0, got * 100.0 / total)
            speed = got / max(0.001, now - start)
            sys.stdout.write(f"\r  {pct:5.1f}%  {human(min(got, total))} / {human(total)}  ({human(speed)}/s)   ")
        else:
            sys.stdout.write(f"\r  {human(got)}   ")
        sys.stdout.flush()

    tmp = dest + ".part"
    urllib.request.urlretrieve(url, tmp, hook)
    sys.stdout.write("\n")
    os.replace(tmp, dest)
    print(f"Gata in {time.time() - start:.0f}s -> {dest}")


def open_text(path):
    """Intoarce un stream text din .csv sau .csv.zst."""
    if path.endswith(".zst"):
        try:
            import zstandard
        except ImportError:
            sys.exit(
                "Lipseste pachetul 'zstandard', necesar pentru fisierul .zst.\n"
                "Instaleaza-l cu:  pip install zstandard\n"
                "Sau decomprima fisierul manual si ruleaza cu --csv catre .csv"
            )
        fh = open(path, "rb")
        reader = zstandard.ZstdDecompressor().stream_reader(fh)
        return io.TextIOWrapper(reader, encoding="utf-8", newline="")
    return open(path, "r", encoding="utf-8", newline="")


def build(csv_path, db_path, limit=None):
    if os.path.exists(db_path):
        # pastram progresul existent
        keep = sqlite3.connect(db_path)
        keep.executescript(PROGRESS_SCHEMA)
        solved = keep.execute("SELECT id, ok, at FROM solved").fetchall()
        meta = keep.execute("SELECT k, v FROM meta").fetchall()
        keep.close()
    else:
        solved, meta = [], []

    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA)
    con.executescript(PROGRESS_SCHEMA)

    rng = random.Random(20260914)
    n = 0
    t0 = time.time()
    batch = []

    with open_text(csv_path) as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            try:
                rating = int(row["Rating"])
            except (KeyError, ValueError):
                continue
            batch.append((
                row["PuzzleId"],
                row["FEN"],
                row["Moves"],
                rating,
                int(row.get("RatingDeviation") or 0),
                int(row.get("Popularity") or 0),
                int(row.get("NbPlays") or 0),
                row.get("Themes") or "",
                row.get("GameUrl") or "",
                row.get("OpeningTags") or "",
                rng.random(),
            ))
            n += 1
            if len(batch) >= 20000:
                con.executemany(
                    "INSERT OR REPLACE INTO puzzles VALUES (?,?,?,?,?,?,?,?,?,?,?)", batch
                )
                batch.clear()
                sys.stdout.write(f"\r  importate {n:,} puzzle-uri...")
                sys.stdout.flush()
            if limit and n >= limit:
                break

    if batch:
        con.executemany("INSERT OR REPLACE INTO puzzles VALUES (?,?,?,?,?,?,?,?,?,?,?)", batch)
    sys.stdout.write(f"\r  importate {n:,} puzzle-uri.            \n")

    print("  construiesc indecsii...")
    con.execute("CREATE INDEX idx_rating_rnd ON puzzles (rating, rnd)")
    con.execute("CREATE INDEX idx_rnd ON puzzles (rnd)")

    if solved:
        con.executemany("INSERT OR REPLACE INTO solved VALUES (?,?,?)", solved)
        print(f"  progres pastrat: {len(solved):,} puzzle-uri rezolvate anterior")
    if meta:
        con.executemany("INSERT OR REPLACE INTO meta VALUES (?,?)", meta)

    con.commit()
    lo, hi = con.execute("SELECT MIN(rating), MAX(rating) FROM puzzles").fetchone()
    con.close()

    size = os.path.getsize(db_path)
    print(f"\nGata in {time.time() - t0:.0f}s")
    print(f"  {n:,} puzzle-uri, rating {lo}–{hi}")
    print(f"  {db_path}  ({human(size)})")


def main():
    ap = argparse.ArgumentParser(description="Construieste baza locala de puzzle-uri.")
    ap.add_argument("--csv", help="fisier .csv sau .csv.zst deja descarcat")
    ap.add_argument("--limit", type=int, help="importa doar primele N puzzle-uri")
    ap.add_argument("--db", default=DB_PATH, help="unde se scrie baza SQLite")
    ap.add_argument("--keep-archive", action="store_true",
                    help="nu sterge arhiva .zst dupa import")
    args = ap.parse_args()

    src = args.csv
    downloaded = False
    if not src:
        if os.path.exists(ARCHIVE):
            print(f"Folosesc arhiva existenta: {ARCHIVE}")
            src = ARCHIVE
        else:
            download(URL, ARCHIVE)
            src = ARCHIVE
            downloaded = True

    if not os.path.exists(src):
        sys.exit(f"Nu gasesc fisierul: {src}")

    print(f"\nImport din {src}")
    build(src, args.db, args.limit)

    if downloaded and not args.keep_archive:
        try:
            os.remove(ARCHIVE)
            print(f"  arhiva stearsa ({os.path.basename(ARCHIVE)})")
        except OSError:
            pass

    print("\nPorneste aplicatia cu:  python server.py")


if __name__ == "__main__":
    main()
