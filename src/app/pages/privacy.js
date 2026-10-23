// /privacy — what the site does with data. This is the whole truth: there is no
// analytics, no ads, no cookie banner, and no server-side state.

import { el, link } from '../dom.js';
import { keys, exportAll } from '../store.js';

export const WHERE = [
  ['Theme choice', 'localStorage', 'cube3d:theme'],
  ['Trainer sessions (times per case)', 'localStorage', 'cube3d:session:<set>'],
  ['Progress badges (cases drilled)', 'localStorage', 'cube3d:progress:<set>'],
  ['Recognition history (seen / right)', 'localStorage', 'cube3d:recog:<set>'],
  ['Learnt / bookmarked cases', 'localStorage', 'cube3d:sheet:<set>'],
  ['Preferences (cross colour, difficulty)', 'localStorage', 'cube3d:prefs'],
  ['Cube moves and the undo stack', 'memory only (never stored)', ''],
  ['Scrambles typed into the Analyzer', 'memory only (never stored)', ''],
];

export async function render(container, route) {
  const intro = el('p');
  intro.textContent =
    'Nothing is collected about you. There is no analytics script, no advertising, ' +
    'no tracking pixel and no cookie. The site does not sign you in, so there is no account ' +
    'to leak. The pages are static files: the server never sees which page you opened ' +
    'after the first request, and it keeps no record of your visits.';
  container.appendChild(intro);

  const table = el('table', 'where-table');
  const thead = el('thead');
  for (const t of ['What', 'Where it lives', 'Key']) {
    thead.appendChild(el('th', null, t));
  }
  table.appendChild(thead);
  for (const row of WHERE) {
    const tr = el('tr');
    for (const cell of row) tr.appendChild(el('td', null, cell || '—'));
    table.appendChild(tr);
  }
  container.appendChild(table);

  container.appendChild(el('p', 'muted', 'Everything above is readable on your own device: you can see it, overwrite it or wipe it.'));

  const own = keys();
  const local = el('div');
  local.appendChild(el('h3', null, `Keys on this device · ${own.length}`));
  const list = el('ul', 'own-data');
  if (!own.length) list.appendChild(el('li', 'muted', 'Nothing stored yet.'));
  for (const k of own) list.appendChild(el('li', null, k));
  local.appendChild(list);
  container.appendChild(local);

  const actions = el('div', 'privacy-actions row');
  const download = el('button', 'btn btn-ghost', 'Download my data (JSON)');
  download.type = 'button';
  download.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = 'cubedb-data.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  actions.appendChild(download);
  actions.appendChild(link('/settings', 'btn btn-ghost', 'Import or erase data'));
  container.appendChild(actions);

  return container;
}
