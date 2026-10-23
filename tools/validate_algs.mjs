// Dataset quality gate: every algorithm in every dataset must actually do what
// its case says it does. Exit code 1 on any problem, so CI fails on a bad set.
//
//   node tools/validate_algs.mjs            # every data/algdb/*/*.json
//   node tools/validate_algs.mjs --compare  # also report metrics vs the original site
//
// Per case we check, with the authoritative logical cube (never a picture):
//   (a) the setup, applied to a solved cube, produces exactly the case,
//   (b) the case's sticker string equals the state that setup produces,
//   (c) every alg solves the case — or leaves it solved up to an AUF turn,
//       which is how last-layer algs are written,
//   (d) the stored metrics equal the recomputation in src/notation/metrics.js,
//   (e) no two cases of a set share a recognition hash.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { CubeState } from '../src/CubeState.js';
import { parseNotation, makeMove } from '../src/moves.js';
import { stateToStickerString } from '../src/render/stickerString.js';
import { metrics } from '../src/notation/metrics.js';
import { ollKey, pllKey } from '../src/cases/hash.js';

const COMPARE = process.argv.includes('--compare');
const ALGDB = `${process.cwd()}/data/algdb`;

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function listJson(dir) {
  const out = [];
  for (const sub of readdirSync(dir)) {
    const path = `${dir}/${sub}`;
    if (isDirectory(path)) {
      for (const name of readdirSync(path)) if (name.endsWith('.json') && name !== 'index.json') out.push(`${path}/${name}`);
    } else if (sub.endsWith('.json') && sub !== 'index.json') {
      out.push(path);
    }
  }
  return out.sort();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const U_TURN = makeMove('U');
const X_TURN = makeMove('x');
const Y_TURN = makeMove('y');

function applyMoves(state, text) {
  for (const token of parseNotation(text)) state.applyMove(token);
  return state;
}

// An optimal solution may finish with the cube gripped differently (x/y turns
// are real moves in the alg), so "solved" means solved modulo whole-cube
// rotations; a last-layer alg may also stop one AUF turn short.
function solvedModGrip(state) {
  let st = state.clone();
  for (let xi = 0; xi < 4; xi++) {
    let s2 = st.clone();
    for (let yi = 0; yi < 4; yi++) {
      let s3 = s2.clone();
      for (let ui = 0; ui < 4; ui++) {
        if (s3.isSolved()) return true;
        s3.applyMove(U_TURN);
      }
      s2.applyMove(Y_TURN);
    }
    st.applyMove(X_TURN);
  }
  return false;
}

function caseHash(set, state) {
  if (set.kind === 'OLL') return ollKey(state);
  if (set.kind === 'PLL') return pllKey(state);
  return stateToStickerString(state);
}

/** OLL algs orient the last layer; they are not required to solve the cube. */
function lastLayerOriented(state) {
  const solved = new CubeState(3);
  const solvedStr = stateToStickerString(solved);
  const s = stateToStickerString(state);
  if (s.slice(0, 9) !== 'UUUUUUUUU') return false;
  for (const f of [1, 2, 3, 4]) {
    if (s.slice(f * 9 + 3, f * 9 + 9) !== solvedStr.slice(f * 9 + 3, f * 9 + 9)) return false;
  }
  return s.slice(45) === solvedStr.slice(45);
}

function algWorks(set, state, alg) {
  const after = applyMoves(state.clone(), alg.seq);
  if (set.kind === 'OLL') return lastLayerOriented(after);
  return after.isSolved() || solvedModGrip(after);
}

let problems = 0;
let casesChecked = 0;
let algsChecked = 0;

for (const file of listJson(ALGDB)) {
  const set = readJson(file);
  const hashes = new Map();
  let fileProblems = 0;

  for (const c of set.cases) {
    casesChecked++;
    const errors = [];
    let state = null;
    try {
      const size = set.puzzle === '2x2' ? 2 : 3;
      state = applyMoves(new CubeState(size), c.setup);
    } catch (err) {
      errors.push(`setup "${c.setup}" threw: ${err}`);
    }

    if (state) {
      const stickers = stateToStickerString(state);
      if (c.stickers && stickers !== c.stickers) {
        errors.push(`stickers disagree: case says ${c.stickers}, setup gives ${stickers}`);
      }
      for (const alg of c.algs) {
        algsChecked++;
        if (!algWorks(set, state, alg)) {
          errors.push(`alg "${alg.seq}" does not ${set.kind === 'OLL' ? 'orient' : 'solve'} ${c.id}`);
        }
      }
      const hash = caseHash(set, state);
      if (hash) {
        if (hashes.has(hash)) errors.push(`hash collides with case ${hashes.get(hash)}`);
        else hashes.set(hash, c.id);
      }
    }

    for (const alg of c.algs) {
      const got = metrics(alg.seq);
      for (const key of Object.keys(got)) {
        const stored = alg[key];
        if (stored != null && stored !== got[key]) {
          errors.push(`metric ${key} for "${alg.seq}" says ${stored}, recomputed ${got[key]}`);
        }
      }
    }

    if (errors.length) {
      fileProblems += errors.length;
      problems += errors.length;
      console.log(`${file} :: ${c.id}`);
      for (const e of errors) console.log(`  ${e}`);
    }
  }

  console.log(`${file}: ${set.cases.length} cases, ${hashes.size} distinct hashes, ${fileProblems} problems`);
}

if (COMPARE) compareWithOriginal();

console.log(problems ? `FAIL: ${problems} problems across ${casesChecked} cases / ${algsChecked} algs` : `OK: ${casesChecked} cases, ${algsChecked} algs verified`);
process.exit(problems ? 1 : 0);

// Informational only: how our move counts compare with the original site's.
function compareWithOriginal() {
  const origDir = `${process.cwd()}/data/orig`;
  for (const file of listJson(ALGDB)) {
    const set = readJson(file);
    const origPath = `${origDir}/${set.id}.json`;
    let orig;
    try {
      orig = readJson(origPath);
    } catch {
      continue;
    }
    const byCode = new Map();
    for (const c of orig.cases) {
      const alg = c.algs.find((a) => a.notation && (!a.variant || a.variant === set.variants[0]));
      if (alg) byCode.set(c.code, alg);
    }
    let same = 0;
    let diff = 0;
    let missing = 0;
    for (const c of set.cases) {
      const o = byCode.get(c.code);
      if (!o || !o.moves) {
        missing++;
        continue;
      }
      if (o.moves === c.algs[0].moves) same++;
      else {
        diff++;
        console.log(`${set.id} ${c.code}: original ${o.moves} vs ours ${c.algs[0].moves}`);
      }
    }
    console.log(`${set.id} vs original: ${same} equal, ${diff} differ, ${missing} no original metric`);
  }
}
