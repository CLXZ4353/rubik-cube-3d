// Two-phase solver regression check.
// Applies a scramble (face moves, plus whole-cube prefixes on some seeds),
// asks Solver.solveCube, replays ALL_MOVES_FULL[mi] on a clone, asserts solved.
import { solveCube, buildPDBs, ALL_MOVES_FULL, isSolvedState } from '../src/Solver.js';
import { CubeState } from '../src/CubeState.js';
import { generateScramble } from '../src/Scrambler.js';
import { WHOLE_MOVES, parseNotation } from '../src/moves.js';
import { readFileSync } from 'node:fs';

const pre = {
  JCE: readFileSync('data/jointCE.pdb'),
  JQSY: readFileSync('data/jointCE_qsym.pdb'),
  CS: readFileSync('data/cornslice.pdb'),
  ES: readFileSync('data/es.pdb'),
  p1: {
    co_eo: readFileSync('data/p1_co_eo.pdb'),
    co_ud: readFileSync('data/p1_co_ud.pdb'),
    eo_ud: readFileSync('data/p1_eo_ud.pdb'),
  },
};
buildPDBs(null, pre);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(a ^ (a >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let fails = 0, totalLen = 0, totalTime = 0, N = 0;
const CASES = [];
for (let seed = 1; seed <= 20; seed++) CASES.push({ kind: 'face20', seed });
for (let seed = 101; seed <= 106; seed++) CASES.push({ kind: 'whole', seed });
for (let seed = 201; seed <= 204; seed++) CASES.push({ kind: 'slice', seed });
CASES.push({ kind: 'solved' }, { kind: 'onetwist' }, { kind: 'oneswap' }, { kind: 'wholeonly' });

for (const cs of CASES) {
  const cube = new CubeState();
  if (cs.kind === 'face20') {
    const r = mulberry32(cs.seed);
    const scr = generateScramble(20, r);
    for (const mv of scr) cube.applyMove(mv);
  } else if (cs.kind === 'whole') {
    const r = mulberry32(cs.seed);
    const scr = generateScramble(18, r);
    for (const mv of scr) cube.applyMove(mv);
    const wm = WHOLE_MOVES[(cs.seed % 3) * 3 + (cs.seed % 3)]; // x, y2, z ... variants
    cube.applyMove(wm);
    cube.applyMove(parseNotation('U')[0]);
  } else if (cs.kind === 'slice') {
    const r = mulberry32(cs.seed);
    const scr = generateScramble(15, r);
    for (const mv of scr) cube.applyMove(mv);
  } else if (cs.kind === 'wholeonly') {
    cube.applyMove(parseNotation('x')[0]);
    cube.applyMove(parseNotation('y2')[0]);
  } else if (cs.kind === 'onetwist') {
    cube.applyMove(parseNotation('R')[0]);
  } else if (cs.kind === 'oneswap') {
    for (const t of parseNotation("R U R' U'")) cube.applyMove(t);
  } else if (cs.kind === 'solved') {
    // nothing
  }

  const t0 = Date.now();
  const res = solveCube(cube, { maxTimeMs: 30000 });
  const dt = Date.now() - t0;
  if ('error' in res) {
    console.log('FAIL', cs.kind, 'error=' + res.error);
    fails++;
    continue;
  }
  // replay on a clone using full move list (indices may be >=18: whole-cube)
  const chk = cube.clone();
  for (const mi of res.moves) {
    const mv = ALL_MOVES_FULL[mi];
    chk.applyMove(mv);
  }
  const solved = chk.isSolved();
  if (!solved) {
    console.log('FAIL', cs.kind, 'replay not solved');
    fails++;
    continue;
  }
  if (res.moves.length > 30) {
    console.log('FAIL', cs.kind, 'len=' + res.moves.length, 'too long');
    fails++;
    continue;
  }
  totalLen += res.moves.length;
  totalTime += dt;
  N++;
  console.log('ok', cs.kind, 'len=' + res.moves.length, 'time=' + dt + 'ms', 'optimal=' + res.optimal);
}
console.log(`solvecheck: ${N} ok, ${fails} fails; avg len=${(totalLen / N).toFixed(1)} avg time=${(totalTime / N).toFixed(0)}ms`);
if (fails) process.exit(1);
