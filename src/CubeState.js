// The authoritative logical cube state.
//
// The cube consists of 27 discrete "cubies" at integer coordinates in {-1,0,1}^3.
// Every cubie carries:
//   home    - its position in the solved cube (integer point)
//   pos     - its current position (integer point)
//   rot     - exact 3x3 INTEGER orientation matrix (one of the 24 rotations)
//   stickers- outward face normals + colours in the cubie's LOCAL frame
//
// Invariant: for every cubie, pos = rot ∘ home.
// A move is applied by integer matrix multiplication only — no floats.

import { ID3, matApply, matMul, moveMatrix, AXES } from './moves.js';
import { DIRECTION_COLORS } from './constants.js';

const DIRECTIONS = [
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
];

export class CubeState {
  constructor(cubies) {
    if (cubies && cubies.length === 27) {
      // Reconstruct from a structured-cloned array of {id, home, pos, rot (flat 9), stickers}.
      this.cubies = cubies.map((c) => ({
        id: c.id,
        home: { x: c.home.x, y: c.home.y, z: c.home.z },
        pos: { x: c.pos.x, y: c.pos.y, z: c.pos.z },
        rot: [c.rot[0] | 0, c.rot[1] | 0, c.rot[2] | 0, c.rot[3] | 0, c.rot[4] | 0, c.rot[5] | 0, c.rot[6] | 0, c.rot[7] | 0, c.rot[8] | 0],
        stickers: c.stickers.map((s) => ({ n: { x: s.n.x, y: s.n.y, z: s.n.z }, color: s.color })),
      }));
    } else {
      this.cubies = [];
      this.reset();
    }
  }

  /** Build the solved 3x3x3 state (27 cubies), OR reset existing cubies in place
      (so external references remain valid after reset). */
  reset() {
    if (this.cubies && this.cubies.length === 27) {
      const I9 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      for (const c of this.cubies) {
        c.pos = { x: c.home.x, y: c.home.y, z: c.home.z };
        c.rot = I9.slice();
      }
      return;
    }
    this.cubies = [];
    let id = 0;
    for (const x of [-1, 0, 1]) {
      for (const y of [-1, 0, 1]) {
        for (const z of [-1, 0, 1]) {
          const home = { x, y, z };
          const stickers = [];
          for (const axis of ['x', 'y', 'z']) {
            const v = home[axis];
            if (v !== 0) {
              const n = { x: 0, y: 0, z: 0 };
              n[axis] = v;
              stickers.push({ n, color: DIRECTION_COLORS[`${n.x},${n.y},${n.z}`] });
            }
          }
          this.cubies.push({ id: id++, home, pos: { x, y, z }, rot: [...ID3], stickers });
        }
      }
    }
  }

  /** Apply a move exactly (integer arithmetic only). */
  applyMove(move) {
    const M = moveMatrix(move);
    const axis = AXES[move.axis];
    for (const c of this.cubies) {
      if (!move.whole && c.pos[axis] !== move.layer) continue;
      c.pos = matApply(M, c.pos);
      c.rot = matMul(M, c.rot);
    }
  }

  /**
   * Solved = every face shows one uniform colour.
   * For a 3x3 this is equivalent to a physically solved cube,
   * up to whole-cube rotation and invisible centre twists.
   */
  isSolved() {
    for (const d of DIRECTIONS) {
      let color = null;
      for (const c of this.cubies) {
        for (const s of c.stickers) {
          const w = matApply(c.rot, s.n);
          if (w.x === d.x && w.y === d.y && w.z === d.z) {
            if (color === null) color = s.color;
            else if (color !== s.color) return false;
          }
        }
      }
      if (color === null) return false;
    }
    return true;
  }

  /** Exact full-state key (for tests and debugging). */
  fingerprint() {
    return this.cubies
      .map((c) => `${c.home.x},${c.home.y},${c.home.z}=>${c.pos.x},${c.pos.y},${c.pos.z}|${c.rot.join('')}`)
      .join(';');
  }

  clone() {
    const s = new CubeState();
    s.cubies = this.cubies.map((c) => ({
      id: c.id,
      home: { ...c.home },
      pos: { ...c.pos },
      rot: [...c.rot],
      stickers: c.stickers.map((st) => ({ n: { ...st.n }, color: st.color })),
    }));
    return s;
  }
}
