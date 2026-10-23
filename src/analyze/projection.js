// Cross and F2L search for the analyzer and the cross trainer.
//
// The cross search runs on a projection so depth 7 is affordable: only the
// four edges carrying the cross colour are tracked (their slots and flips),
// giving at most 12^4 * 2^4 = 331776 keys. The move tables are derived from
// the engine at load time, so the projection cannot disagree with the cube.
//
// The pair search is small by construction: it only walks states that keep the
// cross solved, and its key is just the two pieces of the pair (corner slot +
// twist, edge slot + flip) = 8*3 * 12*2 = 576 keys.

import { CubeState } from '../CubeState.js';
import { parseNotation, faceInfo } from '../moves.js';

export const EDGE_SLOTS = [[0, 1, 1], [0, 1, -1], [-1, 1, 0], [1, 1, 0], [0, -1, 1], [0, -1, -1], [-1, -1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [-1, 0, -1], [-1, 0, 1]];
export const CORNER_SLOTS = [[1, 1, 1], [1, 1, -1], [-1, 1, -1], [-1, 1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1], [-1, -1, 1]];

export const MOVES = ['U', "U'", 'U2', 'D', "D'", 'D2', 'R', "R'", 'R2', 'L', "L'", 'L2', 'F', "F'", 'F2', 'B', "B'", 'B2'];
const I9 = '100010001';

function edgeIndexOf(v) {
  for (let i = 0; i < 12; i++) if (EDGE_SLOTS[i][0] === v[0] && EDGE_SLOTS[i][1] === v[1] && EDGE_SLOTS[i][2] === v[2]) return i;
  return 0;
}
function cornerIndexOf(v) {
  for (let i = 0; i < 8; i++) if (CORNER_SLOTS[i][0] === v[0] && CORNER_SLOTS[i][1] === v[1] && CORNER_SLOTS[i][2] === v[2]) return i;
  return 0;
}

/** Per move: where each edge slot's occupant lands, and its flip delta. */
const EDGE_TABLE = (() => {
  const out = [];
  for (const tok of MOVES) {
    const mv = parseNotation(tok)[0];
    const st = new CubeState(3);
    st.applyMove(mv);
    const perm = new Int16Array(12);
    const flip = new Uint8Array(12);
    for (let s = 0; s < 12; s++) {
      const home = EDGE_SLOTS[s];
      for (const c of st.cubies) {
        if (c.home.x !== home[0] || c.home.y !== home[1] || c.home.z !== home[2]) continue;
        perm[s] = edgeIndexOf([c.pos.x, c.pos.y, c.pos.z]);
        flip[s] = c.rot.join('') === I9 ? 0 : 1;
      }
    }
    out.push({ perm, flip });
  }
  return out;
})();

/** The face a cross colour sits on. */
export const COLOUR_FACE = { white: 'U', yellow: 'D', green: 'F', blue: 'B', red: 'L', orange: 'R' };

/** The four edge identities carrying a cross colour. */
export function crossEdges(colour = 'yellow') {
  const def = faceInfo(COLOUR_FACE[colour]).def;
  const axis = 'xyz'.indexOf(def.axis.toLowerCase());
  const out = [];
  for (let i = 0; i < 12; i++) if (EDGE_SLOTS[i][axis] === def.sign) out.push(i);
  return out;
}

function readTracked(state, tracked) {
  const pos = [0, 0, 0, 0];
  const ori = [0, 0, 0, 0];
  for (let t = 0; t < 4; t++) {
    const home = EDGE_SLOTS[tracked[t]];
    for (const c of state.cubies) {
      if (c.home.x !== home[0] || c.home.y !== home[1] || c.home.z !== home[2]) continue;
      pos[t] = edgeIndexOf([c.pos.x, c.pos.y, c.pos.z]);
      ori[t] = c.rot.join('') === I9 ? 0 : 1;
    }
  }
  return { pos, ori };
}

function encodeCross(pos, ori) {
  let key = 0;
  let f = 0;
  for (let t = 0; t < 4; t++) {
    key = key * 12 + pos[t];
    f = f * 2 + ori[t];
  }
  return key * 16 + f;
}

export function crossKeyOf(state, tracked) {
  const r = readTracked(state, tracked);
  return encodeCross(r.pos, r.ori);
}

export function crossGoalKey(tracked) {
  return encodeCross([tracked[0], tracked[1], tracked[2], tracked[3]], [0, 0, 0, 0]);
}

export function crossSolved(state, tracked) {
  return crossKeyOf(state, tracked) === crossGoalKey(tracked);
}

/** Cross sequences, shortest first. The search only remembers the projection
 * key, but each step is taken with the real cube (replaying the node's path),
 * so the projection can never invent a sequence the cube would not do. */
export function crossSolutions(state, colour = 'yellow', maxDepth = 7, limit = 6) {
  const tracked = crossEdges(colour);
  const goal = crossGoalKey(tracked);
  const startKey = crossKeyOf(state, tracked);
  if (startKey === goal) return [''];
  const seen = new Set([startKey]);
  let frontier = [{ st: state, path: [] }];
  const found = [];
  for (let depth = 0; depth < maxDepth && found.length < limit; depth++) {
    const next = [];
    for (const node of frontier) {
      for (const tok of MOVES) {
        const mv = parseNotation(tok)[0];
        const st = node.st.clone();
        st.applyMove(mv);
        const nk = crossKeyOf(st, tracked);
        const path = node.path.concat([tok]);
        if (nk === goal) {
          found.push(path.join(' '));
          if (found.length >= limit) break;
          continue;
        }
        if (seen.has(nk)) continue;
        seen.add(nk);
        next.push({ st, path });
      }
    }
    // shortcut: the frontier is capped so a browser tab stays responsive; raise
    // NODE_CAP (or page through the worker) for exhaustive counts.
    if (next.length > NODE_CAP) next.length = NODE_CAP;
    frontier = next;
  }
  return found;
}

const NODE_CAP = 60000; // capped so one page stays responsive in a browser tab

/** The four F2L pairs: a bottom-layer corner and the middle edge beside it. */
export const SLOTS = {
  FR: { corner: 4, edge: 8 }, // DFR + FR
  BR: { corner: 5, edge: 9 }, // DBR + BR
  BL: { corner: 6, edge: 10 }, // DBL + BL
  FL: { corner: 7, edge: 11 }, // DFL + FL
};

/** A pair is solved when both its pieces sit home, unstuck. */
export function pairSolved(state, slot) {
  const s = SLOTS[slot];
  return stamp(state, CORNER_SLOTS[s.corner]) === homeStamp(CORNER_SLOTS[s.corner]) &&
    stamp(state, EDGE_SLOTS[s.edge]) === homeStamp(EDGE_SLOTS[s.edge]);
}

function stamp(state, homeVec) {
  for (const c of state.cubies) {
    if (c.home.x !== homeVec[0] || c.home.y !== homeVec[1] || c.home.z !== homeVec[2]) continue;
    const at = homeVec.length === 3 && Math.abs(homeVec[0]) + Math.abs(homeVec[1]) + Math.abs(homeVec[2]) === 3
      ? cornerIndexOf([c.pos.x, c.pos.y, c.pos.z])
      : edgeIndexOf([c.pos.x, c.pos.y, c.pos.z]);
    return `${at}|${c.rot.join('')}`;
  }
  return '?';
}

function homeStamp(homeVec) {
  const at = Math.abs(homeVec[0]) + Math.abs(homeVec[1]) + Math.abs(homeVec[2]) === 3
    ? cornerIndexOf(homeVec)
    : edgeIndexOf(homeVec);
  return `${at}|${I9}`;
}

/** A slot's pair key: corner slot+twist and edge slot+flip (576 values). */
export function pairKeyOf(state, slot) {
  const s = SLOTS[slot];
  const c = stamp(state, CORNER_SLOTS[s.corner]);
  const e = stamp(state, EDGE_SLOTS[s.edge]);
  const ci = Number(c.split('|')[0]);
  const ct = c.split('|')[1] === I9 ? 0 : 1;
  const ei = Number(e.split('|')[0]);
  const et = e.split('|')[1] === I9 ? 0 : 1;
  return (ci * 2 + ct) * 24 + (ei * 2 + et);
}

/** F2L pair sequences for a state: candidate insertions are drawn from a bounded
 * pool of move sequences (a slot's own faces plus the U turns), and each
 * candidate is kept only if the pair ends solved AND the cross ends solved.
 * That is how real insertions look, and the check means a wrong candidate can
 * never be reported. Bigger inserts (tricky pair cases) fall outside the pool;
 * raising MAX_LEN widens the search at proportionally more time.
 * shortcut: pool instead of a pair pattern database; upgrade: a PDB per slot. */
export function pairSolutions(state, slot, colour = 'yellow', maxLen = 4, limit = 3) {
  const tracked = crossEdges(colour);
  const goal = crossGoalKey(tracked);
  const out = [];
  const alphabet = POOL[slot];
  const seqs = sequences(alphabet, maxLen);
  for (const seq of seqs) {
    const st = state.clone();
    for (const tok of seq) st.applyMove(parseNotation(tok)[0]);
    if (crossKeyOf(st, tracked) === goal && pairSolved(st, slot)) {
      out.push(seq.join(' '));
      if (out.length >= limit) return out;
    }
  }
  return out;
}

const POOL = {
  FR: ['R', "R'", 'R2', 'U', "U'", 'U2', 'F', "F'"],
  BR: ['R', "R'", 'R2', 'U', "U'", 'U2', 'B', "B'"],
  BL: ['L', "L'", 'L2', 'U', "U'", 'U2', 'B', "B'"],
  FL: ['L', "L'", 'L2', 'U', "U'", 'U2', 'F', "F'"],
};

function sequences(alphabet, maxLen) {
  const out = [];
  let acc = [[]];
  for (let len = 1; len <= maxLen; len++) {
    const next = [];
    for (const part of acc) {
      for (const tok of alphabet) {
        if (part.length && part[part.length - 1] === tok) continue;
        const seq = part.concat([tok]);
        next.push(seq);
        out.push(seq);
      }
    }
    acc = next;
  }
  return out;
}
