// Two-phase (Kociemba-style) cube solver — REAL solver, independent of rendering.
//
// Phase 1: IDA* over three coordinates — corner twist (2187), edge flip in the
//   STANDARD UD gauge (2048), and the UD-slice coordinate (495) — pruned by three
//   pairwise PDBs (co+eo 4.48M, co+ud 1.08M, eo+ud 1.01M entries).
//   We do NOT stop at the optimal phase-1 length: one G1-entry candidate per bound
//   (optimal, +1, +2, ...) is collected; the candidate with the cheapest phase 2
//   wins, which is what makes 20-turn scrambles solve in milliseconds.
//
//   The std UD flip gauge (U/D sticker normal for U/D edges, F/B sticker normal for
//   slice edges) is INVARIANT under the 10 phase-2 moves — asserted at build time.
//   That makes the phase-1 goal {tw=0, fl=0, ud-solved} exactly the G1 subgroup
//   (closed-ness asserted: tw/fl/ud coordinates stay solved under every G1 move).
//
// Phase 2: IDA* in G1 = <U,U',U2,D,D',D2,L2,R2,F2,B2> over rank coordinates
//   (corner permutation 40320, UD-edge permutation 40320, slice permutation 24).
//   Because tw and fl stay 0 through G1, a state entering G1 is fully determined by
//   its three permutations; solving (cr,e8,s4) -> (0,0,0) solves the cube.
//   Pruning: JCE = exact Kociemba virtual-space PDB (2768 corner-classes x 40320
//   conjugate UD-edge perms = 111.6M entries, pre-generated), CS = exact
//   (corner perm x slice perm), ES = exact (UD-edge perm x slice perm), E8/S4 singles.
//
// Whole-cube-rotated inputs are normalized (inverse whole-cube rotation prepended;
// solution move indices reference ALL_MOVES_FULL: 0-17 face moves, 18-26 whole).
// Typical: 21-23 total moves for 20-turn scrambles, solve time < 50 ms.
// Runs inside a Web Worker with progress reporting + SharedArrayBuffer cancellation.

import { ALL_MOVES, ALL_MOVES_FULL, WHOLE_MOVES, R24, R24_INDEX, ID3, matKey, moveMatrix, matMul, matApply, AXES } from './moves.js';

const FMOVES = ALL_MOVES; // 18 face moves

// ---- table identity ------------------------------------------------------
// FNV-1a/32 (Math.imul wraps to 32 bits, so the same code runs in the browser
// and in the Node pregen scripts).
function fnvBytes(buf) {
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) h = Math.imul(h ^ buf[i], 0x01000193);
  return (h >>> 0).toString(16);
}

/** Fingerprint of everything the pre-computed PDBs are derived from: the 18-move
   face/layer/angle table, the phase-1 transition tables, G1 and the PDB sizes.
   The worker compares it against data/pdb_meta.json and refuses tables that do
   not match, instead of silently pruning with wrong distances.
   shortcut: covers the inputs Solver.js derives; the jointCE BFS in
   tests/pregen_jointCE.mjs is not in here, so re-run the pregen scripts after
   changing it (they rewrite pdb_meta.json with the new v). */
function tablesVersion() {
  let h = 0x811c9dc5;
  const byte = (x) => { h = Math.imul(h ^ (x & 255), 0x01000193); };
  const i32 = (n) => { byte(n); byte(n >>> 8); byte(n >>> 16); byte(n >>> 24); };
  const tab = (t) => { for (let i = 0; i < t.length; i++) i32(t[i]); };
  for (const mv of FMOVES) { i32(mv.axis.charCodeAt(0)); i32(mv.layer); i32(mv.angle); }
  tab(twTransTab); tab(flTransTab); tab(udsTransTab);
  for (const mi of G1_IDX) i32(mi);
  i32(SOLVED_UDS); i32(2768); i32(40320); i32(2187); i32(2048); i32(495); i32(24);
  return (h >>> 0).toString(36);
}
const EDGE_SLOTS = [[0,1,1],[0,1,-1],[-1,1,0],[1,1,0],[0,-1,1],[0,-1,-1],[-1,-1,0],[1,-1,0],[1,0,1],[1,0,-1],[-1,0,-1],[-1,0,1]]; // UF,UB,UL,UR,DF,DB,DL,DR,FR,BR,BL,FL
const CORNER_SLOTS = [[1,1,1],[1,1,-1],[-1,1,-1],[-1,1,1],[1,-1,1],[1,-1,-1],[-1,-1,-1],[-1,-1,1]]; // UFR,UBR,UBL,UFL,DFR,DBR,DBL,DFL

const key3 = p => ((p[0] + 1) * 7 + (p[1] + 1)) * 7 + (p[2] + 1);
const vec = a => ({ x: a[0], y: a[1], z: a[2] });
const edgeSlotIdx = new Map(EDGE_SLOTS.map((q, i) => [key3(q), i]));
const cornerSlotIdx = new Map(CORNER_SLOTS.map((q, i) => [key3(q), i]));

const edgePairs = [], cornerPairs = [], moveRot = [];
for (const mv of FMOVES) {
  const M = moveMatrix(mv); const ep = []; const cp = [];
  for (let s = 0; s < 12; s++) { const p = vec(EDGE_SLOTS[s]); if (p[AXES[mv.axis]] !== mv.layer) continue; const np = matApply(M, p); const d = edgeSlotIdx.get(key3([np.x, np.y, np.z])); if (d !== s) ep.push([s, d]); }
  for (let s = 0; s < 8; s++) { const p = vec(CORNER_SLOTS[s]); if (p[AXES[mv.axis]] !== mv.layer) continue; const np = matApply(M, p); const d = cornerSlotIdx.get(key3([np.x, np.y, np.z])); if (d !== s) cp.push([s, d]); }
  edgePairs.push(ep); cornerPairs.push(cp);
  moveRot.push(R24.map(r => R24_INDEX.get(matKey(matMul(M, r)))));
}
const invIdx = FMOVES.map(mv => FMOVES.findIndex(o => o.face === mv.face && o.angle === -mv.angle));
void invIdx;
const G1_IDX = [0, 1, 2, 3, 4, 5, 8, 11, 14, 17]; // U,U',U2,D,D',D2,L2,R2,F2,B2

