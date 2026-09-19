/* chess-core.js — generator complet de mutări legale, fără dependințe.
   Reprezentare: board = Array(64); index 0 = a8, index 63 = h1.
   Piesă: { t: 'p'|'n'|'b'|'r'|'q'|'k', c: 'w'|'b' }                        */

const FILES = "abcdefgh";

function idx(file, rank) { return (7 - rank) * 8 + file; }
function fileOf(i) { return i % 8; }
function rankOf(i) { return 7 - ((i / 8) | 0); }
function sqName(i) { return FILES[fileOf(i)] + (rankOf(i) + 1); }
function sqFromName(s) { return idx(FILES.indexOf(s[0]), parseInt(s[1], 10) - 1); }
function other(c) { return c === "w" ? "b" : "w"; }

const DIRS = {
  n: [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]],
  b: [[1, 1], [1, -1], [-1, -1], [-1, 1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
};
DIRS.q = DIRS.b.concat(DIRS.r);
DIRS.k = DIRS.q;

/* ---------------------------------------------------------------- FEN --- */

function parseFEN(fen) {
  const parts = fen.trim().split(/\s+/);
  const board = new Array(64).fill(null);
  let i = 0;
  for (const ch of parts[0]) {
    if (ch === "/") continue;
    if (ch >= "1" && ch <= "8") { i += +ch; continue; }
    const c = ch === ch.toUpperCase() ? "w" : "b";
    board[i++] = { t: ch.toLowerCase(), c };
  }
  return {
    board,
    turn: parts[1] || "w",
    castling: parts[2] && parts[2] !== "-" ? parts[2] : "",
    ep: parts[3] && parts[3] !== "-" ? sqFromName(parts[3]) : -1,
    half: parts[4] ? +parts[4] : 0,
    full: parts[5] ? +parts[5] : 1,
  };
}

function toFEN(st) {
  let rows = [];
  for (let r = 0; r < 8; r++) {
    let row = "", empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = st.board[r * 8 + f];
      if (!p) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += p.c === "w" ? p.t.toUpperCase() : p.t;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return [
    rows.join("/"),
    st.turn,
    st.castling || "-",
    st.ep >= 0 ? sqName(st.ep) : "-",
    st.half,
    st.full,
  ].join(" ");
}

function cloneState(st) {
  return {
    board: st.board.slice(),
    turn: st.turn,
    castling: st.castling,
    ep: st.ep,
    half: st.half,
    full: st.full,
  };
}

/* ------------------------------------------------------------- ATTACKS --- */

/* Este pătratul `sq` atacat de o piesă de culoarea `by`? */
function isAttacked(board, sq, by) {
  const f = fileOf(sq), r = rankOf(sq);

  // pioni: un pion de culoarea `by` atacă `sq` dacă stă cu o mutare "în spate"
  const pdir = by === "w" ? -1 : 1;           // de unde vine pionul
  for (const df of [-1, 1]) {
    const nf = f + df, nr = r + pdir;
    if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
    const p = board[idx(nf, nr)];
    if (p && p.c === by && p.t === "p") return true;
  }

  // cai
  for (const [df, dr] of DIRS.n) {
    const nf = f + df, nr = r + dr;
    if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
    const p = board[idx(nf, nr)];
    if (p && p.c === by && p.t === "n") return true;
  }

  // rege
  for (const [df, dr] of DIRS.k) {
    const nf = f + df, nr = r + dr;
    if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
    const p = board[idx(nf, nr)];
    if (p && p.c === by && p.t === "k") return true;
  }

  // glisante: nebun/damă pe diagonale, turn/damă pe linii
  for (const [dirs, types] of [[DIRS.b, "bq"], [DIRS.r, "rq"]]) {
    for (const [df, dr] of dirs) {
      let nf = f + df, nr = r + dr;
      while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        const p = board[idx(nf, nr)];
        if (p) {
          if (p.c === by && types.includes(p.t)) return true;
          break;
        }
        nf += df; nr += dr;
      }
    }
  }
  return false;
}

function kingSquare(board, c) {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.c === c && p.t === "k") return i;
  }
  return -1;
}

function inCheck(st, c) {
  const col = c || st.turn;
  const k = kingSquare(st.board, col);
  return k >= 0 && isAttacked(st.board, k, other(col));
}

/* --------------------------------------------------------- GENERARE --- */

function pushPawn(list, from, to, promo, flag) {
  if (promo) {
    for (const p of ["q", "r", "b", "n"]) list.push({ from, to, promotion: p, flag });
  } else {
    list.push({ from, to, flag });
  }
}

