// Datasets: one lazy loader with a per-puzzle index, so a page never pulls more
// than the set it is showing. In the browser the files sit next to the app
// (data/algdb/<puzzle>/<set>.json, served no-cache); under node they are read
// from disk so the tools and tests can use the same entry point.

import { resolve } from '../app/router.js';

const cache = new Map();
const inNode = typeof globalThis.process === 'object';
// node:fs must not be a static import: the browser would try to fetch it as a
// module. It is pulled in only when the code is actually running in node.
let readdir = null;
let readFile = null;
if (inNode) { const fsmod = await import('node:fs/promises'); readdir = fsmod.readdir; readFile = fsmod.readFile; }

export async function fetchJson(path) {
  if (!inNode) {
    const res = await fetch(path);
    return res.ok ? await res.json() : null;
  }
  try {
    return JSON.parse(await readFile(`${process.cwd()}/${String(path).replace(/^\/+/, '')}`, 'utf8'));
  } catch {
    return null;
  }
}

/** Names of the sets available for a puzzle, e.g. ['OLL','PLL']. */
export async function listSets(puzzle = '3x3') {
  const key = `sets:${puzzle}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let out;
  if (inNode) {
    out = await listFromDisk(puzzle);
  } else {
    const idx = await fetchJson(`/data/algdb/${puzzle}/index.json`);
    out = idx ? idx.sets : [];
  }
  cache.set(key, out);
  return out;
}

async function listFromDisk(puzzle) {
  try {
    const names = await readdir(`${process.cwd()}/data/algdb/${puzzle}`);
    return names.filter((n) => n.endsWith('.json') && n !== 'index.json').map((n) => n.slice(0, -5)).sort();
  } catch {
    return [];
  }
}

/** A whole set: { id, name, puzzle, kind, cases: [...] }. */
export async function getSet(puzzle = '3x3', set = 'OLL') {
  const key = `${puzzle}/${set}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const data = await fetchJson(`/data/algdb/${puzzle}/${set}.json`);
  if (data) cache.set(key, data);
  return data;
}

/** One case, without loading the rest of the set's algorithms. */
export async function getCase(puzzle, set, caseId) {
  const data = await getSet(puzzle, set);
  if (!data) return null;
  return data.cases.find((x) => x.id === caseId);
}

/** Where the router thinks the dataset lives (used by the pages). */
export function datasetPath(route) {
  const r = typeof route === 'string' ? resolve(route) : route;
  if (!r.params.puzzle) return null;
  return `/data/algdb/${r.params.puzzle}/${r.params.set ?? ''}.json`;
}
