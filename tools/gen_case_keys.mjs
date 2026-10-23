// Build the recognition tables: data/cases/keys/<setId>.json
//
// Every case's key must come back to the case itself — from its stored setup
// and from all four AUF turns of that setup — and no two cases may share a key.
// Exit code 1 on a hole or a collision, so a bad table fails CI.
//
//   node tools/gen_case_keys.mjs            # every set under data/algdb
//   node tools/gen_case_keys.mjs 3x3 OLL    # one set

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { CubeState } from '../src/CubeState.js';
import { parseNotation, makeMove } from '../src/moves.js';
import { ollKey, pllKey } from '../src/cases/hash.js';
import { stateToStickerString } from '../src/render/stickerString.js';

const ONLY = process.argv.slice(2);

async function listAll() {
  const out = [];
  const puzzles = await readdir('data/algdb');
  for (const puzzle of puzzles) {
    if (!isDirectory(`data/algdb/${puzzle}`)) continue;
    for (const name of await readdir(`data/algdb/${puzzle}`)) {
      if (name.endsWith('.json') && name !== 'index.json') out.push([puzzle, name.slice(0, -5)]);
    }
  }
  return out;
}

const set = new Set();
void set;
async function isDirectory(p) {
  try {
    await readdir(p);
    return true;
  } catch {
    return false;
  }
}

const U = makeMove('U');

function applySetup(size, setup) {
  const st = new CubeState(size);
  for (const t of parseNotation(setup)) st.applyMove(t);
  return st;
}

async function main() {
  await mkdir('data/cases/keys', { recursive: true });
  let problems = 0;
  for (const [puzzle, file] of await listAll()) {
    if (ONLY.length && !ONLY.includes(file)) continue;
    const data = JSON.parse(await readFile(`data/algdb/${puzzle}/${file}.json`, 'utf8'));
    const setId = data.id ?? file;
    const kind = data.kind ?? setId;
    const keyFn = kind === 'OLL' ? ollKey : kind === 'PLL' ? pllKey : null;
    const size = puzzle === '2x2' ? 2 : 3;

    const keys = {};
    const owner = {};
    for (const c of data.cases) {
      const base = applySetup(size, c.setup);
      const variants = [base, base.clone(), base.clone(), base.clone()];
      for (let k = 1; k < 4; k++) {
        for (let i = 0; i < k; i++) variants[k].applyMove(U);
      }
      const hashes = new Set();
      for (const v of variants) {
        const h = keyFn ? keyFn(v) : stateOf(v);
        if (h) hashes.add(h);
      }
      if (!hashes.size) {
        problems++;
console.log(`${setId} ${c.id}: no key from its setup (recognition hole)`);
        continue;
      }
      for (const h of hashes) {
        const prev = owner[h];
        if (prev && prev !== c.id) {
          problems++;
console.log(`${setId}: key collision ${prev} vs ${c.id}`);
          continue;
        }
        owner[h] = c.id;
        keys[h] = c.id;
      }
    }

    const path = `data/cases/keys/${setId}.json`;
    await writeFile(path, JSON.stringify({ setId, puzzle, kind, count: data.cases.length, keys }, null) + '\n');
    const coverage = new Set(Object.values(keys)).size;
console.log(`${setId}: ${data.cases.length} cases -> ${Object.keys(keys).length} keys, ${coverage} cases reachable`);
    if (coverage !== data.cases.length) {
      problems++;
console.log(`${setId}: coverage gap, expected ${data.cases.length}`);
    }
  }
console.log(problems ? `FAIL: ${problems} problems` : 'OK: every case is reachable from its setup and its AUF turns');
  process.exit(problems ? 1 : 0);
}

function stateOf(v) {
  return stateToStickerString(v);
}

await main();
