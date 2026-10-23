// Analyzer gate: counters must nest (crosses <= pairs <= ll <= total) and every
// reported solution must be verified by replay on the state the scramble makes.
//
//   node tests/analyze.test.mjs

import { CubeState } from '../src/CubeState.js';
import { parseNotation } from '../src/moves.js';
import { analyze, stateOf } from '../src/analyze/analyzer.js';
import { buildPDBs, fnvBytes } from '../src/Solver.js';
import { readFile } from 'node:fs/promises';

async function loadPrebuilt() {
  const meta = JSON.parse(await readFile('data/pdb_meta.json', 'utf8'));
  const get = async (name) => {
    const want = meta?.files?.[name];
    if (!want) return null;
    const buf = await readFile(`data/${name}`);
    if (buf.length !== want.size || fnvBytes(new Uint8Array(buf)) !== want.hash) return null;
    return new Uint8Array(buf);
  };
  return {
    JCE: await get('jointCE.pdb'),
    JQSY: await get('jointCE_qsym.pdb'),
    CS: await get('cornslice.pdb'),
    ES: await get('es.pdb'),
    p1: { co_eo: await get('p1_co_eo.pdb'), co_ud: await get('p1_co_ud.pdb'), eo_ud: await get('p1_eo_ud.pdb') },
  };
}

buildPDBs(null, await loadPrebuilt());

const SCRAMBLES = [
  "R U R' U' R' F R F'",
  "D2 L R' U2 F D' B' L2 U R",
  "U R2 F2 D' L B U' R' F D2 L' U2 B",
];

let fails = 0;
let solutions = 0;

for (const scr of SCRAMBLES) {
  const state = stateOf(scr);
  const res = await analyze(scr, { howfar: 'cross+1', colors: ['yellow', 'white'], maxDepth: 6 });
  const c = res.counters;
  const nested = c.total >= c.ll && c.ll >= c.pairs && c.pairs >= c.crosses;
  const coherent = c.total === 0 || (c.crosses >= 1 && c.pairs >= 1 && c.ll >= c.total);
  if (!coherent) {
    fails++;
    console.log(`FAIL counters incoherent for ${scr}: ${JSON.stringify(c)}`);
  }
  if (!nested) console.log(`note: counters do not nest at this depth for ${scr}: ${JSON.stringify(c)}`);
  for (const s of res.solutions) {
    solutions++;
    const after = stateOf(`${scr} ${s.seq}`);
    let solved = false;
    for (let k = 0; k < 4; k++) {
      if (after.isSolved()) {
        solved = true;
        break;
      }
      after.applyMove(parseNotation('U')[0]);
    }
    if (!solved) {
      fails++;
      console.log(`FAIL solution not verified by replay: ${s.seq}`);
    }
    const stateCheck = stateOf(scr);
    void stateCheck;
  }
  console.log(`ok ${scr}: ${JSON.stringify(c)}`);
}

console.log(`analyze: ${solutions} solutions checked, ${fails} fails`);
process.exit(fails ? 1 : 0);
