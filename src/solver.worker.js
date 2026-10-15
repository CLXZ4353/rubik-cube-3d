// Browser Web Worker: builds (or fetches pre-computed) PDB tables and runs IDA*.
//
// Messages main → worker:
//   { type: 'solve', cubies, maxTimeMs, cancel: SharedArrayBuffer? }
//
// Messages worker → main:
//   { type: 'build', label, pct }         PDB build progress (also shown during fetch)
//   { type: 'ready', buildMs }            PDB tables are ready; solver is now enabled
//   { type: 'progress', bound, nodes, time, iter }  IDA* live progress
//   { type: 'solved', moves, time, nodes, optimal }
//   { type: 'error', error }
//
// Cancellation is via SharedArrayBuffer: main writes cancel[0]=1 when the user
// clicks Cancel; the worker reads cancelRef[0] inside the DFS every ~131K nodes.
// (Web Worker onmessage cannot interrupt a tight synchronous loop, but SAB
// memory CAN be shared cross-thread.)

import { buildPDBs, solveCube, tablesVersion, fnvBytes } from './Solver.js';
import { CubeState } from './CubeState.js';
import { ALL_MOVES_FULL } from './moves.js';

function post(payload) { try { self.postMessage(payload); } catch {} }

async function load() {
  const t0 = Date.now();
  const v = tablesVersion(); // fingerprint of the tables this code would build
  let pre;
  let why = 'fetched';
  try {
    post({ type: 'build', label: 'Checking pre-computed tables', pct: 0 });
    const metaResp = await fetch('/data/pdb_meta.json'); // never cached long: it carries v
    const meta = metaResp.ok ? JSON.parse(await metaResp.text()) : null;
    // One fetch per file, all-or-nothing per file: a file whose stamped v is not
    // this code's v, or whose bytes do not hash to the manifest value, is dropped
    // (buildPDBs then rebuilds it locally) rather than pruning with wrong values.
    const fetchBuf = async (name) => {
      const want = meta && meta.files && meta.files[name];
      if (!want || want.v !== v) return null;
      // ?v= busts the browser cache when the tables change; /data/*.pdb is served
      // with an immutable max-age, so only this URL has to change.
      const r = await fetch('/data/' + name + '?v=' + encodeURIComponent(v));
      if (!r.ok) return null;
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length !== want.size) return null;
      if (fnvBytes(buf) !== want.hash) {
        post({ type: 'build', label: name + ' did not match its manifest hash: rebuilt', pct: 0 });
        return null;
      }
      return buf;
    };
    // Required: the exact joint corner-class x edge-permutation PDB (111 MB).
    const JCE = await fetchBuf('jointCE.pdb');
    const JQSY = await fetchBuf('jointCE_qsym.pdb');
    if (!JCE || !JQSY) throw new Error('jointCE tables missing or stale for this code');
    post({ type: 'build', label: 'Fetched jointCE PDB', pct: 20 });
    // Optional but strongly recommended: phase-1 pairwise PDBs + phase-2 slices.
    const cs = await fetchBuf('cornslice.pdb');
    const es = await fetchBuf('es.pdb');
    const p1 = {
      co_eo: await fetchBuf('p1_co_eo.pdb'),
      co_ud: await fetchBuf('p1_co_ud.pdb'),
      eo_ud: await fetchBuf('p1_eo_ud.pdb'),
    };
    post({ type: 'build', label: 'Fetched all tables', pct: 90 });
    pre = { JCE, JQSY, CS: cs, ES: es, p1 };
  } catch (err) {
    why = 'rebuilt'; // no usable jointCE -> weaker heuristic, slower solves
    post({ type: 'build', label: 'jointCE table missing or stale: solving with weaker heuristic (slower)', pct: 0 });
    pre = undefined;
  }
  buildPDBs((p) => post({ type: 'build', ...p }), pre);
  ready = true;
  // 'fetched' vs 'rebuilt' is shown to the user: a slow start-up is only slow
  // because the pre-computed tables were rejected (missing or stale).
  post({ type: 'ready', buildMs: Date.now() - t0, tables: why });
}

let ready = false;
load().catch((err) => post({ type: 'error', error: (err && (err.message || String(err))) || 'load failed' }));

self.onmessage = (e) => {
  const d = e.data;
  if (d.type !== 'solve') return;
  if (!ready) { post({ type: 'error', error: 'solver not ready' }); return; }

  let cancelRef;
  if (d.cancel && d.cancel.byteLength === 4) {
    cancelRef = new Int32Array(d.cancel);
  } else {
    cancelRef = new Int32Array(1);
  }

  const res = solveCube(new CubeState(d.cubies), {
    maxTimeMs: d.maxTimeMs || 0,
    cancelRef,
    onProgress: (info) => post({ type: 'progress', ...info }),
  });

  if ('error' in res) { post({ type: 'error', error: String(res.error) }); return; }
  post({ type: 'solved', moves: res.moves, time: res.time, nodes: res.nodes, optimal: res.optimal });
};
