// e2e check for the new two-phase Solver.js (loads pre-generated JCE/JQSY/CS).
import { CubeState } from '../src/CubeState.js';
import { generateScramble } from '../src/Scrambler.js';
import { buildPDBs, solveCube } from '../src/Solver.js';
import { ALL_MOVES_FULL, ID3 } from '../src/moves.js';
import { readFileSync } from 'node:fs';

const pre = {
  JCE: readFileSync('data/jointCE.pdb'),
  JQSY: readFileSync('data/jointCE_qsym.pdb'),
  CS: readFileSync('data/cornslice.pdb'),
};
const t0 = Date.now();
buildPDBs(({ label, pct }) => console.log(`[build] ${label} ${pct}%`), pre);
console.log(`build: ${Date.now() - t0}ms`);

function mulberry32(a){return function(){a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(a^(a>>>7),61|a))^t;return((t^(t>>>14))>>>0)/4294967296;};}
let fails = 0, total = 0, sumLen = 0, sumTime = 0;
for (const seed of [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]) {
  const r = mulberry32(seed);
  const scr = generateScramble(20, r);
  const cube = new CubeState();
  for (const mv of scr) cube.applyMove(mv);
  // apply a random whole-cube rotation to test normalization
  const r2 = mulberry32(seed + 1000);
  const whole = ALL_MOVES_FULL[18 + Math.floor(r2() * 9)];
  if (seed % 3 === 0) cube.applyMove(whole);
  const res = solveCube(cube);
  if (res.error) { console.log('seed', seed, 'ERROR', res.error); fails++; total++; continue; }
  const chk = cube.clone();
  for (const mi of res.moves) chk.applyMove(ALL_MOVES_FULL[mi]);
  total++;
  sumLen += res.moves.length; sumTime += res.time;
  const uniform = chk.isSolved();
  let ok = true;
  for (const c of chk.cubies) {
    const man = Math.abs(c.home.x)+Math.abs(c.home.y)+Math.abs(c.home.z);
    if (man < 2) continue;
    if (c.pos.x!==c.home.x||c.pos.y!==c.home.y||c.pos.z!==c.home.z) { ok=false; break; }
    for (let i=0;i<9;i++) if (c.rot[i]!==ID3[i]) { ok=false; break; }
    if (!ok) break;
  }
  if (!uniform || !ok) { fails++; console.log(`seed ${seed}: uniform=${uniform} piecesOk=${ok} solLen=${res.moves.length}`); }
  else console.log(`seed ${seed}: len=${res.moves.length} time=${res.time}ms`);
}
console.log(fails === 0 ? `ALL ${total} solved; avg len=${(sumLen/total).toFixed(1)} avg time=${(sumTime/total).toFixed(0)}ms` : `FAILS: ${fails}/${total}`);
