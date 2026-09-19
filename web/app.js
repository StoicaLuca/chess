/* app.js — puzzle, mutări animate, săgeți pe click dreapta, navigare în linie. */

const C = window.Chess;
const P = window.PIECES;
const el = (id) => document.getElementById(id);

const boardEl   = el("board");
const arrowsEl  = el("arrows");
const trailsEl  = el("trails");
const dragLayer = el("dragLayer");
const promoEl   = el("promo");
const promoRow  = el("promoRow");

const ANIM_MS = 210;
const ANIM_EASE = "cubic-bezier(.2,.75,.25,1)";

/* Cat tine dara neagra lasata in urma de piesa. */
const TRAIL_FADE_MS = 420;

const G = {
  puzzle: null,
  line: [],          // [{ st, mv }] — pozițiile puzzle-ului, în ordine
  cursor: 0,         // poziția afișată
  player: "w",
  orient: "w",
  done: false,
  failed: false,
  recorded: false,
  session: 0,                 // cate puzzle-uri ai terminat de cand ai deschis pagina
  locked: true,
  sel: null,
  targets: [],
  mark: null,        // {sq, kind} bifa verde / X roșu pe ultima mutare
  over: null,
  drag: null,
  rdrag: null,       // desenare săgeată cu click dreapta
  arrows: [],        // [{from, to}] desenate de utilizator
  badArrows: [],     // săgeata roșie care explică o mutare greșită
  marks: [],         // pătrate marcate cu roșu
  temp: null,        // poziție tranzitorie (mutare greșită)
  pendingPromo: null,
  stats: null,
  t0: 0,
  tick: null,
};

const PIECE_RO = { k: "regele", q: "dama", r: "turnul", b: "nebunul", n: "calul", p: "pionul" };

const live   = () => G.line.length - 1;
const atLive = () => G.cursor === live();
const state  = () => G.temp || (G.line[G.cursor] && G.line[G.cursor].st);

/* ------------------------------------------------------------- desenare --- */

function viewOf(sq) { return G.orient === "w" ? sq : 63 - sq; }

function render(anims) {
  const st = state();
  if (!st) return;

  const lastMv = G.temp ? G.tempMv : (G.line[G.cursor] && G.line[G.cursor].mv);
  const check = C.inCheck(st) ? kingSq(st, st.turn) : -1;
  const canPlay = atLive() && !G.done && !G.locked && !G.temp;
  const frag = document.createDocumentFragment();

  for (let v = 0; v < 64; v++) {
    const i = G.orient === "w" ? v : 63 - v;
    const f = C.fileOf(i), r = C.rankOf(i);

    const sq = document.createElement("div");
    sq.className = "sq " + ((f + r) % 2 === 0 ? "dark" : "light");
    sq.dataset.sq = i;

    const ovs = [];
    if (lastMv && (i === lastMv.from || i === lastMv.to)) ovs.push("hl");
    if (G.sel === i) ovs.push("hl");
    if (G.mark && G.mark.sq === i) ovs.push(G.mark.kind);
    if (G.marks.includes(i)) ovs.push("mark");
    if (G.over === i) ovs.push("over");
    for (const o of ovs) sq.insertAdjacentHTML("beforeend", `<span class="ov ${o}"></span>`);

    if (i === check) sq.classList.add("check");

    const bottom = G.orient === "w" ? r === 0 : r === 7;
    const leftmost = G.orient === "w" ? f === 0 : f === 7;
    if (bottom)   sq.insertAdjacentHTML("beforeend", `<span class="coord file">${"abcdefgh"[f]}</span>`);
    if (leftmost) sq.insertAdjacentHTML("beforeend", `<span class="coord rank">${r + 1}</span>`);

    const t = G.targets.find((m) => m.to === i);
    if (t) {
      const cap = st.board[i] || t.flag === "ep";
      sq.insertAdjacentHTML("beforeend", `<span class="hintdot${cap ? " cap" : ""}"></span>`);
      sq.classList.add("pick");
    }

    const p = st.board[i];
    if (p) {
      sq.insertAdjacentHTML("beforeend", P.pieceSVG(p.t, p.c));
      if (canPlay && p.c === G.player && st.turn === G.player) sq.classList.add("pick");
      if (G.drag && G.drag.from === i) sq.querySelector(".piece").classList.add("dragging");
    }
    frag.appendChild(sq);
  }

  boardEl.replaceChildren(frag);
  if (anims && anims.length) runAnims(anims);
  drawArrows();
  syncControls();
}

