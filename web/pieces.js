/* pieces.js — set Staunton desenat de la zero: corpuri late, gulere marcate,
   contur gros. viewBox 45x45, talpa la y≈39. Culorile vin din CSS.          */

/* talpa comună: o treaptă îngustă peste un picior lat */
const BASE =
  `<path d="M11.8 31.4h21.4l1.4 2.8H10.4z"/>
   <path d="M7.4 34.2h30.2a2.3 2.3 0 0 1 2.3 2.3v2.1a.8.8 0 0 1-.8.8H5.9a.8.8 0 0 1-.8-.8v-2.1a2.3 2.3 0 0 1 2.3-2.3z"/>`;

const PIECE_PATHS = {

  p: `<circle cx="22.5" cy="11.2" r="5.9"/>
      <path d="M22.5 16.4c-3.05 0-5.5 1.8-5.5 4 0 1.25.8 2.35 2.05 3.05
               -3.05 2.5-5.05 5.15-5.85 7.95h18.6c-.8-2.8-2.8-5.45-5.85-7.95
               1.25-.7 2.05-1.8 2.05-3.05 0-2.2-2.45-4-5.5-4z"/>
      ${BASE}`,

  r: `<path d="M11.4 13.4V7h5.2v2.7h3.5V7h4.8v2.7h3.5V7h5.2v6.4l-3.1 2.9v10.6
               l3.6 3.4v1.1H10.9v-1.1l3.6-3.4V16.3z"/>
      ${BASE}
      <path d="M14.5 16.3h16"     class="band"/>
      <path d="M13.9 26.9h17.2"   class="band"/>
      <path d="M17 19.2v5.4M22.5 19.2v5.4M28 19.2v5.4" class="cut"/>`,

  b: `<circle cx="22.5" cy="6.8" r="2.9"/>
      <path d="M22.5 9.2c-4.45 0-8.05 4.75-8.05 10.6 0 3.4 1.25 6.4 3.25 8.2
               h9.6c2-1.8 3.25-4.8 3.25-8.2 0-5.85-3.6-10.6-8.05-10.6z"/>
      <path d="M13.5 27.9h18l1.1 3.6H12.4z"/>
      ${BASE}
      <path d="M19.4 13l6.2 6.6" class="cut"/>`,

  n: `<path d="M25.1 6.9c3.3 0 6 1.7 7.7 4.6 2.2 3.8 3.2 9 3.2 15.3v4.7H11.9
               v-1.6c0-4.2 1.3-7.2 3.6-9.5 2-2 4.5-3.3 5.9-4.8.9-1 1.1-1.9.7-2.5
               -.4-.6-1.3-.6-2.1 0l-3.5 2.8c-1.5 1.2-3.5.4-3.5-1.5
               0-3 2-6 5-8l2-1c1.3-.6 2.9-.9 5.1-.9z"/>
      ${BASE}
      <path d="M31.3 11.9c1.6 2.5 2.6 5.8 3 9.5" class="band"/>
      <path d="M20.4 20.6c-1.6 1.4-2.8 2.9-3.5 4.6" class="cut"/>
      <circle cx="19.2" cy="15.7" r="1.45" class="eye"/>`,

  q: `<circle cx="22.5" cy="5.9"  r="2.5"/>
      <circle cx="9.3"  cy="11.2" r="2.3"/>
      <circle cx="35.7" cy="11.2" r="2.3"/>
      <circle cx="15.3" cy="7.6"  r="2.1"/>
      <circle cx="29.7" cy="7.6"  r="2.1"/>
      <path d="M9.6 13.3l3.6 12.6h18.6l3.6-12.6-6.3 5.2-2.7-9.6-3.8 10
               -3.8-10-2.7 9.6z"/>
      <path d="M12.9 25.9c3.8-1.3 15.4-1.3 19.2 0 1 1.7 1.6 3.5 1.8 5.5H11.1
               c.2-2 .8-3.8 1.8-5.5z"/>
      ${BASE}
      <path d="M13.9 28.6c4.2-1.1 12.9-1.1 17.1 0" class="band"/>`,

  k: `<path d="M22.5 3.6v7.6M18.9 6.9h7.2" class="cross"/>
      <path d="M22.5 11.9c-3.05 0-5.5 2.1-5.5 4.7 0 2 1.45 3.7 3.5 4.4
               -4.05.85-7.3 2.8-9.25 5.4l1.25 5.8h19l1.25-5.8
               c-1.95-2.6-5.2-4.55-9.25-5.4 2.05-.7 3.5-2.4 3.5-4.4
               0-2.6-2.45-4.7-5.5-4.7z"/>
      ${BASE}
      <path d="M13.3 27.9c5.2-1.7 13.2-1.7 18.4 0" class="band"/>
      <path d="M18.6 21.1h7.8" class="cut"/>`,
};