// --- flip machinery ---
// Legacy per-placement flip lookup (used by external tooling/tests only).
function slotDirs(s) { const q = EDGE_SLOTS[s]; const d = []; for (let a = 0; a < 3; a++) if (q[a] !== 0) d.push([0, 0, 0].map((_, i) => (i === a ? q[a] : 0))); return d; }
function matFromBasis(M, B) { const R = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { let sum = 0; for (let k = 0; k < 3; k++) sum += M[k][r] * B[k][c]; R[r * 3 + c] = sum; } return R; }
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
function oriOf(e, s, f) {
  const hd = slotDirs(e), sd = slotDirs(s); let M, B;
  if (f === 0) { const a = hd[0], b = hd[1], c1 = cross(hd[0], hd[1]), s0 = sd[0], s1 = sd[1], c2 = cross(s0, s1); M = [s0, s1, c2]; B = [a, b, c1]; }
  else { const a1 = hd[0], b1 = hd[1], c1 = cross(hd[0], hd[1]), s0 = sd[1], s1 = sd[0], c2 = cross(s0, s1); M = [s0, s1, c2]; B = [a1, b1, c1]; }
  const R = matFromBasis(M, B); return R24_INDEX.get(matKey(R));
}
const flipTable = [];
for (let e = 0; e < 12; e++) { const te = []; for (let s = 0; s < 12; s++) { const row = new Int8Array(24).fill(-1); for (const f of [0, 1]) { const o = oriOf(e, s, f); if (o >= 0) row[o] = f; } te.push(row); } flipTable.push(te); }
const flipOf = (e, s, o) => flipTable[e][s][o];
// Standard UD gauge: np(e) = home normal with y!=0 (U/D sticker) for U/D edges (home
// 0..7), home normal with z!=0 (F/B sticker) for slice edges (home 8..11).
const npVec = [];
for (let e = 0; e < 12; e++) { const q = EDGE_SLOTS[e]; npVec.push(q[1] !== 0 ? [0, q[1], 0] : [0, 0, q[2]]); }
const flipStd = (e, s, o) => {
  const m = R24[o], n = npVec[e];
  const py = m[3] * n[0] + m[4] * n[1] + m[5] * n[2];
  const pz = m[6] * n[0] + m[7] * n[1] + m[8] * n[2];
  return (s < 8 ? py !== 0 : pz !== 0) ? 0 : 1;
};

// --- corner twist machinery (orbit-index gauge) ---
function r120mat(s) {
  const [Sx, Sy, Sz] = CORNER_SLOTS[s];
  return [0, (Sx * Sy - Sz) / 2, (Sx * Sz + Sy) / 2, (Sx * Sy + Sz) / 2, 0, (Sy * Sz - Sx) / 2, (Sx * Sz - Sy) / 2, (Sy * Sz + Sx) / 2, 0];
}
const ORBIT = [], ORBIT_IDX = [];
for (let s = 0; s < 8; s++) {
  const Rm = r120mat(s);
  const v0 = [0, CORNER_SLOTS[s][1], 0];
  const next = (v, Rm) => [Rm[0] * v[0] + Rm[1] * v[1] + Rm[2] * v[2], Rm[3] * v[0] + Rm[4] * v[1] + Rm[5] * v[2], Rm[6] * v[0] + Rm[7] * v[1] + Rm[8] * v[2]];
  const v1 = next(v0, Rm);
  const v2 = next(v1, Rm);
  ORBIT[s] = [v0, v1, v2];
  ORBIT_IDX[s] = new Map([v0, v1, v2].map((v, i) => [key3(v), i]));
}
const twistIdxLocal = (s, d) => ORBIT_IDX[s].get(key3([d.x, d.y, d.z]));
const twistTable = []; // twistTable[slot][homeYSign(0/1)][rotCode] -> orbit index
for (let s = 0; s < 8; s++) {
  const rows = [new Int8Array(24), new Int8Array(24)];
  for (let h = 0; h < 2; h++) {
    const hy = h === 1 ? 1 : -1;
    for (let r = 0; r < 24; r++) {
      const rot = R24[r];
      const d = matApply(rot, { x: 0, y: hy, z: 0 });
      rows[h][r] = twistIdxLocal(s, d) ?? -1;
    }
  }
  twistTable.push(rows);
}
const CHH = new Int8Array(8);
for (let h = 0; h < 8; h++) CHH[h] = CORNER_SLOTS[h][1] > 0 ? 1 : 0;
const TW3 = [1, 3, 9, 27, 81, 243, 729];
const TW3_8 = [1, 3, 9, 27, 81, 243, 729, 2187];
function twistVec(st) { const tw = []; for (let s = 0; s < 8; s++) { const home = st.cSlot[s]; const hy = CORNER_SLOTS[home][1]; const d = matApply(R24[st.cRot[s]], { x: 0, y: hy, z: 0 }); tw[s] = twistIdxLocal(s, d); } return tw; }
function twistRankOf(tw) { let r = 0; for (let i = 0; i < 7; i++) r += tw[i] * TW3[i]; return r; }
function twistRankFull(st) {
  let t = 0;
  for (let s = 0; s < 8; s++) t += twistTable[s][CHH[st.cSlot[s]]][st.cRot[s]] * TW3_8[s];
  return t;
}

