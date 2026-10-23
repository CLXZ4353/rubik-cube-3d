// Case drawing for the trainers: a seeded pick so a deep link (or a replay)
// gives the same sequence, and practised cases stay out of the draw until
// every case had a go, which is what keeps a session from hammering one case.

import { get, set } from '../app/store.js';

/** Deterministic 32-bit hash -> float in [0,1). Same seed, same order. */
export function rngFor(seed) {
  let s = hashSeed(seed);
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

function hashSeed(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = (h ^ ch.charCodeAt(0)) * 16777619 & 0xffffffff;
  return h || 1;
}

/** Cases a session already drilled, from the store (namespace: session key). */
export function practised(sessionKey) {
  const rows = get(sessionKey, []);
  const seen = new Map();
  for (const r of rows) seen.set(r.case, (seen.get(r.case) ?? 0) + 1);
  return seen;
}

/** Pick the next case, avoiding ones already seen at least `minEach` times. */
export function pick(cases, sessionKey, seed, minEach = 1) {
  const ids = new Set(cases.map((c) => c.id));
  const counts = new Map();
  for (const [id, n] of practised(sessionKey)) if (ids.has(id)) counts.set(id, n);
  const floor = Math.min(...cases.map((c) => counts.get(c.id) ?? 0));
  const pool = cases.filter((c) => (counts.get(c.id) ?? 0) <= floor);
  const rng = rngFor(seed);
  return pool.length ? pool[Math.floor(rng() * pool.length)] : cases[Math.floor(rng() * cases.length)];
}

/** Record one attempt (case id + milliseconds). */
export function record(sessionKey, caseId, ms) {
  const rows = get(sessionKey, []);
  rows.push({ case: caseId, ms: ms, at: Date.now() });
  return set(sessionKey, rows.slice(-500)); // last 500 attempts per session
}
