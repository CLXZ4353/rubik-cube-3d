// Build phase-2 pruning tables (Kociemba virtual-space BFS, exact per his construction):
//  jointCE: virtual state = (corner class 2768 x edge value 40320), BFS with representative-corner moves.
//    For real state (C,E): dist = T[class(C)*40320 + e8Conj[sym(C)][E]]
//  cornslice: (corner 40320 x slice 24) full BFS.
import { writeFileSync, mkdirSync } from 'node:fs';
import { updateManifest } from './pdb_manifest.mjs';
import { matApply, moveMatrix, AXES } from '../src/moves.js';
import { FMOVES, cornerPairs } from '../src/Solver.js';

const t0 = Date.now();
const G1_IDX = [0, 1, 2, 3, 4, 5, 8, 11, 14, 17];
const EDGE_SLOTS = [[0,1,1],[0,1,-1],[-1,1,0],[1,1,0],[0,-1,1],[0,-1,-1],[-1,-1,0],[1,-1,0],[1,0,1],[1,0,-1],[-1,0,-1],[-1,0,1]];
const CORNER_SLOTS = [[1,1,1],[1,1,-1],[-1,1,-1],[-1,1,1],[1,-1,1],[1,-1,-1],[-1,-1,-1],[-1,-1,1]];
const key3 = p => ((p[0] + 1) * 7 + (p[1] + 1)) * 7 + (p[2] + 1);
const vec = a => ({ x: a[0], y: a[1], z: a[2] });
const edgeSlotIdx = new Map(EDGE_SLOTS.map((q, i) => [key3(q), i]));
const cornerSlotIdx = new Map(CORNER_SLOTS.map((q, i) => [key3(q), i]));
const NCR = 40320;

const SYMS = [
  [1,0,0, 0,1,0, 0,0,1],[0,0,1, 0,1,0,-1,0,0],[-1,0,0, 0,1,0, 0,0,-1],[0,0,-1, 0,1,0, 1,0,0],
  [1,0,0, 0,-1,0, 0,0,-1],[-1,0,0, 0,-1,0, 0,0,1],[0,0,1, 0,-1,0, 1,0,0],[0,0,-1, 0,-1,0,-1,0,0],
  [1,0,0, 0,-1,0, 0,0,1],[0,0,1, 0,-1,0,-1,0,0],[-1,0,0, 0,-1,0, 0,0,-1],[0,0,-1, 0,-1,0, 1,0,0],
  [1,0,0, 0,1,0, 0,0,-1],[-1,0,0, 0,1,0, 0,0,1],[0,0,1, 0,1,0, 1,0,0],[0,0,-1, 0,1,0,-1,0,0],
];
const symCornerImg = SYMS.map(M => CORNER_SLOTS.map(q => cornerSlotIdx.get(key3([M[0]*q[0]+M[3]*q[1]+M[6]*q[2], M[1]*q[0]+M[4]*q[1]+M[7]*q[2], M[2]*q[0]+M[5]*q[1]+M[8]*q[2]]))));
const symEdgeImg = SYMS.map(M => EDGE_SLOTS.map(q => edgeSlotIdx.get(key3([M[0]*q[0]+M[3]*q[1]+M[6]*q[2], M[1]*q[0]+M[4]*q[1]+M[7]*q[2], M[2]*q[0]+M[5]*q[1]+M[8]*q[2]]))));
for (let s = 0; s < 16; s++) {
  const ci = symCornerImg[s], ei = symEdgeImg[s];
  if (new Set(ci).size !== 8 || new Set(ei).size !== 12) throw new Error('bad sym image ' + s);
  for (let i = 0; i < 8; i++) if (ei[i] > 7) throw new Error('sym ' + s + ' maps E8 to slice');
}

// corner permutations
const perms = [];
{ const p = [0,1,2,3,4,5,6,7]; const used = new Array(8).fill(false);
  (function rec(d) { if (d === 8) { perms.push(p.slice()); return; } for (let i = 0; i < 8; i++) { if (used[i]) continue; used[i] = true; p[d] = i; rec(d + 1); used[i] = false; } })(0); }
const cKeyOf = a => { let k = 0; for (let i = 0; i < 8; i++) k = k * 8 + a[i]; return k; };
const rankByPermKey = new Map(); perms.forEach((p, i) => rankByPermKey.set(cKeyOf(p), i));
const crMove = G1_IDX.map(mi => {
  const cp = cornerPairs[mi]; const t = new Int32Array(NCR);
  for (let r = 0; r < NCR; r++) { const cur = perms[r]; const next = cur.slice(); for (const [s, d] of cp) next[d] = cur[s]; t[r] = rankByPermKey.get(cKeyOf(next)); }
  return t;
});
const crConj = SYMS.map((_, s) => {
  const img = symCornerImg[s]; const t = new Int32Array(NCR);
  for (let r = 0; r < NCR; r++) { const cur = perms[r]; const q = new Array(8); for (let i = 0; i < 8; i++) q[img[i]] = img[cur[i]]; t[r] = rankByPermKey.get(cKeyOf(q)); }
  return t;
});
// E8
const P8F = [5040, 720, 120, 24, 6, 2, 1, 1];
function e8Rank(a) { let rank = 0; const used = new Uint8Array(8); for (let i = 0; i < 8; i++) { let c = 0; for (let j = 0; j < a[i]; j++) if (!used[j]) c++; rank += c * P8F[i]; used[a[i]] = 1; } return rank; }
const e8Perms = [];
{ const a = [0,1,2,3,4,5,6,7]; const used = new Array(8).fill(false);
  (function rec(d) { if (d === 8) { e8Perms.push(a.slice()); return; } for (let i = 0; i < 8; i++) { if (used[i]) continue; used[i] = true; a[d] = i; rec(d + 1); used[i] = false; } })(0); }