// --- phase-1 coordinate transition tables (homomorphic) ---
const twDest = FMOVES.map((mv, mi) => { const d = new Uint8Array(8); for (let s = 0; s < 8; s++) { let dst = s; for (const [a, b] of cornerPairs[mi]) if (a === s) dst = b; d[s] = dst; } return d; });
const twDelta = FMOVES.map((mv, mi) => {
  const d = new Int8Array(8);
  for (const [s, dst] of cornerPairs[mi]) d[s] = twistTable[dst][CHH[s]][moveRot[mi][0]];
  return d;
});
const twTransTab = FMOVES.map((mv, mi) => {
  const t = new Uint16Array(2187);
  for (let r = 0; r < 2187; r++) {
    const tw = new Array(8);
    for (let i = 0; i < 7; i++) tw[i] = ((r / TW3[i]) | 0) % 3;
    let sum = 0; for (let i = 0; i < 7; i++) sum += tw[i];
    tw[7] = ((3 - (sum % 3)) % 3);
    const nt = new Array(8).fill(0);
    for (let s = 0; s < 8; s++) nt[twDest[mi][s]] = (tw[s] + twDelta[mi][s]) % 3;
    let nr = 0; for (let i = 0; i < 7; i++) nr += nt[i] * TW3[i];
    t[r] = nr;
  }
  return t;
});
const flDest = FMOVES.map((mv, mi) => { const d = new Uint8Array(12); for (let i = 0; i < 12; i++) d[i] = i; for (const [s, dest] of edgePairs[mi]) d[s] = dest; return d; });
const flDelta = FMOVES.map((mv, mi) => {
  const d = new Uint8Array(12);
  for (const [s, dest] of edgePairs[mi]) d[s] = flipStd(s, dest, moveRot[mi][0]);
  return d;
});
const flTransTab = FMOVES.map((mv, mi) => {
  const t = new Uint16Array(2048);
  for (let r = 0; r < 2048; r++) {
    const f = new Array(12);
    for (let i = 0; i < 11; i++) f[i] = (r >> i) & 1;
    let p = 0; for (let i = 0; i < 11; i++) p += f[i];
    f[11] = p & 1;
    const nf = new Array(12).fill(0);
    for (let s = 0; s < 12; s++) nf[flDest[mi][s]] = f[s] ^ flDelta[mi][s];
    let nr = 0; for (let i = 0; i < 11; i++) nr |= nf[i] << i;
    t[r] = nr;
  }
  return t;
});
const UDS4 = [];
{
  let idx = 0;
  for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) for (let c = b + 1; c < 12; c++) for (let d = c + 1; d < 12; d++) {
    UDS4.push({ bits: [a, b, c, d], mask: (1 << a) | (1 << b) | (1 << c) | (1 << d), rank: idx++ });
  }
}
const udsByMask = new Int16Array(4096).fill(-1);
for (const u of UDS4) udsByMask[u.mask] = u.rank;
const SOLVED_UDS = udsByMask[(1 << 8) | (1 << 9) | (1 << 10) | (1 << 11)];
const udsTransTab = FMOVES.map((mv, mi) => {
  const perm = new Uint8Array(12); for (let i = 0; i < 12; i++) perm[i] = i;
  for (const [s, d] of edgePairs[mi]) perm[s] = d;
  const t = new Uint16Array(495);
  for (const u of UDS4) {
    let mask = 0;
    for (const s of u.bits) mask |= 1 << perm[s];
    t[u.rank] = udsByMask[mask];
  }
  return t;
});

// --- compact logical state ---
function makeState() { return { eSlot: new Int8Array(12), eRot: new Uint8Array(12), cSlot: new Int8Array(8), cRot: new Uint8Array(8) }; }
function setStateFromCube(st, cube) {
  st.eSlot.fill(-1); st.eRot.fill(0); st.cSlot.fill(-1); st.cRot.fill(0);
  for (const c of cube.cubies) {
    const man = Math.abs(c.home.x) + Math.abs(c.home.y) + Math.abs(c.home.z);
    if (man !== 2 && man !== 3) continue;
    const code = R24_INDEX.get(matKey(c.rot));
    const pk = key3([c.pos.x, c.pos.y, c.pos.z]);
    const hk = key3([c.home.x, c.home.y, c.home.z]);
    if (man === 2) {
      const s = edgeSlotIdx.get(pk);
      st.eSlot[s] = edgeSlotIdx.get(hk);
      st.eRot[s] = code;
    } else {
      const s = cornerSlotIdx.get(pk);
      st.cSlot[s] = cornerSlotIdx.get(hk);
      st.cRot[s] = code;
    }
  }
}
function isSolvedState(st) { for (let s = 0; s < 12; s++) if (st.eSlot[s] !== s || st.eRot[s] !== 0) return false; for (let s = 0; s < 8; s++) if (st.cSlot[s] !== s || st.cRot[s] !== 0) return false; return true; }
function doApply(st, mi) {
  const changes = [];
  const ep = edgePairs[mi], cp = cornerPairs[mi], mr = moveRot[mi];
  const eS = Int8Array.from(st.eSlot), eR = Uint8Array.from(st.eRot);
  for (const [s, d] of ep) { changes.push(['e', d, st.eSlot[d], st.eRot[d]]); st.eSlot[d] = eS[s]; st.eRot[d] = mr[eR[s]]; }
  const cS = Int8Array.from(st.cSlot), cR = Uint8Array.from(st.cRot);
  for (const [s, d] of cp) { changes.push(['c', d, st.cSlot[d], st.cRot[d]]); st.cSlot[d] = cS[s]; st.cRot[d] = mr[cR[s]]; }
  return changes;
}
function undo(st, changes) {
  for (let i = changes.length - 1; i >= 0; i--) { const [t, d, os, or] = changes[i]; if (t === 'e') { st.eSlot[d] = os; st.eRot[d] = or; } else { st.cSlot[d] = os; st.cRot[d] = or; } }
}
const MAXP = 48;
const stkES = new Int8Array(MAXP * 6), stkER = new Int8Array(MAXP * 6), stkCS = new Int8Array(MAXP * 4), stkCR = new Int8Array(MAXP * 4);
const _tE = new Int8Array(12), _tR = new Int8Array(12), _tCS = new Int8Array(8), _tCR = new Int8Array(8);
function fastApply(st, mi, level) {
  const ep = edgePairs[mi], cp = cornerPairs[mi], mr = moveRot[mi];
  const oe = level * 6, oc = level * 4;
  for (let i = 0; i < ep.length; i++) { const d = ep[i][1]; stkES[oe + i] = st.eSlot[d]; stkER[oe + i] = st.eRot[d]; }
  for (let i = 0; i < cp.length; i++) { const d = cp[i][1]; stkCS[oc + i] = st.cSlot[d]; stkCR[oc + i] = st.cRot[d]; }
  _tE.set(st.eSlot); _tR.set(st.eRot);
  for (let i = 0; i < ep.length; i++) { const s = ep[i][0], d = ep[i][1]; _tE[d] = st.eSlot[s]; _tR[d] = mr[st.eRot[s]]; }
  st.eSlot.set(_tE); st.eRot.set(_tR);
  _tCS.set(st.cSlot); _tCR.set(st.cRot);
  for (let i = 0; i < cp.length; i++) { const s = cp[i][0], d = cp[i][1]; _tCS[d] = st.cSlot[s]; _tCR[d] = mr[st.cRot[s]]; }
  st.cSlot.set(_tCS); st.cRot.set(_tCR);
}
function fastUndo(st, mi, level) {
  const ep = edgePairs[mi], cp = cornerPairs[mi];
  const oe = level * 6, oc = level * 4;
  for (let i = 0; i < ep.length; i++) { const d = ep[i][1]; st.eSlot[d] = stkES[oe + i]; st.eRot[d] = stkER[oe + i]; }
  for (let i = 0; i < cp.length; i++) { const d = cp[i][1]; st.cSlot[d] = stkCS[oc + i]; st.cRot[d] = stkCR[oc + i]; }
}
function flipCodeOf(st) {
  let c = 0;
  for (let s = 0; s < 11; s++) { const e = st.eSlot[s]; if (flipStd(e, s, st.eRot[s])) c |= 1 << s; }
  return c;
}
function udsCodeOf(st) {
  const slotOf = new Int8Array(12).fill(-1);
  for (let s = 0; s < 12; s++) slotOf[st.eSlot[s]] = s;
  let mask = 0;
  for (const e of [8, 9, 10, 11]) mask |= 1 << slotOf[e];
  return udsByMask[mask];
}
function rootCoords(st) {
  return { tw: twistRankOf(twistVec(st)), fl: flipCodeOf(st), ud: udsCodeOf(st) };
}
function flipMaskFull(st) {
  let m = 0;
  for (let s = 0; s < 12; s++) if (flipOf(st.eSlot[s], s, st.eRot[s])) m |= 1 << s;
  return m;
}

