// The authoritative logical cube state, generalized to N x N.
//
// The cube consists of N^3 discrete "cubies" at integer coordinates:
// odd N → -(N-1)/2 … +(N-1)/2, even N → ±1, ±3, … (no central layer).
// Every cubie carries:
//   home     - its position in the solved cube (integer point)
//   pos      - its current position (integer point)
//   rot      - exact 3x3 INTEGER orientation matrix (one of the 24 rotations)
//   stickers - outward face normals + colours in the cubie's LOCAL frame
//
// Invariant: for every cubie, pos = rot ∘ home.
// A move is applied by integer matrix multiplication only — no floats.

import { ID3, matApply, matMul, moveMatrix, AXES, layerCoords, moveIncludesLayer } from './moves.js';
import { schemeColors } from './puzzle/schemes.js';

const DIRECTIONS = [
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
];

export class CubeState {
  /** new CubeState() = solved 3x3, CubeState(size: 2) = solved 2x2,
   * CubeState(cubies) = rebuild from a structured-cloned cubie array. */
  constructor(arg = null, scheme = null) {
    this.schemeName = scheme || 'classic';
    if (Array.isArray(arg)) {
      this.size = Math.round(Math.cbrt(arg.length));
      this.cubies = arg.map((c) => ({
        id: c.id,
        home: { x: c.home.x, y: c.home.y, z: c.home.z },
        pos: { x: c.pos.x, y: c.pos.y, z: c.pos.z },
        rot: [c.rot[0] | 0, c.rot[1] | 0, c.rot[2] | 0, c.rot[3] | 0, c.rot[4] | 0, c.rot[5] | 0, c.rot[6] | 0, c.rot[7] | 0, c.rot[8] | 0],
        stickers: c.stickers.map((s) => ({ n: { x: s.n.x, y: s.n.y, z: s.n.z }, color: s.color })),
      }));
      return;
    }
    if (arg && typeof arg === 'object') this.size = arg.size || 3;
    else this.size = arg || 3;
    this.cubies = [];
    this.reset();
  }

  /** Build (or reset in place) the solved state for this size + scheme. */
  reset() {
    const I9 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (this.cubies && this.cubies.length === this.size ** 3) {
      for (const c of this.cubies) {
        c.pos = { x: c.home.x, y: c.home.y, z: c.home.z };
        c.rot = I9.slice();
      }
      return;
    }
    const colors = schemeColors(this.schemeName);
    const ext = Math.max(...this.layerCoords().map((c) => Math.abs(c)));
    this.cubies = [];
    let id = 0;
    for (const x of this.layerCoords()) {
      for (const y of this.layerCoords()) {
        for (const z of this.layerCoords()) {
          const home = { x, y, z };
          const stickers = [];
          for (const axis of ['x', 'y', 'z']) {
            const v = home[axis];
            if (Math.abs(v) !== ext) continue; // only the outermost layer shows
            const n = { x: 0, y: 0, z: 0 };
            n[axis] = v > 0 ? 1 : -1;
            const color = colors[`${n.x},${n.y},${n.z}`];
            if (color) stickers.push({ n, color });
          }
          this.cubies.push({ id: id++, home, pos: { x, y, z }, rot: [...ID3], stickers });
        }
      }
    }
  }

  layerCoords() {
    const out = [];
    for (let idx = 0; idx < this.size; idx++) out.push(this.posCoord(idx));
    return out;
  }

  /** Grid index -> layer coordinate (matches src/render/stickerString.js). */
  posCoord(idx) {
    if (this.size % 2 === 1) return idx - (this.size - 1) / 2;
    return 2 * idx - (this.size - 1);
  }

  /** Apply a move exactly (integer arithmetic only). */
  applyMove(move) {
    const M = moveMatrix(move);
    const axis = AXES[move.axis];
    for (const c of this.cubies) {
      if (!move.whole && !moveIncludesLayer(move, c.pos[axis])) continue;
      c.pos = matApply(M, c.pos);
      c.rot = matMul(M, c.rot);
    }
  }

  /** Every piece sits where its orientation matrix says it must. */
  invariantOK() {
    for (const c of this.cubies) {
      const p = matApply(c.rot, c.home);
      if (p.x !== c.pos.x || p.y !== c.pos.y || p.z !== c.pos.z) return false;
    }
    return true;
  }

  /**
   * Solved = every face shows one uniform colour.
   * Up to whole-cube rotation and invisible centre twists, this is a physically
   * solved cube; for even sizes there are no centre stickers, so the faces only
   * have to be uniform.
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
      // A face with no stickers at all (a 1x1 degenerate cube) is not a face.
      if (color === null && this.size > 1) return false;
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
    const s = new CubeState({ size: this.size, scheme: this.schemeName });
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