/* Mutări pseudo-legale (fără verificarea șahului propriu). */
function pseudoMoves(st, onlyFrom) {
  const out = [];
  const us = st.turn, them = other(us);

  for (let i = 0; i < 64; i++) {
    const p = st.board[i];
    if (!p || p.c !== us) continue;
    if (onlyFrom !== undefined && onlyFrom !== null && i !== onlyFrom) continue;
    const f = fileOf(i), r = rankOf(i);

    if (p.t === "p") {
      const dir = us === "w" ? 1 : -1;
      const start = us === "w" ? 1 : 6;
      const last = us === "w" ? 7 : 0;
      const nr = r + dir;
      if (nr >= 0 && nr < 8 && !st.board[idx(f, nr)]) {
        pushPawn(out, i, idx(f, nr), nr === last);
        const nr2 = r + 2 * dir;
        if (r === start && !st.board[idx(f, nr2)]) out.push({ from: i, to: idx(f, nr2), flag: "big" });
      }
      for (const df of [-1, 1]) {
        const nf = f + df;
        if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
        const t = idx(nf, nr);
        const q = st.board[t];
        if (q && q.c === them) pushPawn(out, i, t, nr === last);
        else if (t === st.ep) out.push({ from: i, to: t, flag: "ep" });
      }
      continue;
    }

    if (p.t === "n" || p.t === "k") {
      for (const [df, dr] of DIRS[p.t]) {
        const nf = f + df, nr = r + dr;
        if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
        const t = idx(nf, nr), q = st.board[t];
        if (!q || q.c === them) out.push({ from: i, to: t });
      }
      continue;
    }

    for (const [df, dr] of DIRS[p.t]) {
      let nf = f + df, nr = r + dr;
      while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        const t = idx(nf, nr), q = st.board[t];
        if (!q) out.push({ from: i, to: t });
        else { if (q.c === them) out.push({ from: i, to: t }); break; }
        nf += df; nr += dr;
      }
    }
  }

  // rocade
  const kSq = us === "w" ? sqFromName("e1") : sqFromName("e8");
  const kingHere = st.board[kSq];
  if (kingHere && kingHere.t === "k" && kingHere.c === us &&
      (onlyFrom === undefined || onlyFrom === null || onlyFrom === kSq)) {
    const rights = us === "w" ? ["K", "Q"] : ["k", "q"];
    const rank = us === "w" ? 0 : 7;
    if (st.castling.includes(rights[0])) {          // mică: e→g, turn h→f
      const fSq = idx(5, rank), gSq = idx(6, rank), hSq = idx(7, rank);
      const rook = st.board[hSq];
      if (rook && rook.t === "r" && rook.c === us && !st.board[fSq] && !st.board[gSq] &&
          !isAttacked(st.board, kSq, them) && !isAttacked(st.board, fSq, them) &&
          !isAttacked(st.board, gSq, them)) {
        out.push({ from: kSq, to: gSq, flag: "kcastle" });
      }
    }
    if (st.castling.includes(rights[1])) {          // mare: e→c, turn a→d
      const dSq = idx(3, rank), cSq = idx(2, rank), bSq = idx(1, rank), aSq = idx(0, rank);
      const rook = st.board[aSq];
      if (rook && rook.t === "r" && rook.c === us && !st.board[dSq] && !st.board[cSq] && !st.board[bSq] &&
          !isAttacked(st.board, kSq, them) && !isAttacked(st.board, dSq, them) &&
          !isAttacked(st.board, cSq, them)) {
        out.push({ from: kSq, to: cSq, flag: "qcastle" });
      }
    }
  }

  return out;
}

