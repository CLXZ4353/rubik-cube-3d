// Search primitives shared by the cross trainer and the analyzer.
//
// A full 3x3 BFS is impossible, so the search runs in a PROJECTION: the visited
// key keeps only the pieces that matter for the step. Moves come from the real
// cube, so every sequence found is a real sequence, and the goal test looks
// only at the projected pieces. That is what keeps cross depth 7 affordable.

import { CubeState } from '../CubeState.js';
import { parseNotation } from '../moves.js';
import { faceStickers } from '../render/net2d.js';
import { stateToStickerString } from '../render/stickerString.js';

/** The 18 face turns, as notation tokens (wide/slice moves never build a cross). */
export const FACE_TURNS = ['U', "U'", 'U2', 'D', "D'", 'D2', 'R', "R'", 'R2', 'L', "L'", 'L2', 'F', "F'", 'F2', 'B', "B'", 'B2'];

/** The bottom layer: D face plus the four bottom side rows (27 letters). */
export function crossKey(state) {
  const s = stateToStickerString(state);
  let out = faceStickers(s, 'D', 3);
  for (const face of ['F', 'R', 'B', 'L']) out += faceStickers(s, face, 3).slice(6, 9);
  return out;
}

/** Where a piece whose home is `v` currently sits, plus its orientation.
 * This is exact (no sticker guessing) and cheap. */
function pieceStamp(state, v) {
  for (const c of state.cubies) {
    if (c.home.x !== v[0] || c.home.y !== v[1] || c.home.z !== v[2]) continue;
    return `${c.pos.x},${c.pos.y},${c.pos.z}|${c.rot.join('')}`;
  }
  return '?';
}

/** The four F2L slots, named by the corner that belongs to them. */
export const SLOTS = ['FR', 'FL', 'BL', 'BR'];
const CORNER = { FR: [1, -1, 1], FL: [-1, -1, 1], BL: [-1, -1, -1], BR: [1, -1, -1] };
const EDGE = { FR: [1, -1, 0], FL: [-1, -1, 0], BL: [0, -1, -1], BR: [1, -1, 0] };

/** The slot pair (corner + its edge) plus the bottom layer around it. */
export function pairKey(state, slot) {
  return crossKey(state) + pieceStamp(state, CORNER[slot]) + pieceStamp(state, EDGE[slot]);
}

/** The whole last layer, for the LL planner's "is it already solved" test. */
export function llKey(state) {
  const s = stateToStickerString(state);
  let out = faceStickers(s, 'U', 3);
  for (const face of ['F', 'R', 'B', 'L']) out += faceStickers(s, face, 3).slice(0, 3);
  return out;
}

const SOLVED_KEY_FOR_CROSS = (() => {
  const st = new CubeState(3);
  return crossKey(st);
})();

/** A cross is done when the bottom layer reads as solved. */
export function crossGoal(state) {
  return crossKey(state) === SOLVED_KEY_FOR_CROSS;
}

/** A slot pair is done when both pieces sit home with the right orientation. */
export function pairGoal(state, slot) {
  return pieceStamp(state, CORNER[slot]) === homeStamp(CORNER[slot]) &&
    pieceStamp(state, EDGE[slot]) === homeStamp(EDGE[slot]);
}

function homeStamp(v) {
  return `${v[0]},${v[1]},${v[2]}|100010001`;
}

/** Breadth-first move search in a projection: shortest sequences first.
 * `limit` caps how many solutions come back, `maxDepth` caps the length. */
export function search(state, keyFn, goalFn, maxDepth, limit = 8, tokens = FACE_TURNS) {
  const found = [];
  const seen = new Set([keyFn(state)]);
  let frontier = [{ st: state, path: [] }];
  for (let depth = 0; depth < maxDepth && found.length < limit; depth++) {
    const next = [];
    for (const node of frontier) {
      for (const t of tokens) {
        const st = node.st.clone();
        for (const mv of parseNotation(t)) st.applyMove(mv);
        const k = keyFn(st);
        if (seen.has(k)) continue;
        seen.add(k);
        const path = node.path.concat([t]);
        if (goalFn(st)) {
          found.push(path.join(' '));
          if (found.length >= limit) break;
        }
        next.push({ st, path });
      }
    }
    frontier = next;
  }
  return found;
}