// --- phase-2 rank machinery ---
const P8F = [5040, 720, 120, 24, 6, 2, 1, 1];
const _e8used = new Uint8Array(8);
function e8Key(eSlot) {
  let rank = 0;
  _e8used.fill(0);
  for (let i = 0; i < 8; i++) {
    const v = eSlot[i];
    let c = 0;
    for (let j = 0; j < v; j++) if (!_e8used[j]) c++;
    rank += c * P8F[i];
    _e8used[v] = 1;
  }
  return rank;
}
function s4Key(eSlot) {
  const a0 = eSlot[8] - 8, a1 = eSlot[9] - 8, a2 = eSlot[10] - 8, a3 = eSlot[11] - 8;
  let rank = 0;
  rank += 6 * (((a1 < a0) ? 1 : 0) + ((a2 < a0) ? 1 : 0) + ((a3 < a0) ? 1 : 0));
  rank += 2 * (((a2 < a1) ? 1 : 0) + ((a3 < a1) ? 1 : 0));
  rank += (a3 < a2) ? 1 : 0;
  return rank;
}
const s4Perms = [];
{ const a = [0, 1, 2, 3]; const used = new Array(4).fill(false);
  (function rec(d) { if (d === 4) { s4Perms.push(a.slice()); return; } for (let i = 0; i < 4; i++) { if (used[i]) continue; used[i] = true; a[d] = i; rec(d + 1); used[i] = false; } })(0); }
const SYMS16 = [
  [1,0,0, 0,1,0, 0,0,1],[0,0,1, 0,1,0,-1,0,0],[-1,0,0, 0,1,0, 0,0,-1],[0,0,-1, 0,1,0, 1,0,0],
  [1,0,0, 0,-1,0, 0,0,-1],[-1,0,0, 0,-1,0, 0,0,1],[0,0,1, 0,-1,0, 1,0,0],[0,0,-1, 0,-1,0,-1,0,0],
  [1,0,0, 0,-1,0, 0,0,1],[0,0,1, 0,-1,0,-1,0,0],[-1,0,0, 0,-1,0, 0,0,-1],[0,0,-1, 0,-1,0, 1,0,0],
  [1,0,0, 0,1,0, 0,0,-1],[-1,0,0, 0,1,0, 0,0,1],[0,0,1, 0,1,0, 1,0,0],[0,0,-1, 0,1,0,-1,0,0],
];
const symCornerImg16 = SYMS16.map(M => CORNER_SLOTS.map(q => cornerSlotIdx.get(key3([M[0]*q[0]+M[3]*q[1]+M[6]*q[2], M[1]*q[0]+M[4]*q[1]+M[7]*q[2], M[2]*q[0]+M[5]*q[1]+M[8]*q[2]]))));
const symEdgeImg16 = SYMS16.map(M => EDGE_SLOTS.map(q => edgeSlotIdx.get(key3([M[0]*q[0]+M[3]*q[1]+M[6]*q[2], M[1]*q[0]+M[4]*q[1]+M[7]*q[2], M[2]*q[0]+M[5]*q[1]+M[8]*q[2]]))));

let e8Perms = null, permRankByKey = null;
let e8MoveTab = null, s4MoveTab = null, crMoveTab = null;
let crConjArr = null, e8ConjArr = null, clsArr = null;
let PDBS = null;

