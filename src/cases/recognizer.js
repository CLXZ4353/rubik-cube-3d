// Recognition: a state goes in, a case id comes out. The table is generated
// once by tools/gen_case_keys.mjs (data/cases/keys/<set>.json) and is a plain
// hash -> case-id map, so a lookup is one string compare.

import { ollKey, pllKey } from './hash.js';
import { stateToStickerString } from '../render/stickerString.js';
import { fetchJson } from '../algdb/dataset.js';

export const KIND_HASH = {
  OLL: ollKey,
  PLL: pllKey,
};

export function hash(state, kind) {
  const fn = KIND_HASH[kind];
  if (fn) return fn(state);
  return stateToStickerString(state); // anything else: the whole cube must match
}

/** Load (and cache) the key table for a set. */
export async function keys(puzzle, set) {
  const key = `keys:${puzzle}/${set}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const table = await fetchJson(`/data/cases/keys/${set}.json`);
  if (!table) return null;
  const map = new Map(Object.entries(table.keys));
  const out = { kind: table.kind ?? set, map };
  cache.set(key, out);
  return out;
}

const cache = new Map();

/** Case id for a state, or null when the state is not one of the set's cases. */
export async function recognize(state, puzzle = '3x3', set = 'OLL') {
  const table = await keys(puzzle, set);
  if (!table) return null;
  return table.map.get(hash(state, table.kind)) ?? null;
}

/** Every case of the set that could look like this state (for hints). */
export async function candidates(state, puzzle = '3x3', set = 'OLL') {
  const id = await recognize(state, puzzle, set);
  return id ? [id] : [];
}

/** Timing helper for the acceptance check (<5 ms per lookup). */
export async function bench(state, puzzle, set, n = 200) {
  const table = await keys(puzzle, set);
  if (!table) return null;
  const fn = KIND_HASH[table.kind] ?? null;
  const then = nowMs();
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const k = fn ? fn(state) : stateToStickerString(state);
    if (table.map.get(k)) hits++;
  }
  return { perLookupMs: (nowMs() - then) / n, hits };
}

function nowMs() {
  return Number(new Date());
}
