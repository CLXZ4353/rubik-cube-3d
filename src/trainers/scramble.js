// Scramble generation for the case trainers.
//
// The dataset stores `setup` as the inverse of the case's standard algorithm,
// so scrambling = replaying that setup; a last-layer trainer then adds an AUF
// turn so the same case shows up in a different face orientation.
// shortcut: F2L sets would need prep moves in front of the setup; none of the
// sets we ship are F2L, so that branch is only a stub.

import { parseNotation, notation, inverseMove, makeMove } from '../moves.js';
import { rngFor } from './casePicker.js';

export function scrambleFor(cs, seed, kind = 'OLL') {
  const base = cs.setup ?? '';
  if (kind === 'F2L') return `${base} ${prepMoves(seed)} ${base}`.trim(); // stub: prep moves first
  if (!['OLL', 'PLL'].includes(kind)) return base;
  const rng = rngFor(`${seed}|auf`);
  const auf = Math.floor(rng() * 4);
  if (!auf) return base;
  const turn = ['U', 'U2', "U'"][auf - 1];
  return `${base} ${turn}`.trim();
}

/** Reversible random moves used to loosen the case before an F2L drill. */
function prepMoves(seed) {
  const rng = rngFor(`${seed}|prep`);
  const faces = ['R', 'U', 'L', 'D', 'F', 'B'];
  const out = [];
  for (let i = 0; i < 8; i++) {
    const f = faces[Math.floor(rng() * faces.length)];
    const mod = ['', "'", '2'][Math.floor(rng() * 3)];
    out.push(`${f}${mod}`);
  }
  return out.join(' ');
}

/** Moves the user claims to have done, normalised for comparison. */
export function normalize(seq) {
  return parseNotation(seq).map((m) => notation(m)).join(' ');
}

/** Does a move list undo a case, i.e. leave the cube solved (AUF allowed)? */
export function solvesCase(state, seq, allowAUF = true) {
  const st = state.clone();
  for (const m of parseNotation(seq)) st.applyMove(m);
  if (st.isSolved()) return true;
  if (!allowAUF) return false;
  const u = makeMove('U');
  for (let k = 0; k < 3; k++) {
    st.applyMove(u);
    if (st.isSolved()) return true;
  }
  return false;
}