// ================= buildPDBs =================
// pre (optional): { JCE, JQSY, CS, ES, p1: { co_eo, co_ud, eo_ud } } — Uint8Arrays.
// Without pre everything except JCE (111.6M entries) is built at runtime; phase 2
// still works (slower) with CS/ES/E8/S4 pruning only.
function buildPDBs(progressCb, pre) {
  const t0 = Date.now();
  const step = (label, pct) => { if (progressCb) { try { progressCb({ label, pct }); } catch {} } };

  // ---- G1 closure assertions for the phase-1 goal coordinates (soundness of rank-only phase 2). ----
  {
    for (const mi of G1_IDX) {
      if (twTransTab[mi][0] !== 0) throw new Error('phase-1 goal not closed under G1 (twist)');
      if (flTransTab[mi][0] !== 0) throw new Error('phase-1 goal not closed under G1 (std flip)');
      if (udsTransTab[mi][SOLVED_UDS] !== SOLVED_UDS) throw new Error('phase-1 goal not closed under G1 (ud slice)');
    }
    // stronger per-placement std-flip invariance under G1 moves:
    let bad = 0;
    for (const mi of G1_IDX) {
      const dst = new Int8Array(12).fill(-1);
      for (const [s, d] of edgePairs[mi]) dst[s] = d;
      const mr = moveRot[mi];
      for (let e = 0; e < 12; e++) for (let s = 0; s < 12; s++) {
        const d2 = dst[s]; if (d2 < 0) continue;
        for (let o = 0; o < 24; o++) if (flipStd(e, d2, mr[o]) !== flipStd(e, s, o)) bad++;
      }
    }
    if (bad) throw new Error('std flip gauge not invariant under G1 move set');
  }

  step('Phase-1 PDBs', 0);
  const bfs18 = (transTab, size) => {
    const dist = new Uint8Array(size).fill(255);
    dist[0] = 0;
    const q = new Int32Array(size); let qt = 0; q[qt++] = 0;
    for (let qi = 0; qi < qt; qi++) {
      const c = q[qi], d = dist[c];
      for (let mi = 0; mi < 18; mi++) { const n = transTab[mi][c]; if (dist[n] === 255) { dist[n] = d + 1; q[qt++] = n; } }
    }
    return { dist, reached: qt };
  };
  const bfsPair = (tabA, sizeA, tabB, sizeB, start = 0) => {
    const N = sizeA * sizeB;
    const dist = new Uint8Array(N).fill(255);
    dist[start] = 0;
    const q = new Int32Array(N); let qt = 0; q[qt++] = start;
    for (let qi = 0; qi < qt; qi++) {
      const c = q[qi]; const a = (c / sizeB) | 0, b = c - a * sizeB; const d = dist[c];
      for (let mi = 0; mi < 18; mi++) {
        const n = tabA[mi][a] * sizeB + tabB[mi][b];
        if (dist[n] === 255) { dist[n] = d + 1; q[qt++] = n; }
      }
    }
    return { dist, N };
  };
  const P1single = { tw: bfs18(twTransTab, 2187), fl: bfs18(flTransTab, 2048), ud: bfs18(udsTransTab, 495) };
  const mkPre = (arr, N, name) => {
    if (!arr) throw new Error(`pre-supplied ${name} missing`);
    if (arr.length !== N) throw new Error(`${name} size mismatch (got ${arr.length}, expected ${N})`);
    return { dist: arr, N };
  };
  const P1 = {
    co_eo: pre && pre.p1 && pre.p1.co_eo ? mkPre(pre.p1.co_eo, 2187 * 2048, 'p1_co_eo') : bfsPair(twTransTab, 2187, flTransTab, 2048, 0),
    co_ud: pre && pre.p1 && pre.p1.co_ud ? mkPre(pre.p1.co_ud, 2187 * 495, 'p1_co_ud') : bfsPair(twTransTab, 2187, udsTransTab, 495, SOLVED_UDS),
    eo_ud: pre && pre.p1 && pre.p1.eo_ud ? mkPre(pre.p1.eo_ud, 2048 * 495, 'p1_eo_ud') : bfsPair(flTransTab, 2048, udsTransTab, 495, SOLVED_UDS),
  };

  step('Rank tables', 25);
  if (!e8Perms) {
    e8Perms = [];
    { const a = [0, 1, 2, 3, 4, 5, 6, 7]; const used = new Array(8).fill(false);
      (function rec(d) { if (d === 8) { e8Perms.push(a.slice()); return; } for (let i = 0; i < 8; i++) { if (used[i]) continue; used[i] = true; a[d] = i; rec(d + 1); used[i] = false; } })(0); }
    permRankByKey = new Map();
    e8Perms.forEach((pm, i) => { let k = 0; for (let i2 = 0; i2 < 8; i2++) k = k * 8 + pm[i2]; permRankByKey.set(k, i); });
    const g1Edge8 = G1_IDX.map(mi => edgePairs[mi].filter(([s]) => s < 8));
    const g1Edge4 = G1_IDX.map(mi => edgePairs[mi].filter(([s]) => s >= 8).map(([s, d]) => [s - 8, d - 8]));
    e8MoveTab = G1_IDX.map((mi, gi) => {
      const t = new Uint16Array(40320);
      for (let r = 0; r < 40320; r++) {
        const cur = e8Perms[r];
        const q = cur.slice();
        for (const [s, d] of g1Edge8[gi]) q[d] = cur[s];
        t[r] = e8Key(q);
      }
      return t;
    });
    s4MoveTab = G1_IDX.map((mi, gi) => {
      const t = new Uint16Array(24);
      for (let r = 0; r < 24; r++) {
        const perm = s4Perms[r];
        const q = perm.slice();
        for (const [s, d] of g1Edge4[gi]) q[d] = perm[s];
        t[r] = (() => { let rank = 0; const F = [6, 2, 1, 1]; for (let i = 0; i < 4; i++) { let c = 0; for (let j = i + 1; j < 4; j++) if (q[j] < q[i]) c++; rank += c * F[i]; } return rank; })();
      }
      return t;
    });
    crMoveTab = G1_IDX.map((mi, gi) => {
      const cp = cornerPairs[mi];
      const t = new Uint16Array(40320);
      for (let r = 0; r < 40320; r++) {
        const cur = e8Perms[r];
        const q = cur.slice();
        for (const [s, d] of cp) q[d] = cur[s];
        t[r] = e8Key(q);
      }
      return t;
    });
    crConjArr = SYMS16.map((_, s) => {
      const img = symCornerImg16[s];
      const t = new Uint16Array(40320);
      for (let r = 0; r < 40320; r++) { const cur = e8Perms[r]; const q = new Array(8); for (let i = 0; i < 8; i++) q[img[i]] = img[cur[i]]; t[r] = e8Key(q); }
      return t;
    });
    e8ConjArr = SYMS16.map((_, s) => {
      const img = symEdgeImg16[s].slice(0, 8);
      const t = new Uint16Array(40320);
      for (let r = 0; r < 40320; r++) { const cur = e8Perms[r]; const q = new Array(8); for (let i = 0; i < 8; i++) q[img[i]] = img[cur[i]]; t[r] = e8Key(q); }
      return t;
    });
    clsArr = new Int32Array(40320).fill(-1);
    let nCls = 0;
    {
      const Q = new Int32Array(40320);
      for (let start = 0; start < 40320; start++) {
        if (clsArr[start] >= 0) continue;
        let qh = 0, qt = 0; Q[qt++] = start;
        while (qh < qt) { const c = Q[qh++]; clsArr[c] = nCls; for (let s = 0; s < 16; s++) { const c2 = crConjArr[s][c]; if (clsArr[c2] < 0) Q[qt++] = c2; } }
        nCls++;
      }
    }
    if (nCls !== 2768) throw new Error(`corner class count ${nCls} != 2768`);
  }

  step('G1 edge PDBs', 45);
  const E8dist = new Uint8Array(40320).fill(255);
  {
    const q = new Int32Array(40320); let qt = 0; q[qt++] = 0; E8dist[0] = 0;
    for (let qi = 0; qi < qt; qi++) { const c = q[qi], d = E8dist[c]; for (let gi = 0; gi < 10; gi++) { const n = e8MoveTab[gi][c]; if (E8dist[n] === 255) { E8dist[n] = d + 1; q[qt++] = n; } } }
  }
  const S4dist = new Uint8Array(24).fill(255);
  {
    const q = new Int32Array(24); let qt = 0; q[qt++] = 0; S4dist[0] = 0;
    for (let qi = 0; qi < qt; qi++) { const c = q[qi], d = S4dist[c]; for (let gi = 0; gi < 10; gi++) { const n = s4MoveTab[gi][c]; if (S4dist[n] === 255) { S4dist[n] = d + 1; q[qt++] = n; } } }
  }
  const CS = pre && pre.CS ? pre.CS : (() => {
    const N = 40320 * 24;
    const dist = new Uint8Array(N).fill(255);
    dist[0] = 0;
    const q = new Int32Array(N); let qt = 0; q[qt++] = 0;
    for (let qi = 0; qi < qt; qi++) {
      const k = q[qi], d = dist[k];
      const cr = (k / 24) | 0, s4 = k % 24;
      for (let gi = 0; gi < 10; gi++) {
        const nk = crMoveTab[gi][cr] * 24 + s4MoveTab[gi][s4];
        if (dist[nk] === 255) { dist[nk] = d + 1; q[qt++] = nk; }
      }
    }
    return dist;
  })();
  const ES = pre && pre.ES ? pre.ES : (() => {
    const N = 40320 * 24;
    const dist = new Uint8Array(N).fill(255);
    dist[0] = 0;
    const q = new Int32Array(N); let qt = 0; q[qt++] = 0;
    for (let qi = 0; qi < qt; qi++) {
      const k = q[qi], d = dist[k];
      const e8 = (k / 24) | 0, s4 = k % 24;
      for (let gi = 0; gi < 10; gi++) {
        const nk = e8MoveTab[gi][e8] * 24 + s4MoveTab[gi][s4];
        if (dist[nk] === 255) { dist[nk] = d + 1; q[qt++] = nk; }
      }
    }
    return dist;
  })();
  if (CS.length !== 40320 * 24 || ES.length !== 40320 * 24) throw new Error('CS/ES size mismatch');

  // JCE: exact Kociemba virtual-space PDB — only usable pre-generated.
  const JCE = pre && pre.JCE ? pre.JCE : null;
  const JQSY = pre && pre.JQSY ? pre.JQSY : null;
  if ((JCE === null) !== (JQSY === null)) throw new Error('JCE and JQSY must both be present');
  if (JCE && (JCE.length !== 2768 * 40320 || JQSY.length !== 40320)) throw new Error('JCE/JQSY size mismatch');

  const h1 = (tw, fl, ud) => {
    let v = 0;
    const a = P1.co_eo.dist[tw * 2048 + fl]; if (a > v) v = a;
    const b = P1.co_ud.dist[tw * 495 + ud]; if (b > v) v = b;
    const c = P1.eo_ud.dist[fl * 495 + ud]; if (c > v) v = c;
    return v;
  };
  const h2FromRanks = (cr, e8, s4) => {
    let v = 0;
    if (JCE) {
      const q = JQSY[cr];
      const jv = JCE[clsArr[cr] * 40320 + e8ConjArr[q][e8]];
      if (jv < 255 && jv > v) v = jv;
    }
    const csv = CS[cr * 24 + s4]; if (csv < 255 && csv > v) v = csv;
    const esv = ES[e8 * 24 + s4]; if (esv < 255 && esv > v) v = esv;
    const e8v = E8dist[e8]; if (e8v < 255 && e8v > v) v = e8v;
    const s4v = S4dist[s4]; if (s4v < 255 && s4v > v) v = s4v;
    return v;
  };

  PDBS = { P1, P1single, E8dist, S4dist, CS, ES, JCE, JQSY, h1, h2FromRanks, buildMs: Date.now() - t0 };
  step('Done', 100);
  return PDBS;
}

