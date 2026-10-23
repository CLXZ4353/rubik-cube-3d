// localStorage facade. Everything the site remembers lives here, under one
// namespace, so /settings can show, export and wipe it without touching
// anything else. Node (tests) has no localStorage, so an in-memory map stands
// in — the logic under test is the same.

const NS = 'cube3d:';

const mem = new Map(); // node fallback when there is no localStorage

function binding() {
  const ls = globalThis.localStorage;
  if (ls && typeof ls.getItem === 'function') return ls;
  return {
    getItem: (k) => (mem.get(k) ?? null),
    setItem: (k, v) => {
      if (v === null || v === undefined) mem.delete(k);
      else mem.set(k, v);
    },
    removeItem: (k) => mem.delete(k),
  };
}

const ls = binding();

export function get(key, fallback = null) {
  const raw = ls.getItem(NS + key);
  if (raw === null || raw === undefined) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function set(key, value) {
  ls.setItem(NS + key, JSON.stringify(value));
  return value;
}

export function remove(key) {
  ls.removeItem(NS + key);
}

export function keys() {
  const out = [];
  const real = globalThis.localStorage;
  if (real && typeof real.key === 'function' && typeof real.length === 'number') {
    for (let i = 0; i < real.length; i++) {
      const k = real.key(i);
      if (k && k.startsWith(NS)) out.push(k.slice(NS.length));
    }
    return out.sort();
  }
  for (const k of mem.keys()) out.push(String(k).slice(NS.length));
  return out.sort();
}

/** Everything under the namespace, for the export button. */
export function exportAll() {
  const out = {};
  for (const k of keys()) out[k] = get(k);
  return { app: 'rubik-cube-3d', version: 1, exported: Date.now(), data: out };
}

/** Feed an object produced by exportAll back in. Returns how many keys landed. */
export function importAll(payload) {
  const data = payload?.data ?? payload;
  let n = 0;
  if (data && typeof data === 'object') {
    for (const k of Object.keys(data)) {
      if (data[k] === null || data[k] === undefined) continue;
      set(k, data[k]);
      n++;
    }
  }
  return n;
}

export function clearAll() {
  for (const k of keys()) remove(k);
}