/* ------------------------------------------------------------ seturi --- */
/*
   Piesele pot veni din trei locuri:
     1. web/pieces/<set>/   - seturile descarcate (vezi lista de mai jos)
     2. web/pieces/         - setul vechi, pus direct in folder de get_pieces.py
     3. desenate in cod     - caile de mai sus, daca nu exista niciun fisier

   Setul ales se tine in localStorage, deci ramane si dupa ce inchizi pagina.
*/

const PACKS = [
  { id: "maestro",    name: "Maestro",    credit: "sadsnake1 · CC BY-NC-SA 4.0" },
  { id: "merida",     name: "Merida",     credit: "Armando Hernandez Marroquin · GPLv2+" },
  { id: "alpha",      name: "Alpha",      credit: "Eric Bentzen · gratuit pentru uz personal" },
  { id: "staunty",    name: "Staunty",    credit: "sadsnake1 · CC BY-NC-SA 4.0" },
  { id: "cardinal",   name: "Cardinal",   credit: "sadsnake1 · CC BY-NC-SA 4.0" },
  { id: "chessnut",   name: "Chessnut",   credit: "Alexis Luengas · Apache 2.0" },
  { id: "california", name: "California", credit: "Jerry S. · CC BY-NC-SA 4.0" },
  { id: "fresca",     name: "Fresca",     credit: "sadsnake1 · CC BY-NC-SA 4.0" },
  { id: "gioco",      name: "Gioco",      credit: "sadsnake1 · CC BY-NC-SA 4.0" },
  { id: "tatiana",    name: "Tatiana",    credit: "sadsnake1 · CC BY-NC-SA 4.0" },
  { id: "cburnett",   name: "Cburnett",   credit: "Colin M.L. Burnett · GPLv2+", flat: true },
  { id: "drawn",      name: "Desenate în cod", credit: "" },
];

const LETTER = { k: "K", q: "Q", r: "R", b: "B", n: "N", p: "P" };

let PACK = "maestro";
let hasFlatFolder = false;          // exista web/pieces/wK.svg (setul vechi)?

/* Serverul ne spune daca folderul vechi web/pieces/ are fisiere in el.
   Daca nu are, scoatem "Cburnett" din lista, ca sa nu poti alege ceva gol. */
function useFiles(on) {
  hasFlatFolder = !!on;
  if (!hasFlatFolder && PACK === "cburnett") PACK = "maestro";
}

function packs() { return PACKS.filter((p) => p.id !== "cburnett" || hasFlatFolder); }
function pack() { return PACK; }
function currentPack() { return PACKS.find((p) => p.id === PACK) || PACKS[0]; }
function credit() { return currentPack().credit; }

function setPack(id) {
  if (PACKS.some((p) => p.id === id)) PACK = id;
}

/* preserveAspectRatio / object-fit: chiar daca vreodata cutia piesei n-ar mai
   fi patrata, desenul ramane nedeformat in loc sa se intinda.               */
function pieceSVG(type, color) {
  const pk = currentPack();

  if (pk.id !== "drawn") {
    const dir = pk.flat ? "pieces" : `pieces/${pk.id}`;
    return `<img class="piece img ${color}" draggable="false" alt=""
                 src="${dir}/${color}${LETTER[type]}.svg">`;
  }

  return `<svg class="piece ${color}" viewBox="0 0 45 45"
               preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <g class="shape">${PIECE_PATHS[type]}</g>
          </svg>`;
}

window.PIECES = { pieceSVG, PIECE_PATHS, useFiles, packs, pack, setPack, credit };