function cornerKey(st) {
  if (!permRankByKey) return -1;
  let k = 0;
  for (let i = 0; i < 8; i++) k = k * 8 + st.cSlot[i];
  const pr = permRankByKey.get(k);
  return pr === undefined ? -1 : pr * 2187 + twistRankOf(twistVec(st));
}
function getPDBS() { return PDBS; }
function h2(st) { return PDBS.h2FromRanks(e8Key(st.cSlot), e8Key(st.eSlot), s4Key(st.eSlot)); }
function heuristic(st) {
  const r = rootCoords(st);
  return Math.max(PDBS.h1(r.tw, r.fl, r.ud), h2(st));
}

// ================= phase 1: multi-candidate IDA* in coordinate space =================
function solvePhase1Multi(root, extraBounds, timeCapMs, cancelRef) {
  const coEo = PDBS.P1.co_eo.dist, coUd = PDBS.P1.co_ud.dist, eoUd = PDBS.P1.eo_ud.dist;
  const t0 = Date.now();
  let bound = PDBS.h1(root.tw, root.fl, root.ud);
  let totalNodes = 0, iter = 0;
  const path = [];
  const solutions = [];
  let cancelled = false, timedOut = false;
  while (iter <= extraBounds && !cancelled && !timedOut) {
    iter++;
    let nodes = 0;
    const dfs = (tw, fl, ud, depth, g) => {
      nodes++;
      if (cancelled || timedOut) return bound + 1;
      if ((nodes & 0xFFFFF) === 0) {
        if (cancelRef && cancelRef[0] !== 0) { cancelled = true; return bound + 1; }
        if (Date.now() - t0 > timeCapMs) { timedOut = true; return bound + 1; }
      }
      let h = 0;
      const a = coEo[tw * 2048 + fl]; if (a > h) h = a;
      const b = coUd[tw * 495 + ud]; if (b > h) h = b;
      const c = eoUd[fl * 495 + ud]; if (c > h) h = c;
      if (g + h > bound) return g + h;
      if (tw === 0 && fl === 0 && ud === SOLVED_UDS) return null;
      if (depth >= 24) return bound + 1;
      let min = Infinity;
      const prevFace = path.length ? FMOVES[path[path.length - 1]].face : null;
      for (let mi = 0; mi < 18; mi++) {
        if (prevFace !== null && FMOVES[mi].face === prevFace) continue;
        path.push(mi);
        const res = dfs(twTransTab[mi][tw], flTransTab[mi][fl], udsTransTab[mi][ud], depth + 1, g + 1);
        if (res === null) return null;
        path.pop();
        if (res < min) min = res;
      }
      return min;
    };
    path.length = 0;
    const res = dfs(root.tw, root.fl, root.ud, 0, 0);
    totalNodes += nodes;
    if (cancelled) break;
    if (timedOut) break;
    if (res === null) {
      solutions.push(path.slice());
      bound++;
    } else if (res > 24) {
      break;
    } else {
      bound = res;
    }
  }
  return { solutions, totalNodes, cancelled, timedOut };
}