/* Aplică o mutare și întoarce o stare nouă. Nu validează legalitatea. */
function makeMove(st, mv) {
  const n = cloneState(st);
  const p = n.board[mv.from];
  const us = p.c, them = other(us);
  const captured = n.board[mv.to];

  n.board[mv.to] = mv.promotion ? { t: mv.promotion, c: us } : p;
  n.board[mv.from] = null;

  if (mv.flag === "ep") {
    const capRank = rankOf(mv.to) + (us === "w" ? -1 : 1);
    n.board[idx(fileOf(mv.to), capRank)] = null;
  }
  if (mv.flag === "kcastle") {
    const rank = us === "w" ? 0 : 7;
    n.board[idx(5, rank)] = n.board[idx(7, rank)];
    n.board[idx(7, rank)] = null;
  }
  if (mv.flag === "qcastle") {
    const rank = us === "w" ? 0 : 7;
    n.board[idx(3, rank)] = n.board[idx(0, rank)];
    n.board[idx(0, rank)] = null;
  }

  // drepturi de rocadă
  let cast = n.castling;
  const drop = (ch) => { cast = cast.replace(ch, ""); };
  if (p.t === "k") { if (us === "w") { drop("K"); drop("Q"); } else { drop("k"); drop("q"); } }
  if (p.t === "r") {
    const nm = sqName(mv.from);
    if (nm === "h1") drop("K"); if (nm === "a1") drop("Q");
    if (nm === "h8") drop("k"); if (nm === "a8") drop("q");
  }
  if (captured && captured.t === "r") {
    const nm = sqName(mv.to);
    if (nm === "h1") drop("K"); if (nm === "a1") drop("Q");
    if (nm === "h8") drop("k"); if (nm === "a8") drop("q");
  }
  n.castling = cast;

  n.ep = mv.flag === "big" ? idx(fileOf(mv.from), (rankOf(mv.from) + rankOf(mv.to)) / 2) : -1;
  n.half = (p.t === "p" || captured) ? 0 : n.half + 1;
  if (us === "b") n.full++;
  n.turn = them;
  return n;
}

/* Mutări complet legale. */
function legalMoves(st, onlyFrom) {
  const us = st.turn;
  return pseudoMoves(st, onlyFrom).filter((mv) => {
    const after = makeMove(st, mv);
    return !inCheck(after, us);
  });
}

function isCheckmate(st) { return inCheck(st) && legalMoves(st).length === 0; }
function isStalemate(st) { return !inCheck(st) && legalMoves(st).length === 0; }

/* ------------------------------------------------------------ NOTAȚIE --- */

function moveToUci(mv) {
  return sqName(mv.from) + sqName(mv.to) + (mv.promotion || "");
}

/* Găsește mutarea legală care corespunde unui șir UCI ("e2e4", "a7a8q"). */
function uciToMove(st, uci) {
  const from = sqFromName(uci.slice(0, 2));
  const to = sqFromName(uci.slice(2, 4));
  const promo = uci.length > 4 ? uci[4] : null;
  return legalMoves(st, from).find(
    (m) => m.to === to && (promo ? m.promotion === promo : !m.promotion)
  ) || null;
}

const PIECE_LETTER = { p: "", n: "N", b: "B", r: "R", q: "Q", k: "K" };

function moveToSan(st, mv) {
  const p = st.board[mv.from];
  if (!p) return moveToUci(mv);
  if (mv.flag === "kcastle") return withSuffix("O-O");
  if (mv.flag === "qcastle") return withSuffix("O-O-O");

  const captured = st.board[mv.to] || mv.flag === "ep";
  let s;

  if (p.t === "p") {
    s = captured ? FILES[fileOf(mv.from)] + "x" + sqName(mv.to) : sqName(mv.to);
    if (mv.promotion) s += "=" + mv.promotion.toUpperCase();
  } else {
    // dezambiguizare
    const rivals = legalMoves(st).filter(
      (m) => m.to === mv.to && m.from !== mv.from &&
             st.board[m.from] && st.board[m.from].t === p.t
    );
    let dis = "";
    if (rivals.length) {
      const sameFile = rivals.some((m) => fileOf(m.from) === fileOf(mv.from));
      const sameRank = rivals.some((m) => rankOf(m.from) === rankOf(mv.from));
      if (!sameFile) dis = FILES[fileOf(mv.from)];
      else if (!sameRank) dis = String(rankOf(mv.from) + 1);
      else dis = sqName(mv.from);
    }
    s = PIECE_LETTER[p.t] + dis + (captured ? "x" : "") + sqName(mv.to);
  }
  return withSuffix(s);

  function withSuffix(base) {
    const after = makeMove(st, mv);
    if (isCheckmate(after)) return base + "#";
    if (inCheck(after)) return base + "+";
    return base;
  }
}

/* Transformă lista de mutări UCI a puzzle-ului într-o listă de SAN. */
function lineToSan(fen, ucis) {
  let st = parseFEN(fen);
  const out = [];
  for (const u of ucis) {
    const mv = uciToMove(st, u);
    if (!mv) break;
    out.push({ san: moveToSan(st, mv), uci: u, turn: st.turn });
    st = makeMove(st, mv);
  }
  return out;
}

window.Chess = {
  parseFEN, toFEN, cloneState, legalMoves, makeMove, inCheck,
  isCheckmate, isStalemate, moveToUci, uciToMove, moveToSan, lineToSan,
  sqName, sqFromName, fileOf, rankOf, idx, other,
};