/* Piesa apare întâi pe pătratul de plecare, apoi alunecă spre destinație.
 *
 * DE CE .animate() SI NU O TRANZITIE CSS. Varianta veche punea transform-ul de
 * plecare, citea getBoundingClientRect() ca sa forteze un reflow, apoi punea
 * transform-ul de sosire, sperand ca tranzitia porneste. Nu pornea NICIODATA,
 * si de-aia piesele se teleportau: render() reconstruieste toate cele 64 de
 * patrate la fiecare mutare, deci piesa e un element PROASPAT INSERAT, iar un
 * element nou nu are o valoare anterioara de la care sa plece tranzitia.
 *
 * Web Animations API n-are problema asta: ii dai chiar tu cele doua capete ale
 * miscarii, deci nu depinde de ce credea browserul ca era inainte.
 */
function runAnims(anims) {
  const size = boardEl.getBoundingClientRect().width / 8;

  for (const a of anims) {
    const node = boardEl.querySelector(`[data-sq="${a.to}"] .piece`);
    if (!node) continue;

    const vf = viewOf(a.from), vt = viewOf(a.to);
    const dx = ((vf % 8) - (vt % 8)) * size;
    const dy = (Math.floor(vf / 8) - Math.floor(vt / 8)) * size;
    if (!dx && !dy) continue;

    // cat aluneca, trece PESTE piesele peste care sare, nu pe sub ele
    node.style.zIndex = "6";

    const anim = node.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` },
       { transform: "translate(0px, 0px)" }],
      { duration: ANIM_MS, easing: ANIM_EASE },
    );
    anim.finished.then(() => { node.style.zIndex = ""; }).catch(() => {});

    drawTrail(a.from, a.to);
  }
}

/* --------------------------------------------------------------- dara --- */
/*
   Linia neagra pe care o lasa piesa in urma.

   Se deseneaza singura odata cu piesa: linia are lungimea totala pusa in
   stroke-dasharray, iar dashoffset porneste de la lungimea aia si ajunge la 0 -
   adica intai e complet "ascunsa", apoi se dezvaluie exact cat inainteaza piesa.
   Dupa ce s-a oprit, se stinge.

   Sta pe un strat SVG separat de sageti, ca drawArrows() sa nu o stearga cand
   isi rescrie continutul.
*/
function trailPath(from, to) {
  const a = centerOf(from), b = centerOf(to);
  const df = Math.abs(C.fileOf(to) - C.fileOf(from));
  const dr = Math.abs(C.rankOf(to) - C.rankOf(from));
  const knight = (df === 1 && dr === 2) || (df === 2 && dr === 1);

  // la cal traseul e in L, ca la sageti - o diagonala n-ar descrie mutarea
  const pts = knight
    ? [a, dr > df ? { x: a.x, y: b.y } : { x: b.x, y: a.y }, b]
    : [a, b];

  const d = pts.map((p, i) => (i ? "L" : "M") + p.x.toFixed(3) + " " + p.y.toFixed(3)).join(" ");
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return { d, len };
}

function drawTrail(from, to) {
  if (!trailsEl) return;

  const { d, len } = trailPath(from, to);
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("class", "trail");
  p.setAttribute("d", d);
  p.setAttribute("stroke-dasharray", len.toFixed(3));
  p.setAttribute("stroke-dashoffset", len.toFixed(3));
  trailsEl.appendChild(p);

  p.animate(
    [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
    { duration: ANIM_MS, easing: ANIM_EASE, fill: "forwards" },
  );

  // ramane plina cat merge piesa, apoi se stinge
  const hold = ANIM_MS / (ANIM_MS + TRAIL_FADE_MS);
  const fade = p.animate(
    [{ opacity: 1, offset: 0 },
     { opacity: 1, offset: hold },
     { opacity: 0, offset: 1 }],
    { duration: ANIM_MS + TRAIL_FADE_MS, easing: "linear", fill: "forwards" },
  );
  fade.finished.then(() => p.remove()).catch(() => p.remove());
}

function clearTrails() { if (trailsEl) trailsEl.replaceChildren(); }

/* Mutările care trebuie animate pentru o mutare dată (rocada mută două piese). */
function animsFor(mv, reverse) {
  if (!mv) return null;
  const list = [{ from: mv.from, to: mv.to }];
  if (mv.flag === "kcastle" || mv.flag === "qcastle") {
    const rank = C.rankOf(mv.to);
    const rookFrom = mv.flag === "kcastle" ? C.idx(7, rank) : C.idx(0, rank);
    const rookTo   = mv.flag === "kcastle" ? C.idx(5, rank) : C.idx(3, rank);
    list.push({ from: rookFrom, to: rookTo });
  }
  return reverse ? list.map((a) => ({ from: a.to, to: a.from })) : list;
}

function kingSq(st, c) {
  for (let i = 0; i < 64; i++) {
    const p = st.board[i];
    if (p && p.c === c && p.t === "k") return i;
  }
  return -1;
}

/* --------------------------------------------------------------- săgeți --- */

function centerOf(sq) {
  const v = viewOf(sq);
  return { x: (v % 8) + 0.5, y: Math.floor(v / 8) + 0.5 };
}

/* Construiește o săgeată. Pentru saltul calului traseul e în L — întâi pe axa
   lungă, apoi pe cea scurtă — pentru că o diagonală n-ar descrie mutarea. */
function arrowMarkup(from, to, cls) {
  const a = centerOf(from), b = centerOf(to);
  const df = Math.abs(C.fileOf(to) - C.fileOf(from));
  const dr = Math.abs(C.rankOf(to) - C.rankOf(from));
  const knight = (df === 1 && dr === 2) || (df === 2 && dr === 1);

  let pts = [a, b];
  if (knight) pts = [a, dr > df ? { x: a.x, y: b.y } : { x: b.x, y: a.y }, b];

  const HL = 0.40, HW = 0.50, SW = 0.17, GAP = 0.30;

  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  let ux = last.x - prev.x, uy = last.y - prev.y;
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul; uy /= ul;
  const basePt = { x: last.x - ux * HL, y: last.y - uy * HL };

  const first = pts[0], second = pts[1];
  let sx = second.x - first.x, sy = second.y - first.y;
  const sl = Math.hypot(sx, sy) || 1;
  sx /= sl; sy /= sl;
  const startPt = { x: first.x + sx * GAP, y: first.y + sy * GAP };

  const shaft = [startPt, ...pts.slice(1, -1), basePt];
  const d = shaft.map((p, i) => (i ? "L" : "M") + p.x.toFixed(3) + " " + p.y.toFixed(3)).join(" ");

  const px = -uy, py = ux;
  const h1 = { x: basePt.x + px * HW / 2, y: basePt.y + py * HW / 2 };
  const h2 = { x: basePt.x - px * HW / 2, y: basePt.y - py * HW / 2 };
  const tri = `${last.x.toFixed(3)},${last.y.toFixed(3)} ${h1.x.toFixed(3)},${h1.y.toFixed(3)} ${h2.x.toFixed(3)},${h2.y.toFixed(3)}`;

  return `<g class="${cls || ""}">
            <path class="shaft" d="${d}" stroke-width="${SW}"/>
            <polygon class="head" points="${tri}"/>
          </g>`;
}

function drawArrows(preview) {
  let html = G.arrows.map((a) => arrowMarkup(a.from, a.to)).join("");
  html += G.badArrows.map((a) => arrowMarkup(a.from, a.to, "bad")).join("");
  if (preview && preview.from !== preview.to) html += arrowMarkup(preview.from, preview.to);
  arrowsEl.innerHTML = html;
}

function toggleArrow(from, to) {
  const i = G.arrows.findIndex((a) => a.from === from && a.to === to);
  if (i >= 0) G.arrows.splice(i, 1); else G.arrows.push({ from, to });
}
function toggleMark(sq) {
  const i = G.marks.indexOf(sq);
  if (i >= 0) G.marks.splice(i, 1); else G.marks.push(sq);
}
function clearDrawings() {
  const had = G.arrows.length || G.marks.length;
  G.arrows = []; G.marks = [];
  return had;
}

/* ------------------------------------------------------- input pe tablă --- */

function squareFromPoint(x, y) {
  const r = boardEl.getBoundingClientRect();
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
  const s = r.width / 8;
  const v = Math.min(7, Math.floor((y - r.top) / s)) * 8 + Math.min(7, Math.floor((x - r.left) / s));
  return G.orient === "w" ? v : 63 - v;
}

function canMoveFrom(i) {
  const st = state();
  const p = st.board[i];
  return atLive() && !G.locked && !G.done && !G.temp && p && p.c === G.player && st.turn === G.player;
}

function select(i) { G.sel = i; G.targets = C.legalMoves(state(), i); }
function clearSel() { G.sel = null; G.targets = []; }

boardEl.addEventListener("contextmenu", (ev) => ev.preventDefault());

boardEl.addEventListener("pointerdown", (ev) => {
  const i = squareFromPoint(ev.clientX, ev.clientY);
  if (i === null) return;

  /* --- click dreapta: desenăm --- */
  if (ev.button === 2) {
    ev.preventDefault();
    G.rdrag = { from: i, pointerId: ev.pointerId };
    boardEl.setPointerCapture(ev.pointerId);
    return;
  }
  if (ev.button !== 0) return;

  /* --- click stânga: orice desen dispare --- */
  if (clearDrawings()) drawArrows();

  if (G.locked || G.done || !atLive()) { render(); return; }

  if (G.sel !== null && G.sel !== i) {
    const opts = G.targets.filter((m) => m.to === i);
    if (opts.length) {
      ev.preventDefault();
      return opts.length > 1 && opts[0].promotion ? askPromotion(opts) : playUserMove(opts[0]);
    }
  }

  if (!canMoveFrom(i)) { clearSel(); render(); return; }

  ev.preventDefault();
  select(i);

  const p = state().board[i];
  const size = boardEl.getBoundingClientRect().width / 8;
  G.drag = { from: i, moved: false };
  dragLayer.innerHTML = P.pieceSVG(p.t, p.c);
  const ghost = dragLayer.firstElementChild;
  ghost.style.width = size * 0.94 + "px";
  ghost.style.height = size * 0.94 + "px";
  moveGhost(ev.clientX, ev.clientY);
  dragLayer.hidden = false;
  boardEl.classList.add("grabbing");
  boardEl.setPointerCapture(ev.pointerId);
  render();
});

function moveGhost(x, y) {
  const g = dragLayer.firstElementChild;
  if (g) { g.style.left = x + "px"; g.style.top = y + "px"; }
}

boardEl.addEventListener("pointermove", (ev) => {
  if (G.rdrag) {
    const i = squareFromPoint(ev.clientX, ev.clientY);
    if (i !== null) drawArrows({ from: G.rdrag.from, to: i });
    return;
  }
  if (!G.drag) return;
  G.drag.moved = true;
  moveGhost(ev.clientX, ev.clientY);
  const i = squareFromPoint(ev.clientX, ev.clientY);
  const valid = i !== null && G.targets.some((m) => m.to === i) ? i : null;
  if (valid !== G.over) { G.over = valid; render(); }
});

boardEl.addEventListener("pointerup", (ev) => {
  try { boardEl.releasePointerCapture(ev.pointerId); } catch (e) { /* ignorăm */ }

  if (G.rdrag) {
    const from = G.rdrag.from;
    const to = squareFromPoint(ev.clientX, ev.clientY);
    G.rdrag = null;
    if (to === null) { drawArrows(); return; }
    if (to === from) toggleMark(from); else toggleArrow(from, to);
    render();
    return;
  }

  if (!G.drag) return;
  const from = G.drag.from, moved = G.drag.moved;
  G.drag = null; G.over = null;
  dragLayer.hidden = true; dragLayer.innerHTML = "";
  boardEl.classList.remove("grabbing");

  const i = squareFromPoint(ev.clientX, ev.clientY);
  if (i === null || i === from) { render(); return; }

  const opts = G.targets.filter((m) => m.to === i);
  if (!opts.length) { if (moved) clearSel(); render(); return; }
  if (opts.length > 1 && opts[0].promotion) return askPromotion(opts);
  playUserMove(opts[0]);
});

boardEl.addEventListener("pointercancel", () => {
  G.drag = null; G.rdrag = null; G.over = null;
  dragLayer.hidden = true; dragLayer.innerHTML = "";
  boardEl.classList.remove("grabbing");
  render();
});

/* ---------------------------------------------------------- promovare --- */

function askPromotion(moves) {
  G.pendingPromo = moves;
  promoRow.innerHTML = ["q", "r", "b", "n"]
    .map((t) => `<button class="promo-btn" data-p="${t}">${P.pieceSVG(t, G.player)}</button>`).join("");
  promoEl.hidden = false;
}
promoRow.addEventListener("click", (ev) => {
  const b = ev.target.closest(".promo-btn");
  if (!b || !G.pendingPromo) return;
  const mv = G.pendingPromo.find((m) => m.promotion === b.dataset.p);
  promoEl.hidden = true; G.pendingPromo = null;
  if (mv) playUserMove(mv);
});

/* ------------------------------------------------------------ flux joc --- */

function pushMove(mv, mark) {
  const st = C.makeMove(state(), mv);
  G.line.push({ st, mv });
  G.cursor = live();
  G.mark = mark ? { sq: mv.to, kind: mark } : null;
  clearSel();
  render(animsFor(mv, false));
}

function playUserMove(mv) {
  clearDrawings();
  const expected = G.puzzle.moves[G.cursor];   // cursor == indexul mutării așteptate
  const after = C.makeMove(state(), mv);
  const isMate = C.isCheckmate(after);

  if (C.moveToUci(mv) !== expected && !isMate) return showWrong(mv, after);

  pushMove(mv, "good");

  if (isMate || G.cursor >= G.puzzle.moves.length) return finish(true);

  G.locked = true;
  setStatus("good", "Corect", "Continuă — mai e.");
  setTimeout(() => {
    const reply = C.uciToMove(state(), G.puzzle.moves[G.cursor]);

    // acelasi motiv ca mai sus: intai starea, apoi o singura randare
    G.locked = false;
    turnPrompt();

    if (reply) pushMove(reply, null); else render();
  }, 430);
}

/* ------------------------------------------------- de ce e greșită --- */

const VAL  = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME = { p: "un pion", n: "un cal", b: "un nebun", r: "un turn", q: "dama" };

/* Cea mai tăioasă replică a adversarului la poziția dată: mat, altfel cea mai
   mare captură care rămâne în avantaj după o eventuală recapturare.
   E o evaluare de o singură semi-mutare, nu un motor — dar prinde exact
   greșeala obișnuită: ai lăsat ceva în priză. */
function bestRefutation(st) {
  let best = null;
  for (const mv of C.legalMoves(st)) {
    const after = C.makeMove(st, mv);
    if (C.isCheckmate(after)) return { mv, kind: "mate" };
    const cap = st.board[mv.to];
    if (!cap) continue;
    const recap = C.legalMoves(after).some((m) => m.to === mv.to);
    const gain = VAL[cap.t] - (recap ? VAL[st.board[mv.from].t] : 0);
    if (gain > 0 && (!best || gain > best.gain)) best = { mv, kind: "win", gain, cap: cap.t };
  }
  return best;
}

function showWrong(mv, after) {
  G.failed = true;
  G.locked = true;
  G.temp = after;
  G.tempMv = mv;
  G.mark = { sq: mv.to, kind: "bad" };
  clearSel();
  clearDrawings();

  const ref = bestRefutation(after);
  G.badArrows = ref ? [{ from: ref.mv.from, to: ref.mv.to }] : [];

  let msg;
  if (!ref) {
    msg = "Nu pierde nimic pe loc, dar nu e mutarea cerută aici. Apasă „Înapoi” și mai încearcă.";
  } else {
    const san = C.moveToSan(after, ref.mv);
    msg = ref.kind === "mate"
      ? `Adversarul răspunde ${san} și dă mat — vezi săgeata roșie.`
      : `Adversarul joacă ${san} și câștigă ${NAME[ref.cap]} — vezi săgeata roșie.`;
  }

  render(animsFor(mv, false));
  setStatus("bad", "Nu e mutarea corectă", msg);
}

function undoWrong() {
  if (!G.temp) return;
  const back = animsFor(G.tempMv, true);
  G.temp = null; G.tempMv = null; G.mark = null;
  G.badArrows = [];
  G.locked = false;
  turnPrompt();
  render(back);
}

function finish(success) {
  G.done = true;
  G.locked = true;
  stopClock();
  clearSel();
  // Nu redesenăm acum: ultima mutare tocmai a fost randată și e în plină
  // animație, iar un render ar înlocui nodul și ar taia-o. Doar butoanele.
  syncControls();
  setTimeout(() => { if (G.done) render(); }, ANIM_MS + 30);

  if (success) {
    const clean = !G.failed;
    setStatus("good", clean ? "Rezolvat!" : "Rezolvat",
      clean ? "Dintr-o singură încercare." : "Corect, dar cu ajutor pe drum.");
  } else {
    setStatus("bad", "Soluția", "Derulează cu ‹ și › ca să vezi de ce.");
  }

  showLine();
  recordResult(success && !G.failed);
}

function showLine() {
  const line = C.lineToSan(G.puzzle.fen, G.puzzle.moves);
  el("lineMoves").replaceChildren(...line.map((m, i) => {
    const s = document.createElement("span");
    s.textContent = m.san;
    if (i % 2 === 0) s.className = "them";
    return s;
  }));
  el("lineBox").hidden = false;
}

async function recordResult(ok) {
  if (G.recorded) return;
  G.recorded = true;
  try {
    const r = await fetch("/api/result", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: G.puzzle.id, rating: G.puzzle.rating, ok }),
    });
    const d = await r.json();
    if (d.rating) { el("statRating").textContent = d.rating; el("statStreak").textContent = d.streak; }

    // Contorul de sesiune porneste de la 0 la fiecare deschidere a paginii si
    // numara TOATE puzzle-urile terminate, si cele ratate. Totalul pe viata il
    // tine serverul, in tabela "solved" din puzzles.db, si vine prin refreshStats.
    G.session++;
    el("statSession").textContent = G.session;

    refreshStats();
  } catch (e) { /* offline */ }
}

/* --------------------------------------------------------- navigare --- */

function goTo(idx) {
  idx = Math.max(0, Math.min(live(), idx));
  if (idx === G.cursor) return;
  const back = idx < G.cursor;
  const mv = back ? G.line[G.cursor].mv : G.line[idx].mv;
  G.cursor = idx;
  G.mark = null;
  clearSel();
  render(animsFor(mv, back));
}

function syncControls() {
  const wrong = !!G.temp;
  el("navPrev").disabled = wrong || G.cursor <= 0;
  el("navNext").disabled = wrong || G.cursor >= live();
  el("ctrlSolving").hidden = G.done || wrong;
  el("ctrlWrong").hidden = !wrong;
  el("ctrlDone").hidden = !G.done || wrong;
}

el("navPrev").addEventListener("click", () => goTo(G.cursor - 1));
el("navNext").addEventListener("click", () => goTo(G.cursor + 1));

/* ------------------------------------------------------------ butoane --- */

el("btnHint").addEventListener("click", () => {
  if (G.done || G.locked || !G.puzzle || !atLive()) return;
  const mv = C.uciToMove(state(), G.puzzle.moves[G.cursor]);
  if (!mv) return;
  G.failed = true;
  select(mv.from);
  G.targets = [];
  const p = state().board[mv.from];
  setStatus("", "Indiciu", `Mută ${PIECE_RO[p.t]} de pe ${C.sqName(mv.from)}.`);
  render();
});

el("btnSolve").addEventListener("click", () => {
  if (G.done || !G.puzzle) return;
  G.failed = true;
  G.locked = true;
  G.cursor = live();
  clearSel();
  (function step() {
    if (G.cursor >= G.puzzle.moves.length) return finish(false);
    const mv = C.uciToMove(state(), G.puzzle.moves[G.cursor]);
    if (!mv) return finish(false);
    const mine = state().turn === G.player;
    pushMove(mv, mine ? "good" : null);
    setTimeout(step, 520);
  })();
});

el("btnUndo").addEventListener("click", undoWrong);
el("btnSolve2").addEventListener("click", () => { undoWrong(); el("btnSolve").click(); });
el("btnRewind").addEventListener("click", () => goTo(0));
el("btnNext").addEventListener("click", () => loadPuzzle());

el("btnAuto").addEventListener("click", (ev) => {
  ev.preventDefault();
  const r = G.stats ? G.stats.rating : 1200;
  el("minRating").value = Math.max(0, r - 150);
  el("maxRating").value = r + 250;
});

el("btnReset").addEventListener("click", async () => {
  if (!confirm("Ștergi tot progresul — rating, serie și puzzle-urile rezolvate?")) return;
  await fetch("/api/reset", { method: "POST" });
  refreshStats();
});

document.addEventListener("keydown", (ev) => {
  const t = ev.target.tagName;
  if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return;
  if (ev.key === "ArrowLeft")  {
    ev.preventDefault();
    return G.temp ? undoWrong() : goTo(G.cursor - 1);
  }
  if (ev.key === "ArrowRight") { ev.preventDefault(); return goTo(G.cursor + 1); }
  const k = ev.key.toLowerCase();
  if (k === "n" || ev.key === "Enter") { ev.preventDefault(); loadPuzzle(); }
  else if (k === "h") el("btnHint").click();
  else if (k === "s") el("btnSolve").click();
  else if (k === "r") G.done ? goTo(0) : retry();
});

function retry() {
  if (!G.puzzle) return;
  G.line = G.line.slice(0, 2);   // poziția inițială + mutarea adversarului
  G.cursor = live();
  G.mark = null;
  clearSel(); clearDrawings();
  el("lineBox").hidden = true;
  G.locked = false;
  turnPrompt();
  render();
}

/* --------------------------------------------------------------- ceas --- */

function startClock() {
  G.t0 = Date.now();
  stopClock();
  G.tick = setInterval(paintClock, 250);
  paintClock();
}
function stopClock() { if (G.tick) { clearInterval(G.tick); G.tick = null; } }
function paintClock() {
  const s = Math.floor((Date.now() - G.t0) / 1000);
  el("clock").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

/* -------------------------------------------------------------- status --- */

function setStatus(kind, title, msg) {
  el("statusPanel").className = "panel status" + (kind ? " is-" + kind : "");
  el("statusIcon").textContent = kind === "good" ? "✓" : kind === "bad" ? "✕" : "♟";
  el("statusTitle").textContent = title;
  el("statusMsg").textContent = msg;
}
function turnPrompt() {
  setStatus("", "Rândul tău", `Găsește cea mai bună mutare pentru ${G.player === "w" ? "albul" : "negrul"}.`);
}

/* ---------------------------------------------------------- încărcare --- */

async function loadPuzzle() {
  G.locked = true; G.done = false;
  el("lineBox").hidden = true;
  promoEl.hidden = true;
  clearDrawings();
  clearTrails();
  setStatus("", "Se încarcă…", "Caut un puzzle.");

  const q = new URLSearchParams({
    min: el("minRating").value || 0,
    max: el("maxRating").value || 3500,
    theme: el("themeSel").value,
    unseen: el("unseen").checked ? "1" : "0",
    exclude: G.puzzle ? G.puzzle.id : "",
  });

  let p;
  try {
    p = await (await fetch("/api/puzzle?" + q)).json();
  } catch (e) {
    return setStatus("bad", "Serverul nu răspunde", "Verifică dacă „python server.py” mai rulează.");
  }
  if (!p || p.error) {
    return setStatus("bad", "Niciun puzzle găsit", "Lărgește intervalul de dificultate din Filtre.");
  }

  G.puzzle = p;
  G.recorded = false; G.failed = false;
  G.mark = null;
  G.temp = null; G.tempMv = null; G.badArrows = [];
  clearSel();

  const st0 = C.parseFEN(p.fen);
  G.player = C.other(st0.turn);
  G.orient = G.player;
  G.line = [{ st: st0, mv: null }];
  G.cursor = 0;
  render();

  el("puzzleRating").textContent = p.rating;
  el("themeTags").replaceChildren(...p.themes.slice(0, 6).map((t) => {
    const s = document.createElement("span");
    s.textContent = THEME_LABEL[t] || t;
    return s;
  }));
  const link = el("gameLink");
  link.hidden = !p.url;
  if (p.url) link.href = p.url;

  setTimeout(() => {
    const first = C.uciToMove(state(), p.moves[0]);

    // ATENTIE LA ORDINE. pushMove deseneaza tabla SI porneste animatia.
    // Daca deblocam dupa si mai chemam un render(), al doilea render
    // inlocuieste toate patratele, deci si piesa care tocmai zbura - si
    // mutarea pare o teleportare. Deblocam INAINTE, ca randarea facuta de
    // pushMove sa fie deja cea buna, si nu mai randam a doua oara.
    G.locked = false;
    startClock();
    turnPrompt();

    if (first) pushMove(first, null); else render();
  }, 420);
}

/* --------------------------------------------------------------- stats --- */

const THEME_LABEL = {};

async function loadThemes() {
  try {
    const list = await (await fetch("/api/themes")).json();
    el("themeSel").replaceChildren(...list.map((t) => {
      THEME_LABEL[t.id] = t.label;
      const o = document.createElement("option");
      o.value = t.id; o.textContent = t.label;
      return o;
    }));
  } catch (e) { /* ignorăm */ }
}

async function refreshStats() {
  try {
    const s = await (await fetch("/api/stats")).json();
    G.stats = s;
    P.useFiles(s.pieceFiles);
    showCredit();
    el("statRating").textContent = s.rating;
    el("statStreak").textContent = s.streak;
    el("statSolved").textContent = s.correct.toLocaleString("ro-RO");
    el("statAcc").textContent = s.attempted ? Math.round(s.correct / s.attempted * 100) + "%" : "—";
    el("poolInfo").textContent =
      `${s.total.toLocaleString("ro-RO")} puzzle-uri · rating ${s.minRating}–${s.maxRating}`;

    // "de cand ai instalat": cate ai facut in total si cate ti-au iesit.
    // Fiecare puzzle terminat e marcat in baza de date, deci nu-l mai primesti
    // a doua oara cat timp e bifat "Doar puzzle-uri nevăzute".
    const pct = s.attempted ? Math.round(s.correct / s.attempted * 100) : 0;
    const nr = (n) => (n === 1 ? "un puzzle" : `${n.toLocaleString("ro-RO")} puzzle-uri`);
    el("lifetime").textContent = s.attempted
      ? `Total: ${nr(s.attempted)} făcute, ${s.correct.toLocaleString("ro-RO")} rezolvate ` +
        `(${pct}%) · serie maximă ${s.bestStreak || 0}`
      : "Încă niciun puzzle terminat.";
  } catch (e) { /* ignorăm */ }
}

/* ---------------------------------------------------------------- aspect --- */
/*
   Setul de piese si marimea tablei. Amandoua se tin in localStorage, deci
   raman alese si dupa ce inchizi pagina. Marimea nu e un numar fix in CSS,
   ci variabila --zoom, cu care se inmulteste inaltimea disponibila - asa
   merge la fel pe orice ecran, nu doar pe al tau.
*/

function showCredit() {
  const c = P.credit();
  const node = el("pieceCredit");
  node.hidden = !c;
  node.textContent = c ? "Piese: " + c : "";
}

function applyZoom(v) {
  document.documentElement.style.setProperty("--zoom", (v / 100).toFixed(2));
  el("zoomVal").textContent = v + "%";
}

function initLook() {
  const sel = el("pieceSel");

  const saved = localStorage.getItem("pieceSet");
  if (saved) P.setPack(saved);

  sel.replaceChildren(...P.packs().map((p) => {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.name;
    return o;
  }));
  sel.value = P.pack();
  showCredit();

  sel.addEventListener("change", () => {
    P.setPack(sel.value);
    localStorage.setItem("pieceSet", sel.value);
    showCredit();
    render();                       // redesenam tabla cu setul nou
  });

  const zoom = el("zoomRange");
  const z = Number(localStorage.getItem("boardZoom")) || 100;
  zoom.value = z;
  applyZoom(z);
  zoom.addEventListener("input", () => {
    applyZoom(Number(zoom.value));
    localStorage.setItem("boardZoom", zoom.value);
  });
}

/* ----------------------------------------------------------------- init --- */

(async function init() {
  document.querySelector(".brand-mark .shape").innerHTML = P.PIECE_PATHS.n;
  await loadThemes();
  await refreshStats();
  initLook();
  if (G.stats) {
    el("minRating").value = Math.max(0, G.stats.rating - 150);
    el("maxRating").value = G.stats.rating + 250;
  }
  loadPuzzle();
})();
