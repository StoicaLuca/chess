#!/usr/bin/env python3
"""
get_pieces.py — descarca un set de piese de sah cu licenta libera.

Setul implicit e "Cburnett" de pe Wikimedia Commons, licenta CC BY-SA 3.0.
E acelasi set folosit de Lichess: Staunton clasic, curat, vectorial.

    python get_pieces.py

Se poate rula de mai multe ori: cere doar fisierele care lipsesc.
Cu --force le descarca pe toate din nou.

Fisierele ajung in web/pieces/ (wK.svg, wQ.svg, ... bP.svg). Aplicatia le
foloseste automat cand sunt toate 12; altfel ramane pe piesele desenate in cod.

Ca sa te intorci la piesele desenate, sterge folderul web/pieces/.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, "web", "pieces")

API = "https://commons.wikimedia.org/w/api.php"
FILEPATH = "https://commons.wikimedia.org/wiki/Special:FilePath/"

SETS = {
    "cburnett": {
        "wK": "Chess_klt45.svg", "wQ": "Chess_qlt45.svg", "wR": "Chess_rlt45.svg",
        "wB": "Chess_blt45.svg", "wN": "Chess_nlt45.svg", "wP": "Chess_plt45.svg",
        "bK": "Chess_kdt45.svg", "bQ": "Chess_qdt45.svg", "bR": "Chess_rdt45.svg",
        "bB": "Chess_bdt45.svg", "bN": "Chess_ndt45.svg", "bP": "Chess_pdt45.svg",
    },
    "merida": {
        "wK": "Chess_kll45.svg", "wQ": "Chess_qll45.svg", "wR": "Chess_rll45.svg",
        "wB": "Chess_bll45.svg", "wN": "Chess_nll45.svg", "wP": "Chess_pll45.svg",
        "bK": "Chess_kdl45.svg", "bQ": "Chess_qdl45.svg", "bR": "Chess_rdl45.svg",
        "bB": "Chess_bdl45.svg", "bN": "Chess_ndl45.svg", "bP": "Chess_pdl45.svg",
    },
}

CREDIT = {
    "cburnett": "Piese: setul Cburnett de pe Wikimedia Commons, licenta CC BY-SA 3.0.",
    "merida": "Piese: setul Merida de pe Wikimedia Commons, licenta CC BY-SA 3.0.",
}

# Wikimedia cere un User-Agent descriptiv; cu unul generic limiteaza mai agresiv.
UA = "PuzzleTrainerPieces/1.1 (proiect personal, uz necomercial; Python urllib)"

PAUSE = 0.8        # pauza intre fisiere
TRIES = 6          # incercari per fisier


def get(url, timeout=45):
    """Descarca, cu reincercari daca serverul ne limiteaza (429 / 503)."""
    delay = 3.0
    for attempt in range(1, TRIES + 1):
        req = urllib.request.Request(url, headers={
            "User-Agent": UA,
            "Accept": "*/*",
            "Accept-Encoding": "identity",
        })
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503) or attempt == TRIES:
                raise
            wait = delay
            ra = e.headers.get("Retry-After") if e.headers else None
            if ra:
                try:
                    wait = max(wait, float(ra))
                except ValueError:
                    pass
            print(f"       limitat (HTTP {e.code}), astept {wait:.0f}s "
                  f"si reincerc ({attempt}/{TRIES - 1})...", flush=True)
            time.sleep(wait)
            delay *= 2


def direct_urls(remote_names):
    """Un singur apel la API-ul Commons ne da adresele reale de pe CDN.

    Descarcarea de pe upload.wikimedia.org (CDN-ul lor) e mult mai tolerabila
    decat 12 cereri catre Special:FilePath, care trec prin aplicatia web si
    declanseaza limitarea. Daca apelul esueaza, ne intoarcem la Special:FilePath.
    """
    titles = "|".join("File:" + n for n in remote_names)
    q = urllib.parse.urlencode({
        "action": "query", "format": "json", "prop": "imageinfo",
        "iiprop": "url", "titles": titles,
    })
    try:
        data = json.loads(get(API + "?" + q, timeout=30).decode("utf-8"))
    except Exception as e:
        print(f"  (nu am putut interoga API-ul Commons: {e})")
        print("  folosesc adresele de rezerva\n")
        return {}

    out = {}
    for page in (data.get("query", {}).get("pages") or {}).values():
        title = (page.get("title") or "").removeprefix("File:")
        info = page.get("imageinfo") or []
        if title and info and info[0].get("url"):
            out[title] = info[0]["url"]
    return out


def already(local):
    """Fisierul e deja descarcat si chiar e un SVG? (dimensiunea nu e un criteriu
    bun: un SVG valid poate fi mic, si l-am tot redescarca degeaba)"""
    path = os.path.join(DEST, local + ".svg")
    if not os.path.isfile(path):
        return False
    try:
        with open(path, "rb") as f:
            return b"<svg" in f.read(2000).lower()
    except OSError:
        return False


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    force = "--force" in sys.argv
    name = args[0] if args else "cburnett"
    if name not in SETS:
        sys.exit(f"Set necunoscut: {name}. Disponibile: {', '.join(SETS)}")

    files = SETS[name]
    os.makedirs(DEST, exist_ok=True)
    print(f"Descarc setul '{name}' ({len(files)} fisiere) in {DEST}\n")

    missing = [(loc, rem) for loc, rem in files.items() if force or not already(loc)]
    have = len(files) - len(missing)
    if have:
        print(f"  {have} fisiere exista deja, le sar peste\n")
    if not missing:
        print("Toate cele 12 sunt deja la locul lor. Nimic de facut.")
        return

    urls = direct_urls([rem for _, rem in missing])

    okc = have
    for n, (local, remote) in enumerate(missing):
        if n:
            time.sleep(PAUSE)
        url = urls.get(remote) or (FILEPATH + remote)
        try:
            data = get(url)
        except urllib.error.HTTPError as e:
            print(f"  {local:3s}  EROARE HTTP {e.code}")
            continue
        except Exception as e:
            print(f"  {local:3s}  EROARE: {e}")
            continue

        if b"<svg" not in data[:2000].lower():
            print(f"  {local:3s}  raspunsul nu pare SVG, sar peste")
            continue

        with open(os.path.join(DEST, local + ".svg"), "wb") as f:
            f.write(data)
        okc += 1
        print(f"  {local:3s}  {len(data):>7,} octeti", flush=True)

    print()
    if okc == len(files):
        with open(os.path.join(DEST, "LICENSE.txt"), "w", encoding="utf-8") as f:
            f.write(CREDIT[name] + "\n")
            f.write("https://creativecommons.org/licenses/by-sa/3.0/\n")
        print("Gata. " + CREDIT[name])
        print("Reincarca pagina in browser (Ctrl+Shift+R) si vei vedea noile piese.")
    else:
        print(f"S-au descarcat {okc} din {len(files)} fisiere.")
        print("Aplicatia ramane pe piesele desenate pana cand sunt toate 12.")
        print("\nRuleaza din nou 'python get_pieces.py' — cere doar ce lipseste.")
        print("Daca te limiteaza iar, asteapta un minut intre rulari.")
        print("\nVarianta manuala: intra pe")
        print("  https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces")
        print(f"descarca cele 12 fisiere si pune-le in {DEST}")
        print("cu numele wK.svg wQ.svg wR.svg wB.svg wN.svg wP.svg si bK.svg ... bP.svg")


if __name__ == "__main__":
    main()
