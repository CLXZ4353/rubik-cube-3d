// Global search box. The index is static (built once from the datasets and the
// route table) and every entry carries a redirect to a real page, so a fuzzy
// query like "pl l" or "pll" still lands somewhere useful.

import { PAGES } from './routes.js';
import { NAV, resolve } from './router.js';

/** Words that mean a page, not a database entry. */
export const REDIRECTS = {
  pll: '/t/pllrecog',
  recog: '/t/pllrecog',
  recognization: '/t/pllrecog',
  recognition: '/t/pllrecog',
  '2-sided': '/t/pllrecog',
  cross: '/cross',
  beginner: '/Beginner',
  guide: '/Beginner',
  practice: '/t',
  train: '/t',
  trainer: '/t',
  alg: '/t',
  algs: '/t',
  db: '/a',
  database: '/a',
  analyze: '/analyze',
  analyzer: '/analyze',
  analysis: '/analyze',
  settings: '/settings',
  theme: '/settings',
  privacy: '/privacy',
  33: '/a/3x3',
  '3x3': '/a/3x3',
  22: '/a/2x2',
  '2x2': '/a/2x2',
  44: '/a/4x4',
  '4x4': '/a/4x4',
  oll: '/a/3x3/OLL',
  pll3x3: '/a/3x3/PLL',
};

/** Fixed part of the index: pages, nav, aliases, modes. */
function staticEntries() {
  const out = [];
  const seen = new Set();
  const add = (label, path, kind) => {
    const key = `${path}|${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, path, kind });
  };
  for (const [label, path] of NAV) add(label, path, 'nav');
  for (const name of Object.keys(PAGES)) add(name, pagePath(name), 'page');
  for (const alias of Object.keys(REDIRECTS)) add(alias, REDIRECTS[alias], 'alias');
  for (const colour of ['white', 'yellow', 'green', 'blue', 'orange', 'red']) {
    add(`${colour} cross`, '/cross', 'mode');
    add(`${colour} cross`, '/analyze', 'mode');
  }
  for (let d = 1; d <= 7; d++) add(`difficulty ${d}`, `/cross?difficulty=${d}`, 'mode');
  for (const mode of ['cross', 'f2l', 'oll', 'pll', 'll', 'cube']) add(mode, '/analyze', 'mode');
  return out;
}

function pagePath(name) {
  for (const route of [
    ['home', '/'], ['trainer', '/t'], ['pllrecog', '/t/pllrecog'], ['cross', '/cross'],
    ['analyze', '/analyze'], ['sets', '/a/3x3'], ['cases', '/a/3x3/OLL'],
    ['case', '/a/3x3/OLL/OLL_1'], ['beginner', '/Beginner'], ['algsheet', '/algsheet'],
    ['settings', '/settings'], ['privacy', '/privacy'],
  ]) {
    if (route[0] === name) return route[1];
  }
  return '/';
}

// Datasets live under data/algdb/<puzzle>/<set>.json. In the browser they are
// static files served next to the app; under node they are read from disk.
const inNode = typeof globalThis.process === 'object';
// node:fs must not be a static import: the browser would try to fetch it as a
// module. It is pulled in only when the code is actually running in node.
let readdir = null;
let readFile = null;
if (inNode) { const fsmod = await import('node:fs/promises'); readdir = fsmod.readdir; readFile = fsmod.readFile; }

async function readJson(path) {
  if (inNode) {
    const root = `${process.cwd()}/${path}`.replace(/^\/+/, '');
    return JSON.parse(await readFile(root, 'utf8'));
  }
  const res = await fetch(path);
  if (!res.ok) return null;
  return res.json();
}

async function listSets(puzzle) {
  if (!inNode) return await listSetsFromIndex(puzzle);
  try {
    const dir = `${process.cwd()}/data/algdb/${puzzle}`;
    const names = await readdir(dir);
    return names.filter((n) => n.endsWith('.json') && n !== 'index.json').map((n) => n.slice(0, -5));
  } catch {
    return [];
  }
}

/** The browser gets this list from the same catalogue the pages use. */
async function listSetsFromIndex(puzzle) {
  try {
    const res = await fetch(`/data/algdb/${puzzle}/index.json`);
    if (!res.ok) return [];
    return (await res.json()).sets ?? [];
  } catch {
    return [];
  }
}

/** Case pages and their algorithms, which is where the bulk of the index is. */
async function caseEntries() {
  const out = [];
  for (const puzzle of ['3x3']) {
    for (const set of await listSets(puzzle)) {
      const data = await readJson(`/data/algdb/${puzzle}/${set}.json`);
      if (!data) continue;
      const setId = data.id ?? set;
      for (const c of data.cases) {
        const base = `/a/${puzzle}/${setId}/${c.id}`;
        out.push({ label: c.name ?? c.id, path: base, kind: 'case' });
        if (c.group) out.push({ label: `${setId} ${c.group}`, path: `/a/${puzzle}/${setId}`, kind: 'group' });
        for (const alg of c.algs) out.push({ label: alg.seq, path: base, kind: 'alg' });
      }
    }
  }
  return out;
}

export async function buildIndex() {
  const cases = await caseEntries();
  const all = [...staticEntries(), ...cases];
  return all;
}

/** Fuzzy lookup: exact/alias first, then prefix, then a light edit-distance pass. */
export function lookup(query, index) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const cq = compact(q); // "T-Perm", "t perm" and "tperm" are the same search
  const hit = REDIRECTS[q] ?? REDIRECTS[cq];
  const scored = [];
  for (const e of index) {
    const label = String(e.label).toLowerCase();
    const key = compact(label);
    let score = null;
    if (label === q || key === cq) score = 0;
    else if (label.startsWith(q) || key.startsWith(cq)) score = 1;
    else if (label.includes(q) || key.includes(cq)) score = 2;
    else if (similar(cq, key)) score = 3;
    if (score === null) continue;
    scored.push({ label: e.label, path: e.path, kind: e.kind, score });
  }
  scored.sort((a, b) => a.score - b.score || a.label.length - b.label.length);
  const top = scored.slice(0, 12);
  if (hit && !top.some((e) => e.path === hit)) top.unshift({ label: q, path: hit, kind: 'redirect', score: 0 });
  return top;
}

function compact(s) {
  return s.replace(/[^a-z0-9]+/g, '');
}

function similar(a, b) {
  if (Math.abs(a.length - b.length) > 2) return false;
  if (levenshtein(a, b) > Math.ceil(a.length / 3)) return false;
  return true;
}

function levenshtein(a, b) {
  let prev = [];
  for (let j = 0; j <= b.length; j++) prev.push(j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur.push(Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost));
    }
    prev = cur;
  }
  return prev[b.length];
}
