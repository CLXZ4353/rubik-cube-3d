// Gate: /t, /cross and the case pages must not reach Three.js. The graph is
// read from the source (every static import, plus the dynamic import() spec
// strings), not from the browser, so the rule holds without a WebGL context.
//
//   node tests/nothree.test.mjs

import { readdir, readFile, stat } from 'node:fs/promises';
import { PAGES } from '../src/app/routes.js';

const THREE = ['vendor/three.module.js', 'three'];
const CUBE_ENTRY = 'src/CubeApp.js';

/** Resolve one import to a repo path, or null for a bare/builtin name. */
function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return spec === 'three' ? 'three' : null;
  const base = fromFile.replace(/\/[^/]*$/, '');
  const parts = [...(fromFile.split('/').slice(0, -1)), ...spec.split('/')];
  const out = [];
  for (const p of parts) {
    if (p === '.' || p === '') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  const path = out.join('/');
  return path;
}

function importsOf(text) {
  const out = [];
  const re = /(?:from|import)\s+'([^']+)'/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  const dyn = /import\(\s*'([^']+)'/g;
  while ((m = dyn.exec(text)) !== null) out.push(m[1]);
  return out;
}

const cache = new Map();
async function read(path) {
  const hit = cache.get(path);
  if (hit !== undefined) return hit;
  try {
    const v = await readFile(path, 'utf8');
    cache.set(path, v);
    return v;
  } catch {
    cache.set(path, null);
    return null;
  }
}

async function reachable(from, start) {
  const seen = new Set();
  const queue = [start];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = await read(file);
    if (text === null) continue;
    for (const spec of importsOf(text)) {
      const path = resolveImport(from, spec);
      if (!path) continue;
      const abs = path === 'three' ? 'three' : `${path}`;
      if (THREE.includes(abs) || abs.endsWith('three.module.js')) {
        seen.add('THREE');
        continue;
      }
      queue.push(abs);
    }
    void from;
  }
  return seen;
}

let fails = 0;
for (const [name, spec] of Object.entries(PAGES)) {
  const start = `src/app/${spec.module}`;
  const reach = await reachable(start, start);
  const touches3d = reach.has('THREE') || reach.has(CUBE_ENTRY) || reach.has('src/Cube.js');
  const allowed = name === 'cube3d' || name === 'home';
  if (touches3d && !allowed) {
    fails++;
    console.log(`FAIL ${name} reaches 3D: ${[...reach].filter((p) => p.startsWith('src/Cu') || p === 'THREE').join(' ')}`);
  }
}

// The 3D engine itself must load three lazily, not at module top.
const cubeText = await read('src/CubeApp.js');
const topImports = cubeText.split('\n').filter((line) => /^(import|export import)/.test(line));
if (topImports.some((line) => /'three'/.test(line))) {
  fails++;
  console.log('FAIL CubeApp imports three at module scope');
}

console.log(`nothree: ${fails} fails`);
process.exit(fails ? 1 : 0);