// ================= phase 2: IDA* in G1 rank space =================
function solvePhase2(st, timeCapMs, cancelRef) {
  // Returns { moves, nodes, d2 } (optimal d2 for this entry) or { error }.
  const t0 = Date.now();
  const h2f = PDBS.h2FromRanks;
  const fullState = !PDBS.JCE; // without exact JCE, verify orientations live (defensive)
  const cr0 = e8Key(st.cSlot), e80 = e8Key(st.eSlot), s40 = s4Key(st.eSlot);
  let bound = h2f(cr0, e80, s40);
  let totalNodes = 0, cancelled = false, timedOut = false;
  const path = new Int32Array(MAXP);
  const pK1 = new Float64Array(MAXP), pK2 = new Float64Array(MAXP);
  let iter = 0;
  while (iter++ < 30) {
    let plen = 0;
    const dfs = (depth, g, cr, e8, s4) => {
      totalNodes++;
      if (cancelled || timedOut) return bound + 1;
      if ((totalNodes & 0xFFFFF) === 0) {
        if (cancelRef && cancelRef[0] !== 0) { cancelled = true; return bound + 1; }
        if (Date.now() - t0 > timeCapMs) { timedOut = true; return bound + 1; }
      }
      const hh = h2f(cr, e8, s4);
      if (g + hh > bound) return g + hh;
      if (cr === 0 && e8 === 0 && s4 === 0) {
        if (!fullState) return null;
        if (twistRankFull(st) === 0 && flipMaskFull(st) === 0) return null;
      }
      if (depth >= 24) return bound + 1;
      const k1 = fullState ? cr * 6561 + twistRankFull(st) : cr * 40320 + e8;
      const k2 = fullState ? e8 * 98304 + s4 * 4096 + flipMaskFull(st) : s4;
      for (let i = 0; i < plen; i++) { if (pK1[i] === k1 && pK2[i] === k2) return bound + 1; }
      let min = Infinity;
      const prevFace = plen ? FMOVES[path[plen - 1]].face : null;
      pK1[plen] = k1; pK2[plen] = k2; plen++;
      for (let gi = 0; gi < 10; gi++) {
        const mi = G1_IDX[gi];
        if (prevFace !== null && FMOVES[mi].face === prevFace) continue;
        path[plen - 1] = mi;
        if (fullState) fastApply(st, mi, plen - 1);
        const res = dfs(depth + 1, g + 1, crMoveTab[gi][cr], e8MoveTab[gi][e8], s4MoveTab[gi][s4]);
        if (fullState) fastUndo(st, mi, plen - 1);
        if (res === null) return null;
        if (res < min) min = res;
      }
      plen--;
      return min;
    };
    const res = dfs(0, 0, cr0, e80, s40);
    if (cancelled) return { error: 'cancelled', nodes: totalNodes };
    if (timedOut) return { error: 'phase2 time cap', nodes: totalNodes };
    if (res === null) return { moves: Array.from(path.subarray(0, plen)), nodes: totalNodes, d2: bound };
    bound = res;
  }
  return { error: 'phase2 iter cap', nodes: totalNodes };
}

// ================= solveCube =================
function centerOrientation(cube) {
  // Whole-cube rotation O satisfies pos = O . home for every center cubie.
  // (Center ROT must NOT be used: face turns rotate face centers locally.)
  let c0 = null, c1 = null, c2 = null;
  for (const c of cube.cubies) {
    const man = Math.abs(c.home.x) + Math.abs(c.home.y) + Math.abs(c.home.z);
    if (man !== 1) continue;
    if (c.home.x === 1) c0 = c;
    else if (c.home.y === 1) c1 = c;
    else if (c.home.z === 1) c2 = c;
  }
  if (!c0 || !c1 || !c2) return ID3.slice();
  const O = [c0.pos.x, c1.pos.x, c2.pos.x, c0.pos.y, c1.pos.y, c2.pos.y, c0.pos.z, c1.pos.z, c2.pos.z];
  // must be a rotation matrix in R24; otherwise treat as identity (shouldn't happen)
  return R24_INDEX.has(matKey(O)) ? O : ID3.slice();
}
function rotationToWholeMoves(target) {
  const want = matKey(target);
  for (let i = 0; i < WHOLE_MOVES.length; i++) {
    const M1 = moveMatrix(WHOLE_MOVES[i]);
    if (matKey(M1) === want) return [i];
    for (let j = 0; j < WHOLE_MOVES.length; j++) {
      if (matKey(matMul(moveMatrix(WHOLE_MOVES[j]), M1)) === want) return [i, j];
    }
  }
  return null;
}

