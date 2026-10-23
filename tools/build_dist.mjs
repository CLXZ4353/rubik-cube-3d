// Build dist/ for the deploy: copy the files the browser loads.
//
//   node tools/build_dist.mjs
//
// The 3D app and the solver read data/ (the PDB tables + pdb_meta.json) over
// the same origin, so data/ has to ship too — the .pdb files are 111 MB of
// prebuilt tables, which is why the manifest prints the total and why the
// immutable cache rule in server.mjs / _headers matters.
//
// A JSON manifest (name, size, fnv hash) is written so the deploy can be
// checked afterwards without re-reading every byte.
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { cpSync } from 'node:fs';
import { fnvBytes } from '../src/Solver.js';

const TOP = ['index.html', 'styles.css', 'favicon.svg', '_headers'];
const DIRS = ['src', 'styles', 'vendor', 'data'];

export async function build() {
  await rm('dist', { recursive: true, force: true });
  await mkdir('dist');
  const manifest = {};
  let bytes = 0;
  for (const name of TOP) {
    await cp(name, `dist/${name}`);
    const buf = await readFile(`dist/${name}`);
    manifest[name] = { size: buf.length, hash: fnvBytes(new Uint8Array(buf)) };
    bytes += buf.length;
  }
  for (const name of DIRS) {
    await cp(name, `dist/${name}`, { recursive: true });
    for (const [file, size] of await walk(`dist/${name}`)) {
      manifest[file] = { size, hash: null };
      bytes += size;
    }
  }
  manifest['.manifest'] = { total: bytes, files: Object.keys(manifest).length - 1 };
  await writeFile('dist/manifest.json', JSON.stringify(manifest, null, 1));
  return manifest;
}

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = `${dir}/${name}`;
    const st = await stat(p);
    if (st.isDirectory()) out.push(...(await walk(p)));
    else out.push([p, st.size]);
  }
  return out;
}

const manifest = await build();
const head = manifest['.manifest'];
console.log(`dist: ${head.files} files, ${(head.total / 1048576) | 0} MB -> dist/manifest.json`);
