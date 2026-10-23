// Route -> page module, loaded on demand. A page module is only imported when
// its route is the one being shown, which is what keeps Three.js off /t, /cross
// and the case pages. import() is async, so every loader returns a promise.

import { resolve } from './router.js';

/** Static table so tests (and the search index) can see the shape. */
export const PAGES = {
  home: { module: './pages/home.js', entry: 'render' },
  trainer: { module: './pages/trainer.js', entry: 'render' },
  pllrecog: { module: './pages/pllTrainer.js', entry: 'render' },
  cross: { module: './pages/crossTrainer.js', entry: 'render' },
  analyze: { module: './pages/analyzer.js', entry: 'render' },
  sets: { module: './pages/catalogue.js', entry: 'renderSets' },
  cases: { module: './pages/catalogue.js', entry: 'renderCases' },
  case: { module: './pages/caseCard.js', entry: 'render' },
  beginner: { module: './pages/beginner.js', entry: 'render' },
  algsheet: { module: './pages/algsheet.js', entry: 'render' },
  settings: { module: './pages/settings.js', entry: 'render' },
  privacy: { module: './pages/privacy.js', entry: 'render' },
  notfound: { module: './pages/notfound.js', entry: 'render' },
  cube3d: { module: './pages/cubeView.js', entry: 'render' },
};

export function pageName(pathname) {
  return resolve(pathname).page;
}

/** Load the module for one page and hand back its entry function. */
export async function load(page) {
  const spec = PAGES[page] ?? PAGES.notfound;
  const mod = await import(spec.module);
  const entry = mod[spec.entry];
  if (typeof entry !== 'function') throw new Error(`${spec.module} has no ${spec.entry}()`);
  return entry;
}
