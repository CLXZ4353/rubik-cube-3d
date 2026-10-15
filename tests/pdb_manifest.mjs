// data/pdb_meta.json: the manifest the browser worker checks before it trusts a
// pre-computed PDB - { v, files: { "<name>.pdb": { size, hash, v } } }.
// v is Solver.js's tablesVersion() at the time the file was written, hash is FNV-1a
// over the bytes; the worker refuses a file whose v is stale or whose bytes do not
// match the hash, and rebuilds instead of pruning with wrong distances.
//
//   node tests/pdb_manifest.mjs                     # stamp every data/*.pdb on disk
//   node tests/pdb_manifest.mjs jointCE.pdb ...     # stamp just those names
//   node tests/pdb_manifest.mjs --check             # CI gate: are the tables usable?
//
// The pregen scripts call updateManifest() with the files they wrote. Changing
// Solver.js semantics or a pregen script means: re-run BOTH pregen scripts, so all
// files get the new v (a file that keeps an old v is rejected by the worker).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tablesVersion, fnvBytes } from '../src/Solver.js';

export function updateManifest(names, metaPath = 'data/pdb_meta.json') {
  const v = tablesVersion();
  let files = {};
  try {
    files = JSON.parse(readFileSync(metaPath, 'utf8')).files || {};
  } catch {
    /* no manifest yet */
  }
  const list = names && names.length
    ? names
    : readdirSync('data').filter((n) => n.endsWith('.pdb')).sort();
  for (const name of list) {
    const buf = new Uint8Array(readFileSync('data/' + name));
    files[name] = { size: buf.length, hash: fnvBytes(buf), v };
  }
  writeFileSync(metaPath, JSON.stringify({ v, files }, null, 1) + '\n');
  console.log(`pdb_meta.json: v=${v} ${list.length} files stamped`);
}

/** CI/deploy gate: are the jointCE tables on disk usable for this code?
   data/ is git-ignored, so a git-based deploy ships none of them and the app
   silently drops to the slow phase-2 heuristic -> exit 1 makes that loud. */
export function check() {
  const v = tablesVersion();
  let meta;
  try {
    meta = JSON.parse(readFileSync('data/pdb_meta.json', 'utf8'));
  } catch {
    console.error('check: no data/pdb_meta.json -> run `npm run pregen && npm run pregenCE`');
    return 1;
  }
  const bad = [];
  for (const name of ['jointCE.pdb', 'jointCE_qsym.pdb']) {
    const ent = meta.files && meta.files[name];
    let buf;
    try {
      buf = new Uint8Array(readFileSync('data/' + name));
    } catch {
      buf = null;
    }
    if (!buf) bad.push(name + ' missing');
    else if (!ent || ent.v !== v) bad.push(name + ' stamped for a different code version');
    else if (buf.length !== ent.size || fnvBytes(buf) !== ent.hash) bad.push(name + ' does not match its manifest hash');
  }
  if (bad.length) {
    console.error('check FAILED: ' + bad.join('; ') + ' -> run `npm run pregen && npm run pregenCE`');
    return 1;
  }
  console.log('check ok: jointCE tables usable, v=' + v);
  return 0;
}

if (process.argv[1].endsWith('pdb_manifest.mjs')) {
  const args = process.argv.slice(2);
  if (args[0] === '--check') process.exit(check());
  updateManifest(args);
}
