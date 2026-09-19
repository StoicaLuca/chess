# Puzzle Trainer

Antrenament nelimitat pe puzzle-uri de șah, rulat local pe calculatorul tău.
Baza de date: **Lichess puzzle database**, licență **CC0** (domeniu public) —
peste 6 milioane de puzzle-uri, fiecare cu rating, teme și soluție.

Nu are nevoie de internet după primul import. Nu are nicio dependință în afară
de Python (și `zstandard`, doar pentru decomprimarea arhivei).

---

## Pornire în două comenzi

Deschide un terminal în folderul ăsta (în PyCharm: click dreapta pe folder →
*Open in* → *Terminal*) și rulează:

```
pip install zstandard
python setup.py
```

`setup.py` descarcă ~300 MB și construiește `puzzles.db` (~1,3 GB).
Durează câteva minute — o singură dată.

Apoi, de fiecare dată când vrei să joci:

```
python server.py
```

Se deschide singur în browser la `http://127.0.0.1:8000`.
Oprești cu `Ctrl+C` în terminal.

Pe Windows poți să dai direct dublu-click pe **`start.bat`**.

---

## Aspect: piese și mărimea tablei

În panoul din dreapta, jos, ai două reglaje. Amândouă se țin minte în browser,
deci rămân alese și după ce închizi pagina.

**Piese** — zece seturi incluse, plus cele desenate în cod:

| Set | Autor | Licență |
|-----|-------|---------|
| Maestro *(implicit)* | sadsnake1 | CC BY-NC-SA 4.0 |
| Merida | Armando Hernandez Marroquin | GPLv2+ |
| Alpha | Eric Bentzen | gratuit pentru uz personal |
| Staunty | sadsnake1 | CC BY-NC-SA 4.0 |
| Cardinal | sadsnake1 | CC BY-NC-SA 4.0 |
| Chessnut | Alexis Luengas | Apache 2.0 |
| California | Jerry S. | CC BY-NC-SA 4.0 |
| Fresca | sadsnake1 | CC BY-NC-SA 4.0 |
| Gioco | sadsnake1 | CC BY-NC-SA 4.0 |
| Tatiana | sadsnake1 | CC BY-NC-SA 4.0 |

Fișierele stau în `web/pieces/<set>/`. Ca să adaugi un set nou, pui cele 12
SVG-uri (`wK.svg`, `wQ.svg`, …, `bP.svg`) într-un folder acolo și îi adaugi o
linie în `PACKS`, la începutul lui `web/pieces.js`. Atât.

Seturile marcate **NC** sunt libere pentru uz personal, dar nu comercial. Dacă
vreodată publici aplicația contra cost, rămân Merida (GPLv2+) și Chessnut
(Apache 2.0), care n-au restricția asta.

**Mărimea tablei** — cursor de la 70% la 140%. Nu e o dimensiune fixă în pixeli:
se înmulțește cu înălțimea disponibilă a ferestrei, deci arată la fel pe orice
ecran. Peste 100% tabla poate depăși înălțimea ferestrei și pagina capătă scroll
— e intenționat, ca să poți merge cât de mare vrei.

### Setul vechi, descărcat cu get_pieces.py

```
python get_pieces.py
```

Descarcă setul **Cburnett** (Wikimedia Commons, CC BY-SA 3.0) direct în
`web/pieces/`, nu într-un subfolder. Dacă există, apare în listă ca „Cburnett".
Nu mai e necesar — seturile de mai sus sunt deja incluse.

---

## Dacă descărcarea automată nu merge

Descarcă manual fișierul de aici:

> https://database.lichess.org/#puzzles
> → `lichess_db_puzzle.csv.zst`

Pune-l în folderul proiectului și rulează:

```
python setup.py --csv lichess_db_puzzle.csv.zst
```

## Test rapid, fără să aștepți tot importul

```
python setup.py --limit 50000
```

Importă doar primele 50.000 de puzzle-uri (câteva secunde). Poți rula
`python setup.py` complet mai târziu — progresul tău (rating, serie,
puzzle-uri rezolvate) se păstrează la re-import.

---

## Cum funcționează

Fiecare puzzle pornește dintr-o poziție reală de partidă. Adversarul face
prima mutare automat, apoi e rândul tău. Trebuie să găsești **cea mai bună**
mutare, nu doar una bună — la fel ca pe Lichess sau chess.com.