function solveCube(cube, opts = {}) {
  if (!PDBS) buildPDBs();
  const t0 = Date.now();
  const maxTimeMs = opts.maxTimeMs || 0;
  const cancelRef = opts.cancelRef || null;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  const checkCap = () => {
    if (cancelRef && cancelRef[0] !== 0) return 'cancelled';
    if (maxTimeMs && Date.now() - t0 > maxTimeMs) return 'time budget exceeded';
    return null;
  };

  // Whole-cube orientation: face moves cannot move centers; normalize first.
  const O = centerOrientation(cube);
  const wholePrefix = [];
  let work = cube;
  if (matKey(O) !== matKey(ID3)) {
    const target = [O[0], O[3], O[6], O[1], O[4], O[7], O[2], O[5], O[8]]; // O^-1 = O^T
    const W = rotationToWholeMoves(target);
    if (W) {
      work = cube.clone();
      for (const wi of W) work.applyMove(WHOLE_MOVES[wi]);
      for (const wi of W) wholePrefix.push(ALL_MOVES.length + wi);
    }
  }
  if (work.isSolved()) return { moves: wholePrefix, time: Date.now() - t0, nodes: 0, optimal: false };

  const st = makeState(); setStateFromCube(st, work);

  const root = rootCoords(st);
  const p1cap = maxTimeMs ? Math.min(1500, maxTimeMs) : 1500;
  if (opts.DEBUG) console.log('[dbg] root=', JSON.stringify(root), JSON.stringify(PDBS.h1(root.tw, root.fl, root.ud)));
  const p1 = solvePhase1Multi(root, 12, p1cap, cancelRef);
  // Declared after p1 on purpose: it closes over p1, so defining it above the
  // const would be a TDZ trap that only works by luck of the call order.
  let phase2Nodes = 0;
  const progress = (extra) => {
    if (onProgress) onProgress({ nodes: p1.totalNodes + phase2Nodes, time: Date.now() - t0, ...extra });
  };
  if (!p1.solutions.length) {
    // Phase 1 hitting its time cap is not the same as "this cube has no
    // candidates": the UI must be able to tell "took too long" from "unsolvable".
    const why = p1.cancelled ? 'cancelled'
      : p1.timedOut ? 'search too slow (phase 1 ran out of time)'
      : 'no phase1 candidates';
    return { error: why, nodes: p1.totalNodes, time: Date.now() - t0 };
  }
  progress({ phase: 'phase1', candidates: p1.solutions.length });
  if (!p1.solutions.length) return { error: p1.cancelled ? 'cancelled' : 'no phase1 candidates', nodes: p1.totalNodes, time: Date.now() - t0 };

  const cands = [];
  for (const pm of p1.solutions) {
    const stc = makeState(); setStateFromCube(stc, work);
    for (const mi of pm) doApply(stc, mi);
    cands.push({ L: pm.length, v: h2(stc), p1: pm, st: stc });
  }
  cands.sort((a, b) => (a.L + a.v) - (b.L + b.v) || a.L - b.L);


  if (typeof opts.DEBUG === 'boolean' && opts.DEBUG) {
    for (const c of cands) console.log('[dbg] cand L=' + c.L + ' v=' + c.v);
  }
  let best = null;
  let candIdx = 0;
  for (const c of cands) {
    candIdx++;
    if (best && c.L >= best.total) break;
    if (best && c.L + c.v >= best.total) continue;
    const err = checkCap();
    if (err) return { error: err, nodes: p1.totalNodes, time: Date.now() - t0 };
    progress({ phase: 'phase2', cand: candIdx, bound: c.L + c.v });
    const remain = maxTimeMs ? maxTimeMs - (Date.now() - t0) : 15000;
    if (remain < 50) break;
    const p2 = solvePhase2(c.st, Math.min(remain, 15000), cancelRef);
    phase2Nodes += p2.nodes || 0; // keeps the UI node counter moving during phase 2
    if (opts.DEBUG) console.log('[dbg] p2 ->', ('error' in p2 ? p2.error + ' nodes=' + p2.nodes : 'd2=' + p2.d2 + ' nodes=' + p2.nodes));
    if ('error' in p2) {
      if (p2.error === 'cancelled') return { error: 'cancelled', nodes: p1.totalNodes + p2.nodes, time: Date.now() - t0 };
      continue;
    }
    // Authoritative verification on the real state:
    const stR = makeState(); setStateFromCube(stR, work);
    for (const mi of c.p1) doApply(stR, mi);
    for (const mi of p2.moves) fastApply(stR, mi, 0);
    if (!isSolvedState(stR)) continue; // defensive; should be impossible
    const total = c.L + p2.moves.length;
    if (!best || total < best.total) best = { total, moves: c.p1.concat(p2.moves) };
  }
  if (best) {
    progress({ phase: 'done', moves: best.total });
    return { moves: wholePrefix.concat(best.moves), time: Date.now() - t0, nodes: p1.totalNodes, optimal: false };
  }
  return { error: 'no solution found', nodes: p1.totalNodes, time: Date.now() - t0 };
}

export {
  buildPDBs, solveCube,
  ALL_MOVES, ALL_MOVES_FULL, FMOVES, WHOLE_MOVES,
  isSolvedState, setStateFromCube, makeState, doApply, undo,
  heuristic, h2, cornerKey, rootCoords, flipCodeOf, udsCodeOf, e8Key, s4Key, flipStd, twistVec, twistRankOf,
  twTransTab, flTransTab, udsTransTab, SOLVED_UDS, twDest, twDelta, flDelta, cornerPairs, edgePairs, moveRot,
  solvePhase1Multi, solvePhase2, getPDBS,
  tablesVersion, fnvBytes,
  fastApply, fastUndo, crMoveTab, e8MoveTab, s4MoveTab, G1_IDX, centerOrientation, rotationToWholeMoves,
};
