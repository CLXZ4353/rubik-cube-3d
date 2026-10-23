// Sticker strings: the compact, puzzle-agnostic form of a cube state.
//
// Format (clone-internal, fixed): the six faces concatenated in the order
// U F R B L D, each face read as a grid of size*size sticker letters, rows
// top-to-bottom and columns left-to-right with the face viewed from outside
// and the cube's U face on top (the standard "net" orientation).
//
// Colour letters are the face whose sticker is that colour in the solved cube:
//   U = white, D = yellow, R = red, L = orange, F = green, B = blue.
//
// stateToStickerString(state) and stickerStringToState(str) are exact inverses
// for legal states (round-trip verified in tests/sticker.test.mjs).

import { R24, matApply } from '../moves.js';
import { DIRECTION_COLORS } from '../constants.js';
import { CubeState } from '../CubeState.js';

const FACE_GRIDS = {
  U: { n: [0, 1, 0], up: [0, 0, -1], right: [1, 0, 0] },
  F: { n: [0, 0, 1], up: [0, 1, 0], right: [1, 0, 0] },
  R: { n: [1, 0, 0], up: [0, 1, 0], right: [0, 0, -1] },
  B: { n: [0, 0, -1], up: [0, 1, 0], right: [-1, 0, 0] },
  L: { n: [-1, 0, 0], up: [0, 1, 0], right: [0, 0, 1] },
  D: { n: [0, -1, 0], up: [0, 0, 1], right: [1, 0, 0] },
};

export const FACE_ORDER = ['U', 'F', 'R', 'B', 'L', 'D'];

// colour name -> its letter in the solved cube.
const COLOR_LETTER = {};
const LETTER_COLOR = {};
{
  const home = { U: '0,1,0', D: '0,-1,0', R: '1,0,0', L: '-1,0,0', F: '0,0,1', B: '0,0,-1' };
  for (const [letter, key] of Object.entries(home)) {
    const c = DIRECTION_COLORS[key];
    COLOR_LETTER[c] = letter;
    LETTER_COLOR[letter] = c;
  }
}

/** The layer coordinate of grid index idx (0 = most negative) for a size-N cube. */
export function posCoord(size, idx) {
  if (size % 2 === 1) return idx - (size - 1) / 2;
  return 2 * idx - (size - 1);
}

/** The position (integer triple) of one grid cell of a face. */
export function cellPos(face, size, row, col) {
  const g = FACE_GRIDS[face];
  const rowIdx = size - 1 - row; // row 0 sits at the `up` end
  const p = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    p[k] = g.n[k] * posCoord(size, size - 1) + g.up[k] * posCoord(size, rowIdx) + g.right[k] * posCoord(size, col);
    if (p[k] === 0) p[k] = 0;
  }
  return p;
}

/** Index of a face cell in the sticker string. */
export function cellIndex(face, size, row, col) {
  return FACE_ORDER.indexOf(face) * size * size + row * size + col;
}

/** state -> 6*size*size sticker letters (null when the cube has no stickers somewhere). */
export function stateToStickerString(state) {
  const size = state.size;
  const out = new Array(6 * size * size);
  for (const face of FACE_ORDER) {
    const g = FACE_GRIDS[face];
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const p = cellPos(face, size, row, col);
        let letter = '?';
        for (const c of state.cubies) {
          if (c.pos.x !== p[0] || c.pos.y !== p[1] || c.pos.z !== p[2]) continue;
          for (const s of c.stickers) {
            const w = matApply(c.rot, s.n);
            if (w.x === g.n[0] && w.y === g.n[1] && w.z === g.n[2]) letter = COLOR_LETTER[s.color] ?? '?';
          }
        }
        if (letter === '?') return null;
        out[cellIndex(face, size, row, col)] = letter;
      }
    }
  }
  return out.join('');
}

/** sticker string -> state; the canonical (lowest R24 index) fit wins.
 * shortcut: assigns each piece independently, which is exact for N <= 3; on
 * N >= 4 same-colour centres can claim the same cell. Upgrade: assign pieces
 * per orbit (corners/edges/centres) with a matching, not a greedy fit. */
export function stickerStringToState(str, size = 3) {
  if (str.length !== 6 * size * size) throw new Error(`Sticker string for size ${size} must be ${6 * size * size} chars`);
  for (const ch of str) if (!LETTER_COLOR[ch]) throw new Error(`Unknown sticker letter: ${ch}`);
  const st = new CubeState(size);
  for (const c of st.cubies) {
    if (!c.stickers.length) continue;
    let fitted = null;
    for (const rot of R24) {
      const p = matApply(rot, c.home);
      let ok = true;
      for (const s of c.stickers) {
        const w = matApply(rot, s.n);
        const want = COLOR_LETTER[s.color];
        let found = false;
        for (const face of FACE_ORDER) {
          const g = FACE_GRIDS[face];
          if (g.n[0] !== w.x || g.n[1] !== w.y || g.n[2] !== w.z) continue;
          for (let row = 0; row < size && !found; row++) {
            for (let col = 0; col < size && !found; col++) {
              const q = cellPos(face, size, row, col);
              if (q[0] !== p.x || q[1] !== p.y || q[2] !== p.z) continue;
              found = str[cellIndex(face, size, row, col)] === want;
            }
          }
          break;
        }
        if (!found) { ok = false; break; }
      }
      if (ok) { fitted = rot; break; }
    }
    if (!fitted) return null; // not a legal cube
    const p = matApply(fitted, c.home);
    c.pos = { x: p.x, y: p.y, z: p.z };
    c.rot = [...fitted];
  }
  return st;
}

/** Rotate a sticker string by whole-cube moves (the Cross Color selector). */
export function rotateStickerString(str, rotations, size = 3) {
  const st = stickerStringToState(str, size);
  if (!st) return null;
  for (const mv of rotations) st.applyMove(mv);
  return stateToStickerString(st);
}
