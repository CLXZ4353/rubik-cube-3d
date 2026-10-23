// Move-count metrics + "gen" + inverse, over the move objects src/moves.js builds.
//
// | Metric | Rule                                                        |
// | HTM    | every token = 1                                              |
// | QTM    | 90° = 1, 180° = 2, wide = 2, slice = 1, rotation = 2        |
// | ETM    | face = 1, outer block = 1, rotation = 1, slice = 0         |
// | STM    | slice = 0, wide = 2, rotation = 0, face = 1                |
//
// Verified against speedcubedb: "M R U R' U r U2 r' U M'" is 10 tokens but ETM 8.

import { parseNotation, notation, inverseMove, FACE_DEFS } from '../moves.js';

/** Datasets store algorithms as strings; accept both forms everywhere. */
function tokens(moves) {
  return typeof moves === 'string' ? parseNotation(moves) : moves;
}

/** kind of a move: face | wide | slice | whole */
export function moveKind(move) {
  const m = /^(?:\d*)?([UDLRFBMESxyz])w?$/.exec(move.face);
  if (!m) throw new Error(`Unknown move: ${move.face}`);
  const letter = m[1];
  if (FACE_DEFS[letter].kind === 'whole') return 'whole';
  if (FACE_DEFS[letter].kind === 'slice') return 'slice';
  return move.layers.length > 1 ? 'wide' : 'face';
}

/** Count one move under a metric. */
function cost(kind, angle, metric) {
  const half = Math.abs(angle) === 180;
  switch (metric) {
    case 'htm': return 1;
    case 'qtm':
      if (kind === 'whole') return 2;
      if (kind === 'wide') return half ? 4 : 2;
      return half ? 2 : 1;
    case 'etm':
      if (kind === 'slice') return 0;
      return 1;
    case 'stm':
      if (kind === 'slice' || kind === 'whole') return 0;
      if (kind === 'wide') return 2;
      return 1;
    default: throw new Error(`Unknown metric: ${metric}`);
  }
}

export function metrics(moves) {
  const out = { htm: 0, qtm: 0, etm: 0, stm: 0 };
  for (const m of tokens(moves)) {
    const kind = moveKind(m);
    for (const k of ['htm', 'qtm', 'etm', 'stm']) out[k] += cost(kind, m.angle, k);
  }
  return out;
}

/** "3GEN (R U F)" — how many distinct faces an algorithm uses. */
export function gen(moves) {
  const faces = new Set();
  for (const m of tokens(moves)) {
    const m2 = /^(?:\d*)?([UDLRFBMESxyz])w?$/.exec(m.face);
    if (!m2) continue;
    if (FACE_DEFS[m2[1]].kind === 'face') faces.add(m2[1]);
  }
  const order = ['U', 'D', 'L', 'R', 'F', 'B'].filter((f) => faces.has(f));
  return `${order.length}GEN (${order.join(' ')})`;
}

/** Pretty-print a move list: "R U2 R' F'". */
export function format(moves) {
  return moves.map((m) => notation(m)).join(' ');
}

/** Readable inverse of an algorithm string (for the trainer's scramble). */
export function inverseStr(str) {
  const ms = parseNotation(str);
  ms.reverse();
  return format(ms.map((m) => inverseMove(m)));
}