const g1Edge8 = G1_IDX.map(mi => {
  const mv = FMOVES[mi]; const M = moveMatrix(mv); const ep = [];
  for (let s = 0; s < 12; s++) { const p = vec(EDGE_SLOTS[s]); if (p[AXES[mv.axis]] !== mv.layer) continue; const np = matApply(M, p); const d = edgeSlotIdx.get(key3([np.x, np.y, np.z])); if (d !== s && s < 8) ep.push([s, d]); }
  return ep;
});
const e8Move = G1_IDX.map((mi, gi) => {
  const t = new Int32Array(NCR);
  for (let r = 0; r < NCR; r++) { const cur = e8Perms[r]; const q = cur.slice(); for (const [s, d] of g1Edge8[gi]) q[d] = cur[s]; t[r] = e8Rank(q); }
  return t;
});
const e8Conj = SYMS.map((_, s) => {
  const img = symEdgeImg[s].slice(0, 8); const t = new Int32Array(NCR);
  for (let r = 0; r < NCR; r++) { const cur = e8Perms[r]; const q = new Array(8); for (let i = 0; i < 8; i++) q[img[i]] = img[cur[i]]; t[r] = e8Rank(q); }
  return t;
});
// corner classes
const cls = new Int32Array(NCR).fill(-1);
const classRep = [];
{
  const Q = new Int32Array(NCR);
  for (let start = 0; start < NCR; start++) {
    if (cls[start] >= 0) continue;
    const y = classRep.length; classRep.push(start); cls[start] = y;
    let qh = 0, qt = 0; Q[qt++] = start;
    while (qh < qt) { const c = Q[qh++]; for (let s = 0; s < 16; s++) { const c2 = crConj[s][c]; if (cls[c2] < 0) { cls[c2] = y; Q[qt++] = c2; } } }
  }
}
const nClasses = classRep.length;
console.error(`corner classes: ${nClasses} (expect 2768)`);
if (nClasses !== 2768) throw new Error('class count != 2768');
const symOf = new Uint8Array(NCR).fill(255);
for (let y = 0; y < nClasses; y++) { const r = classRep[y]; for (let s = 0; s < 16; s++) { const c = crConj[s][r]; if (symOf[c] === 255) symOf[c] = s; } }
// group inverse table: M_s · M_{invIdx[s]} = identity
const invIdx = new Uint8Array(16);
for (let s = 0; s < 16; s++) {
  for (let t = 0; t < 16; t++) {
    let ok = true;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      let d = 0; for (let k = 0; k < 3; k++) d += SYMS[s][i * 3 + k] * SYMS[t][k * 3 + j];
      if (d !== (i === j ? 1 : 0)) { ok = false; break; }
    }
    if (ok) { invIdx[s] = t; break; }
  }
}
// qsym[c] = the symmetry index q such that conj_q(E) is the stored edge value for corner c
// (q = symOf[c] inverted: the symmetry that normalizes c to the class rep, applied on E)
const qsym = new Uint8Array(NCR);
for (let c = 0; c < NCR; c++) qsym[c] = invIdx[symOf[c]];
// stabilizer mask per class: bit s set iff crConj[s][rep[y]] == rep[y]
const classStab = new Uint16Array(nClasses);
for (let y = 0; y < nClasses; y++) { const r = classRep[y]; let mask = 0; for (let s = 0; s < 16; s++) if (crConj[s][r] === r) mask |= 1 << s; classStab[y] = mask; }

