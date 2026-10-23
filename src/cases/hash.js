// Canonical case hashes: given a cube state, decide which case of a set it is.
//
// The hash is invariant under the set's symmetry group (the AUF turns for
// last-layer sets), so recognition does not care which side of the cube the
// solver happened to leave the AUF on.
//
// Everything is read from the authoritative logical state (positions + exact
// rotation matrices), never from pixels.

import { CubeState } from '../CubeState.js';
import { matApply, matMul, makeMove } from '../moves.js';

const U_SLOTS = [
  // U-layer corner slots in the cyclic order F -> R -> B -> L, with the two
  // side faces of each slot in that same cyclic order.
  { pos: { x: 1, y: 1, z: 1 }, sides: [{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }] },
  { pos: { x: 1, y: 1, z: -1 }, sides: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }] },
  { pos: { x: -1, y: 1, z: -1 }, sides: [{ x: 0, y: 0, z: -1 }, { x: -1, y: 0, z: 0 }] },
  { pos: { x: -1, y: 1, z: 1 }, sides: [{ x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }] },
];
const U_EDGE_SLOTS = [
  { pos: { x: 0, y: 1, z: 1 }, side: { x: 0, y: 0, z: 1 } },
  { pos: { x: 1, y: 1, z: 0 }, side: { x: 1, y: 0, z: 0 } },
  { pos: { x: 0, y: 1, z: -1 }, side: { x: 0, y: 0, z: -1 } },
  { pos: { x: -1, y: 1, z: 0 }, side: { x: -1, y: 0, z: 0 } },
];

// Cyclic face order F -> R -> B -> L, used to number U-layer slots so the
// numbering survives a y rotation.
const CYCLE = [{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: -1, y: 0, z: 0 }];
function cycleIndex(v) {
  for (let i = 0; i < 4; i++) if (CYCLE[i].x === v.x && CYCLE[i].y === v.y && CYCLE[i].z === v.z) return i;
  return -1;
}

/** The cubie currently sitting at a position (or null). */
function cubieAt(state, pos) {
  for (const c of state.cubies) if (c.pos.x === pos.x && c.pos.y === pos.y && c.pos.z === pos.z) return c;
  return null;
}

/** Where a corner's U/D coloured sticker points, as the world normal. */
function upStickerOf(c) {
  const upHome = { x: 0, y: Math.sign(c.home.y), z: 0 }; // its U/D sticker in the solved cube
  if (Math.abs(c.home.y) !== 1) return null;
  return matApply(c.rot, upHome);
}

/** Twist of a U-layer corner: 0 on U, else 1/2 along the slot's side faces. */
function cornerTwistAt(c, slot) {
  const w = upStickerOf(c);
  if (!w) return null;
  if (w.y === 1) return 0;
  for (let i = 0; i < 2; i++) {
    const s = slot.sides[i];
    if (w.x === s.x && w.y === s.y && w.z === s.z) return i + 1;
  }
  return null;
}

/** Flip of a U-layer edge: 0 when its U/D sticker is on the U face. */
function edgeFlipAt(c, slot) {
  const w = upStickerOf(c);
  if (!w) return null;
  if (w.y === 1) return 0;
  const s = slot.side;
  return w.x === s.x && w.y === s.y && w.z === s.z ? 1 : null;
}

/** Which U-layer slot a piece belongs to, by its home (null if not a U piece). */
function homeSlotIndex(c, slots) {
  for (let i = 0; i < 4; i++) {
    if (slots[i].pos.x === c.home.x && slots[i].pos.y === c.home.y && slots[i].pos.z === c.home.z) return i;
  }
  return -1;
}

/** AUF-canonical OLL hash: corner twists + edge flips, least over the 4 y turns. */
export function ollKey(state) {
  let best = null;
  let st = state;
  for (let k = 0; k < 4; k++) {
    const tw = [];
    const fl = [];
    for (let i = 0; i < 4; i++) {
      const c = cubieAt(st, U_SLOTS[i].pos);
      const e = cubieAt(st, U_EDGE_SLOTS[i].pos);
      if (!c || !e) { tw.push('?'); fl.push('?'); continue; }
      if (c.home.y !== 1 || e.home.y !== 1) { tw.push('*'); fl.push('*'); continue; } // F2L broken
      const t = cornerTwistAt(c, U_SLOTS[i]);
      const f = edgeFlipAt(e, U_EDGE_SLOTS[i]);
      tw.push(t === null ? '?' : t);
      fl.push(f === null ? '?' : f);
    }
    const s = tw.join('') + fl.join('');
    if (best === null || s < best) best = s;
    st = rotateY(st);
  }
  return best;
}

/** AUF-canonical PLL hash. Speed-solving treats two PLL permutations as the
 * same case when they differ by a PRE- and a POST-AUF (q = Uᵃ · p · Uᵇ) — that
 * is what takes the 288 last-layer permutations down to 22 classes (21 + solved),
 * so the key is the least pattern over all 16 pre/post AUF combinations. */
export function pllKey(state) {
  const p = permPattern(state); // "cccd/'eee" : home index of the U piece in each U slot
  if (!p) return null;
  const [cs, es] = p.split('/').map((s) => [...s].map(Number));
  // Speed-solving PLL equivalence: q = Uᵃ · p · Uᵇ, i.e. the same AUF applied
  // to the values (post-AUF) and to the slot numbering (pre-AUF). Working with
  // the per-slot deltas keeps that action exact.
  const dc = cs.map((v, i) => ((v - i) % 4 + 4) % 4);
  const de = es.map((v, i) => ((v - i) % 4 + 4) % 4);
  let best = null;
  for (let a = 0; a < 4; a++) {
    let x = dc, y = de;
    for (let k = 0; k < 4; k++) {
      const s = x.map((n) => (n + a) % 4).join('') + '/' + y.map((n) => (n + a) % 4).join('');
      if (best === null || s < best) best = s;
      x = [x[3], x[0], x[1], x[2]];
      y = [y[3], y[0], y[1], y[2]];
    }
  }
  return best;
}

/** The U-layer permutation pattern of a state, or null if it is not a PLL case. */
function permPattern(state) {
  const cd = [];
  const ed = [];
  for (let i = 0; i < 4; i++) {
    const c = cubieAt(state, U_SLOTS[i].pos);
    const e = cubieAt(state, U_EDGE_SLOTS[i].pos);
    if (!c || !e) return null;
    if (c.home.y !== 1 || e.home.y !== 1) return null; // F2L is not solved
    if (cornerTwistAt(c, U_SLOTS[i]) !== 0 || edgeFlipAt(e, U_EDGE_SLOTS[i]) !== 0) return null;
    const ci = homeSlotIndex(c, U_SLOTS);
    const ei = homeSlotIndex(e, U_EDGE_SLOTS);
    if (ci < 0 || ei < 0) return null;
    cd.push(ci);
    ed.push(ei);
  }
  if (new Set(cd).size !== 4 || new Set(ed).size !== 4) return null;
  return cd.join('') + '/' + ed.join('');
}

/** The U face turn, used for AUF canonicalisation. */
const U_TURN = makeMove('U');

/** A copy of the state turned by y (the whole-cube AUF turn). */
function rotateY(state) {
  const out = state.clone();
  const m = [0, 0, 1, 0, 1, 0, -1, 0, 0]; // Yp
  for (const c of out.cubies) {
    c.pos = matApply(m, c.pos);
    c.rot = matMul(m, c.rot);
  }
  return out;
}