- O mutare care dă mat e acceptată chiar dacă diferă de linia din baza de date.
- O mutare greșită **rămâne pe tablă** până o anulezi tu, cu butonul *Înapoi*
  sau cu `←`. Între timp o săgeată roșie îți arată replica adversarului —
  captura care câștigă material sau matul — cu explicația scrisă alături.
  Puzzle-ul se contorizează ca ratat.
- Nu se trece automat la puzzle-ul următor. Apeși tu săgeata verde când vrei.
- **Indiciu** îți arată ce piesă să muți (contează tot ca ratat).
- Ratingul tău se ajustează după fiecare puzzle, cu formula Elo. `auto`
  potrivește intervalul de dificultate cu ratingul tău curent.

### Comenzi

| Tastă / gest | Acțiune |
|--------------|---------|
| `←` / `→` | O mutare înapoi / înainte prin linia puzzle-ului |
| `N` sau `Enter` | Puzzle nou |
| `H` | Indiciu |
| `S` | Arată soluția |
| `R` | Reia puzzle-ul de la început |
| click dreapta + tragere | Desenează o săgeată. Pentru saltul calului traseul e în L, nu diagonală. |
| click dreapta pe un pătrat | Îl marchează cu roșu |
| aceeași săgeată din nou | O șterge (celelalte rămân) |
| click stânga pe o piesă | Șterge toate săgețile și marcajele |
| `←` după o mutare greșită | Anulează mutarea și te întoarce la poziție |

Piesele alunecă animat între pătrate; nu sar. După ce rezolvi, butoanele devin
**rewind** (înapoi la poziția inițială) și **următorul**, ca să poți derula
linia cu `←` / `→` dacă vrei să înțelegi o mutare.

---

## Structura proiectului

```
chess-puzzles/
├── setup.py          descarcă baza și construiește puzzles.db
├── get_pieces.py     descarcă setul de piese Cburnett (opțional)
├── server.py         serverul local + API JSON (doar stdlib)
├── start.bat         lansator pentru Windows
├── puzzles.db        se creează la primul setup (nu e în repo)
└── web/
    ├── index.html
    ├── style.css
    ├── pieces.js     lista seturilor + piesele desenate în cod (rezerva)
    ├── pieces/       seturile de piese, câte un folder de fiecare
    ├── chess-core.js generator complet de mutări legale, scris de la zero
    └── app.js        logica de antrenament, tabla, săgețile, animația
```

`chess-core.js` nu folosește nicio bibliotecă externă. Validat cu teste
**perft** pe pozițiile standard (startpos, Kiwipete, poziții 3–6), inclusiv
rocadă, en passant, promovare și subpromovare.

### API-ul serverului

| Rută | Ce face |
|------|---------|
| `GET /api/puzzle?min=&max=&theme=&unseen=` | un puzzle aleatoriu din filtru |
| `GET /api/stats` | rating, serie, număr rezolvate |
| `GET /api/themes` | lista de teme |
| `POST /api/result` | `{id, rating, ok}` — înregistrează rezultatul |
| `POST /api/reset` | șterge tot progresul |

Selecția aleatorie nu folosește `ORDER BY RANDOM()`, care ar scana toată baza
la fiecare cerere. Fiecare puzzle are o coloană `rnd`; serverul sare la un pivot
aleatoriu și ia primul rând potrivit, în ordinea indexului pe `rnd`. Sub o
milisecundă pe 6 milioane de rânduri. Pentru intervale de dificultate foarte
înguste comută pe indexul `(rating, rnd)`, unde sunt puține rânduri de sortat.

---

## Opțiuni

```
python server.py --port 9000        alt port
python server.py --no-browser       nu deschide browserul
python setup.py --keep-archive      nu șterge arhiva .zst după import
python setup.py --db D:\alt\loc.db  altă locație pentru baza de date
```

---

## Licență și atribuire

Puzzle-urile provin din [baza de date Lichess](https://database.lichess.org/),
publicată sub **Creative Commons CC0** — liberă de folosit, inclusiv comercial.
Codul din proiect e scris de la zero; interfața nu reproduce designul niciunui
site comercial de șah.

Seturile de piese provin din [depozitul Lichess](https://github.com/lichess-org/lila/tree/master/public/piece);
autorul și licența fiecăruia sunt în tabelul de mai sus și apar în subsolul
aplicației, sub tabla de joc, pentru setul activ.
