import { CubeState } from '../src/CubeState.js';
import { generateScramble } from '../src/Scrambler.js';
import { parseNotation, notation, ALL_MOVES } from '../src/moves.js';
import { solveCube, buildPDBs } from '../src/Solver.js';
function mulberry32(a){return function(){a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(a^(a>>>7),61|a))^t;return((t^(t>>>14))>>>0)/4294967296;};}

console.log('building PDBs...');
const t0 = Date.now(); buildPDBs(); console.log('PDB build:', Date.now()-t0, 'ms');

function applyStr(cube, str){ for(const mv of parseNotation(str)) cube.applyMove(mv); }
function verify(scrambleStr, solMoves){ const v=new CubeState(); applyStr(v, scrambleStr); for(const mi of solMoves) v.applyMove(ALL_MOVES[mi]); return v.isSolved(); }

// Short scrambles: must solve correctly and fast.
const rng = mulberry32(7);
for (let len of [2,4,6,8,10]){
  const scr = generateScramble(len, rng); const str = scr.map(notation).join(' ');
  const cube = new CubeState(); applyStr(cube, str);
  const res = solveCube(cube);
  if (res.error){ console.log(`len ${len}: ERROR ${res.error}`); continue; }
  const ok = verify(str, res.moves);
  console.log(`len ${len}: solved=${ok} solLen=${res.moves.length} nodes=${res.nodes} time=${res.time}ms`);
}

// One 20-move scramble with progress + time budget.
console.log('\n20-move scramble (time budget 120s):');
const scr20 = generateScramble(20, mulberry32(99)); const str20 = scr20.map(notation).join(' ');
const cube20 = new CubeState(); applyStr(cube20, str20);
let last=0;
const res20 = solveCube(cube20, { maxTimeMs: 120000, onProgress: p => { const now=Date.now(); if(now-last>10000){ last=now; console.log(`  bound=${p.bound} nodes=${p.nodes} time=${p.time}ms`);} } });
if (res20.error) console.log('20-move:', res20.error, 'nodes', res20.nodes, 'time', res20.time);
else { const ok = verify(str20, res20.moves); console.log(`20-move: solved=${ok} solLen=${res20.moves.length} nodes=${res20.nodes} time=${res20.time}ms`); }