// ---------------- jointCE: virtual-space BFS (Kociemba) ----------------
const NS = nClasses * NCR;
// repCrMove[gi][y] = crMove[gi][classRep[y]]
const repCrMove = G1_IDX.map((mi, gi) => new Int32Array(nClasses).map((_, y) => crMove[gi][classRep[y]]));
const T = new Uint8Array(NS).fill(255);
const Q = new Int32Array(NS); // packed y<<16 | e  (y < 2768 < 2^12, e < 40320 < 2^16)
let qh = 0, qt = 0;
const y0 = cls[0], i0 = symOf[0], e0 = e8Conj[i0][0];
T[y0 * NCR + e0] = 0;
Q[qt++] = (y0 << 16) | e0;
let maxd = 0, lastLog = 0;
while (qh < qt) {
  const key = Q[qh++];
  const y = key >>> 16, e = key & 0xffff;
  const d = T[y * NCR + e];
  const nd = d + 1;
  for (let gi = 0; gi < 10; gi++) {
    const cr1 = repCrMove[gi][y];
    const e1 = e8Move[gi][e];
    const y1 = cls[cr1];
    const e1c = e8Conj[qsym[cr1]][e1];
    const idx = y1 * NCR + e1c;
    if (T[idx] === 255) {
      T[idx] = nd; if (nd > maxd) maxd = nd; Q[qt++] = (y1 << 16) | e1c;
      // symmetric representations: fill the class-stabilizer conjugates (same class, conjugated edge value)
      let mask = classStab[y1];
      for (let k = 1; k < 16; k++) {
        if (!(mask & (1 << k))) continue;
        const idx2 = y1 * NCR + e8Conj[k][e1c];
        if (T[idx2] === 255) T[idx2] = nd;
      }
    }
  }
  if (qh - lastLog > NS / 25) { lastLog = qh; console.error(`  jointCE BFS ${(qh / NS * 100).toFixed(1)}% maxd=${maxd} ${Date.now() - t0}ms`); }
}
let unfilled = 0; for (let i = 0; i < NS; i++) if (T[i] === 255) unfilled++;
console.error(`jointCE BFS done: filled=${NS - unfilled}/${NS} maxd=${maxd} ${Date.now() - t0}ms`);

// ---------------- cornslice: (corner x slice) ----------------
function s4RankF(a) {
  let rank = 0;
  rank += 6 * (((a[1] < a[0]) ? 1 : 0) + ((a[2] < a[0]) ? 1 : 0) + ((a[3] < a[0]) ? 1 : 0));
  rank += 2 * (((a[2] < a[1]) ? 1 : 0) + ((a[3] < a[1]) ? 1 : 0));
  rank += (a[3] < a[2]) ? 1 : 0;
  return rank;
}
const slicePerms = [];
{ const a = [0, 1, 2, 3]; const used = new Array(4).fill(false);
  (function rec(d) { if (d === 4) { slicePerms.push(a.slice()); return; } for (let i = 0; i < 4; i++) { if (used[i]) continue; used[i] = true; a[d] = i; rec(d + 1); used[i] = false; } })(0); }
const g1Slice4 = G1_IDX.map(mi => {
  const mv = FMOVES[mi]; const M = moveMatrix(mv); const ep = [];
  for (let s = 0; s < 12; s++) { const p = vec(EDGE_SLOTS[s]); if (p[AXES[mv.axis]] !== mv.layer) continue; const np = matApply(M, p); const d = edgeSlotIdx.get(key3([np.x, np.y, np.z])); if (d !== s && s >= 8) ep.push([s - 8, d - 8]); }
  return ep;
});
const slMove = G1_IDX.map((mi, gi) => {
  const t = new Int32Array(24);
  for (let r = 0; r < 24; r++) { const cur = slicePerms[r]; const q = cur.slice(); for (const [s, d] of g1Slice4[gi]) q[d] = cur[s]; t[r] = s4RankF(q); }
  return t;
});
const CS = new Int32Array(NCR * 24).fill(-1);
CS[0] = 0;
{
  const N = NCR * 24;
  const Qc = new Int32Array(N); let qh2 = 0, qt2 = 0; Qc[qt2++] = 0; const D2 = new Uint8Array(N);
  let maxd2 = 0;
  while (qh2 < qt2) {
    const key = Qc[qh2]; const d = D2[key]; qh2++;
    const cr = (key / 24) | 0, sl = key % 24;
    for (let gi = 0; gi < 10; gi++) {
      const key2 = crMove[gi][cr] * 24 + slMove[gi][sl];
      if (CS[key2] < 0) { const nd = d + 1; CS[key2] = nd; D2[key2] = nd; if (nd > maxd2) maxd2 = nd; Qc[qt2++] = key2; }
    }
  }
  console.error(`cornslice BFS: reached=${qt2}/${NCR * 24} maxd=${maxd2}`);
}
const csDist = new Uint8Array(NCR * 24).fill(255);
for (let i = 0; i < NCR * 24; i++) if (CS[i] >= 0) csDist[i] = CS[i];

// ---------------- write ----------------
mkdirSync('data', { recursive: true });
writeFileSync('data/jointCE.pdb', Buffer.from(T));
writeFileSync('data/cornslice.pdb', Buffer.from(csDist));
writeFileSync('data/jointCE_qsym.pdb', Buffer.from(qsym));
writeFileSync('data/jointCE_meta.json', JSON.stringify({ nClasses, n: NS, maxd, ncr: NCR, unfilled, timeMs: Date.now() - t0 }));
updateManifest(['jointCE.pdb', 'cornslice.pdb', 'jointCE_qsym.pdb']);
console.error(`wrote data/jointCE.pdb (${NS}B) data/cornslice.pdb (${NCR * 24}B) data/jointCE_qsym.pdb (${NCR}B) maxd=${maxd} unfilled=${unfilled} ${Date.now() - t0}ms`);
