// Precompute two-phase tables into data/:
//   p1_co_eo.pdb (2187*2048 B), p1_co_ud.pdb (2187*495 B), p1_eo_ud.pdb (2048*495 B)
//   cornslice.pdb (40320*24 B), es.pdb (40320*24 B)
// (jointCE.pdb + jointCE_qsym.pdb are produced by tests/pregen_jointCE.mjs)
import { buildPDBs, getPDBS } from '../src/Solver.js';
import { writeFileSync } from 'node:fs';
import { updateManifest } from './pdb_manifest.mjs';
const t0 = Date.now();
const P = buildPDBs((m) => console.log('[' + m.label + '] ' + m.pct + '%'), null);
const put = (name, arr) => { writeFileSync('data/' + name, arr); console.log(name + ':', arr.length, 'bytes'); };
put('p1_co_eo.pdb', P.P1.co_eo.dist);
put('p1_co_ud.pdb', P.P1.co_ud.dist);
put('p1_eo_ud.pdb', P.P1.eo_ud.dist);
put('cornslice.pdb', P.CS);
put('es.pdb', P.ES);
updateManifest(['p1_co_eo.pdb', 'p1_co_ud.pdb', 'p1_eo_ud.pdb', 'cornslice.pdb', 'es.pdb']);
console.log('total', Date.now() - t0, 'ms');
