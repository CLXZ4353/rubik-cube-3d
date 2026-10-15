// Validate data/jointCE.pdb:
//  1) T-indices orbit-invariance (all 16 conjugates of a state share one entry?)
//  2) full-space BFS on (cr,e8) to depth D, compare table values with true distances
import { readFileSync } from 'node:fs';
import { matApply, moveMatrix, AXES } from '../src/moves.js';
import { FMOVES, cornerPairs } from '../src/Solver.js';

const t0 = Date.now();
const G1_IDX = [0, 1, 2, 3, 4, 5, 8, 11, 14, 17];
const EDGE_SLOTS = [[0,1,1],[0,1,-1],[-1,1,0],[1,1,0],[0,-1,1],[0,-1,-1],[-1,-1,0],[1,-1,0],[1,0,1],[1,0,-1],[-1,0,-1],[-1,0,1]];
const CORNER_SLOTS = [[1,1,1],[1,1,-1],[-1,1,-1],[-1,1,1],[1,-1,1],[1,-1,-1],[-1,-1,-1],[-1,-1,1]];
const key3 = p => ((p[0] + 1) * 7 + (p[1] + 1)) * 7 + (p[2] + 1);
const edgeSlotIdx = new Map(EDGE_SLOTS.map((q, i) => [key3(q), i]));
const cornerSlotIdx = new Map(CORNER_SLOTS.map((q, i) => [key3(q), i]));
const NCR = 40320;
const vec = a => ({ x: a[0], y: a[1], z: a[2] });

const SYMS = [
  [1,0,0, 0,1,0, 0,0,1],[0,0,1, 0,1,0,-1,0,0],[-1,0,0, 0,1,0, 0,0,-1],[0,0,-1, 0,1,0, 1,0,0],
  [1,0,0, 0,-1,0, 0,0,-1],[-1,0,0, 0,-1,0, 0,0,1],[0,0,1, 0,-1,0, 1,0,0],[0,0,-1, 0,-1,0,-1,0,0],
  [1,0,0, 0,-1,0, 0,0,1],[0,0,1, 0,-1,0,-1,0,0],[-1,0,0, 0,-1,0, 0,0,-1],[0,0,-1, 0,-1,0, 1,0,0],
  [1,0,0, 0,1,0, 0,0,-1],[-1,0,0, 0,1,0, 0,0,1],[0,0,1, 0,1,0, 1,0,0],[0,0,-1, 0,1,0,-1,0,0],
];
const symCornerImg = SYMS.map(M => CORNER_SLOTS.map(q => cornerSlotIdx.get(key3([M[0]*q[0]+M[3]*q[1]+M[6]*q[2], M[1]*q[0]+M[4]*q[1]+M[7]*q[2], M[2]*q[0]+M[5]*q[1]+M[8]*q[2]]))));
const symEdgeImg = SYMS.map(M => EDGE_SLOTS.map(q => edgeSlotIdx.get(key3([M[0]*q[0]+M[3]*q[1]+M[6]*q[2], M[1]*q[0]+M[4]*q[1]+M[7]*q[2], M[2]*q[0]+M[5]*q[1]+M[8]*q[2]]))));

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
const symOf = new Uint8Array(NCR).fill(255);
for (let y = 0; y < classRep.length; y++) { const r = classRep[y]; for (let s = 0; s < 16; s++) { const c = crConj[s][r]; if (symOf[c] === 255) symOf[c] = s; } }
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
const qsym = new Uint8Array(NCR);
for (let c = 0; c < NCR; c++) qsym[c] = invIdx[symOf[c]];
const qsymFile = new Uint8Array(readFileSync('data/jointCE_qsym.pdb'));
if (qsym.length !== qsymFile.length || qsym.some((v, i) => v !== qsymFile[i])) throw new Error('qsym mismatch with file');

const meta = JSON.parse(readFileSync('data/jointCE_meta.json', 'utf8'));
const T = new Uint8Array(readFileSync('data/jointCE.pdb'));
console.error(`table loaded: maxd=${meta.maxd} classes=${meta.nClasses} (${Date.now() - t0}ms)`);
const Tidx = (cr, e8) => cls[cr] * NCR + e8Conj[qsym[cr]][e8];

// ---- 1. orbit invariance of T-indices ----
let notInvariant = 0, checked = 0;
for (let trial = 0; trial < 50000; trial++) {
  const cr = (Math.random() * NCR) | 0, e8 = (Math.random() * NCR) | 0;
  const e0 = Tidx(cr, e8);
  for (let s = 1; s < 16; s++) {
    const crs = crConj[s][cr], eS = e8Conj[s][e8];
    if (Tidx(crs, eS) !== e0) { notInvariant++; break; }
  }
  checked++;
}
console.error(`orbit invariance: ${checked - notInvariant}/${checked} states have all 16 conjugates sharing one entry`);

// ---- 2. full-space BFS to depth D vs table ----
const D = 7;
const HSIZE = 1 << 22, hmask = HSIZE - 1;
const hslot = key => ((key ^ 0x9e3779b9) * 2654435761) >>> 0 & hmask;
const hv = new Int32Array(HSIZE).fill(-2); // -2 empty, else depth
const QK = new Int32Array(HSIZE).fill(-1);
const Q = new Int32Array(1 << 22), QD = new Uint8Array(1 << 22);
hv[hslot(0)] = 0; QK[hslot(0)] = 0;
let qh = 0, qt = 0; Q[qt] = 0; QD[qt] = 0; qt++;
let mism = 0, maxDiff = 0, over = 0, under = 0, cmp = 0;
const diffs = new Map();
while (qh < qt) {
  const key = Q[qh]; const d = QD[qh]; qh++;
  const cr = key >>> 16, e8 = key & 0xffff;
  const tv = T[Tidx(cr, e8)];
  if (tv !== 255) {
    cmp++;
    if (tv !== d) {
      mism++; const diff = d - tv; if (Math.abs(diff) > maxDiff) maxDiff = Math.abs(diff);
      if (tv > d) over++; else under++;
      diffs.set(diff, (diffs.get(diff) || 0) + 1);
    }
  }
  if (d >= D) continue;
  for (let gi = 0; gi < 10; gi++) {
    const cr1 = crMove[gi][cr], e1 = e8Move[gi][e8];
    const key2 = (cr1 << 16) | e1;
    let s2 = hslot(key2);
    if (hv[s2] !== -2) { while (hv[s2] !== -2 && QK[s2] !== key2) s2 = (s2 + 1) & hmask; }
    if (hv[s2] === -2) {
      hv[s2] = d + 1; QK[s2] = key2;
      Q[qt] = key2; QD[qt] = d + 1; qt++;
    }
  }
}
console.error(`full-BFS depth<=${D}: reached=${qt} compared=${cmp} mismatches=${mism} (table>truth: ${over}, table<truth: ${under}) maxAbsDiff=${maxDiff}`);
console.error('diff histogram (truth - table):', [...diffs.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
