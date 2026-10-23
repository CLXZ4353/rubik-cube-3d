// /algsheet — the personal sheet. On the original this is server-side per
// account; here it is the same three states (unknown / learnt / bookmarked)
// kept in localStorage, so nothing leaves the device and the privacy page can
// say so truthfully.

import { el, link } from '../dom.js';
import { get, set } from '../store.js';
import { getSet, listSets } from '../../algdb/dataset.js';

export const LEARN_STATES = ['not learnt', 'learning', 'learnt'];

export async function render(container, route) {
  const puzzle = route.query.puzzle ?? '3x3';
  const onlyStarred = route.query.starred === '1';
  const sets = await listSets(puzzle);
  if (!sets.length) {
    container.appendChild(el('p', 'empty', `No sets for ${puzzle} yet.`));
    return container;
  }

  let totalLearnt = 0;
  let totalCases = 0;

  for (const setName of sets) {
    const data = await getSet(puzzle, setName);
    if (!data) continue;
    const key = `sheet:${puzzle}/${setName}`;
    const sheet = get(key, {});
    const group = el('div', 'sheet-set');
    const head = el('div', 'section-head');
    head.appendChild(el('h2', 'section-title', `${puzzle} ${setName}`));
    head.appendChild(link(`/a/${puzzle}/${setName}`, 'section-link', 'Open the set →'));
    group.appendChild(head);

    const counts = [0, 0, 0];
    let shown = 0;
    for (const c of data.cases) {
      const state = sheet[c.id] ?? 0;
      const starred = Boolean(sheet[`#${c.id}`]);
      counts[state]++;
      totalCases++;
      if (state === 2) totalLearnt++;
      if (onlyStarred && !starred) continue;
      shown++;

      const row = el('div', 'sheet-case');
      const left = el('div', 'row');
      left.appendChild(link(`/a/${puzzle}/${setName}/${c.id}`, null, c.name ?? c.id));
      left.appendChild(el('span', `badge-pill${state === 2 ? ' good' : state === 1 ? ' learning' : ''}`, LEARN_STATES[state]));
      if (starred) left.appendChild(el('span', 'badge-pill star', '★'));
      row.appendChild(left);

      const actions = el('div', 'row');
      const cycleBtn = el('button', 'filter-chip', 'cycle');
      cycleBtn.type = 'button';
      cycleBtn.addEventListener('click', () => {
        container.textContent = '';
        cycle(puzzle, setName, c.id);
        void render(container, route);
      });
      const starBtn = el('button', 'filter-chip', starred ? '★' : '☆');
      starBtn.type = 'button';
      starBtn.addEventListener('click', () => {
        container.textContent = '';
        bookmark(puzzle, setName, c.id);
        void render(container, route);
      });
      actions.appendChild(cycleBtn);
      actions.appendChild(starBtn);
      row.appendChild(actions);
      group.appendChild(row);
    }

    if (onlyStarred && !shown) {
      group.appendChild(el('p', 'muted', 'Nothing bookmarked in this set.'));
    }
    const legend = el('div', 'sheet-legend');
    legend.textContent = `learnt ${counts[2]} · learning ${counts[1]} · not learnt ${counts[0]}${onlyStarred ? ' · showing bookmarks only' : ''}`;
    group.appendChild(legend);
    container.appendChild(group);
  }

  const summary = el('p', 'faint');
  summary.textContent = `${totalLearnt} of ${totalCases} cases marked learnt across ${sets.length} sets.`;
  container.appendChild(summary);

  const toggle = el('p');
  toggle.appendChild(link(onlyStarred ? '/algsheet' : '/algsheet?starred=1', 'btn btn-ghost', onlyStarred ? 'Show everything' : 'Show bookmarks only'));
  container.appendChild(toggle);
  return container;
}

/** Flip one case's learnt state (the widget the original puts on a card). */
export function cycle(puzzle, setName, caseId) {
  const key = `sheet:${puzzle}/${setName}`;
  const sheet = get(key, {});
  sheet[caseId] = ((sheet[caseId] ?? 0) + 1) % 3;
  return set(key, sheet);
}

/** Star or unstar a case. */
export function bookmark(puzzle, setName, caseId) {
  const key = `sheet:${puzzle}/${setName}`;
  const sheet = get(key, {});
  const flag = `#${caseId}`;
  if (sheet[flag]) delete sheet[flag];
  else sheet[flag] = true;
  return set(key, sheet);
}
