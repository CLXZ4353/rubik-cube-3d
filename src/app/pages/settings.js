// /settings — the local switches, and the export/import buttons the privacy
// page promises. Nothing here talks to a server.

import { el } from '../dom.js';
import { THEMES, themeValue, setTheme, applyTheme } from '../shell.js';
import { get, exportAll, importAll, clearAll, keys } from '../store.js';

const PREF_KEYS = [
  ['theme', 'Dark or light'],
  ['cross', 'Cross colour used by the trainers'],
  ['difficulty', 'Cross Trainer difficulty (1–7)'],
  ['prefs', 'Free-form preferences'],
];

export function render(container, route) {
  const themeCard = el('section', 'side-card');
  themeCard.appendChild(el('h3', null, 'Theme'));
  const current = themeValue();
  const choices = el('div', 'row');
  for (const theme of THEMES) {
    const btn = el('button', `btn${theme === current ? ' btn-primary' : ' btn-ghost'}`, theme);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      setTheme(theme);
      applyTheme();
      for (const b of choices.children) b.classList.toggle('btn-primary', b.textContent === theme);
      for (const b of choices.children) b.classList.toggle('btn-ghost', b.textContent !== theme);
      badge.textContent = `active theme: ${theme}`;
      refreshData();
    });
    choices.appendChild(btn);
  }
  themeCard.appendChild(choices);
  const badge = el('div', 'theme-badge', `active theme: ${current}`);
  themeCard.appendChild(badge);
  container.appendChild(themeCard);

  const prefCard = el('section', 'side-card');
  prefCard.appendChild(el('h3', null, 'Preferences'));
  const prefValues = new Map();
  for (const [key, label] of PREF_KEYS) {
    const row = el('div', 'pref-row');
    row.appendChild(el('span', null, label));
    const value = el('b', null, get(key) ?? 'default');
    prefValues.set(key, value);
    row.appendChild(value);
    prefCard.appendChild(row);
  }
  container.appendChild(prefCard);

  const dataCard = el('section', 'side-card');
  dataCard.appendChild(el('h3', null, 'Your data'));
  const dataCount = el('p', 'muted');
  dataCard.appendChild(dataCount);

  const download = el('button', 'btn btn-ghost', 'Export my data');
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
  dataCard.appendChild(download);

  const imp = el('div', 'import');
  imp.appendChild(el('p', 'muted', 'Paste an exported JSON file below and press Import.'));
  const field = el('textarea');
  field.name = 'import-json';
  field.placeholder = '{ "data": { "theme": "light" } }';
  const go = el('button', 'btn btn-ghost', 'Import');
  go.type = 'button';
  const result = el('p', 'faint');
  go.addEventListener('click', () => {
    try {
      const n = importAll(JSON.parse(field.value ?? ''));
      result.textContent = `Imported ${n} keys.`;
      refreshData();
    } catch (err) {
      result.textContent = `Import failed: ${err?.message ?? err}`;
    }
  });
  imp.appendChild(field);
  const row = el('div', 'row');
  row.appendChild(go);
  row.appendChild(result);
  imp.appendChild(row);
  dataCard.appendChild(imp);

  const wipe = el('button', 'btn wipe', 'Erase everything you stored');
  wipe.type = 'button';
  wipe.addEventListener('click', () => {
    if (globalThis.confirm && !globalThis.confirm('Erase all local CubeDB data?')) return;
    clearAll();
    result.textContent = 'Everything was wiped. Reload to start from the defaults.';
    refreshData();
  });
  dataCard.appendChild(wipe);
  container.appendChild(dataCard);

  function refreshData() {
    dataCount.textContent = `${keys().length} keys stored locally. Nothing leaves this browser.`;
    for (const [key, value] of prefValues) value.textContent = get(key) ?? 'default';
  }
  refreshData();

  return container;
}
