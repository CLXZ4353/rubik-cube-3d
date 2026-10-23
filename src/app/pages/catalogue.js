// /a/:puzzle (set index) and /a/:puzzle/:set (the case list).
//
// The set page is the database: filter by group, pick the colour you hold the
// cube in, and see one card per case. The learnt/bookmark state is the same
// local sheet the trainers write, so a card here reflects drills immediately.

import { el, link } from '../dom.js';
import { getSet, listSets } from '../../algdb/dataset.js';
import { get } from '../store.js';
import { netSvg } from '../../render/net2d.js';
import { rotateStickerString } from '../../render/stickerString.js';
import { parseNotation } from '../../moves.js';
import { cycle, bookmark, LEARN_STATES } from './algsheet.js';

const COLOURS = ['white', 'yellow', 'green', 'blue', 'red', 'orange'];
const KIND_LABEL = { OLL: 'orientation', PLL: 'permutation' };

function queryLink(base, params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

function setProgress(puzzle, setName, data) {
  const sheet = get(`sheet:${puzzle}/${setName}`, {});
  let learnt = 0;
  for (const c of data.cases) if ((sheet[c.id] ?? 0) === 2) learnt++;
  return learnt;
}

export async function renderSets(container, route) {
  const only = route.params.puzzle;

  const intro = el('p', 'muted');
  intro.textContent = only
    ? `Algorithm sets for ${only}. Everything here is checked against the cube engine before it ships.`
    : 'The full 3×3 last-layer database. Pick a set, then filter by shape or by the colour you hold on the bottom.';
  container.appendChild(intro);

  const puzzles = only ? (only === '3x3' ? ['3x3'] : []) : ['3x3'];
  let rendered = 0;

  for (const puzzle of puzzles) {
    const sets = await listSets(puzzle);
    if (!sets.length) continue;
    rendered++;
    if (!only) container.appendChild(el('h2', 'section-title', puzzle));

    const grid = el('div', 'set-grid');
    for (const setName of sets) {
      const data = await getSet(puzzle, setName);
      if (!data) continue;
      const learnt = setProgress(puzzle, setName, data);
      const card = link(`/a/${puzzle}/${setName}`, 'set-card');
      const head = el('div', 'set-card-head');
      const left = el('div');
      left.appendChild(el('span', 'set-badge', KIND_LABEL[data.kind] ?? data.kind ?? 'set'));
      left.appendChild(el('div', 'set-count', `${data.count} cases`));
      head.appendChild(left);
      head.appendChild(el('span', 'tile-arrow', '→'));
      card.appendChild(head);

      const desc = el('p');
      desc.textContent = setName === 'OLL'
        ? 'Orient the last layer. Groups run from the dot shapes to the corner-twist cases.'
        : setName === 'PLL'
          ? 'Permute the last layer. The 21 named cases, from Aa to Z.'
          : `${puzzle} ${setName} algorithms.`;
      card.appendChild(desc);

      const groups = el('div', 'set-groups');
      for (const g of (data.groups ?? []).slice(0, 5)) {
        const n = data.cases.filter((c) => c.group === g).length;
        groups.appendChild(el('span', null, `${g} · ${n}`));
      }
      if ((data.groups ?? []).length > 5) groups.appendChild(el('span', null, `+${data.groups.length - 5} more`));
      card.appendChild(groups);

      if (data.crossOrientations) {
        const p = el('p');
        p.style.marginTop = '10px';
        p.textContent = `${learnt} / ${data.count} marked learnt · six cross colours`;
        card.appendChild(p);
      }
      grid.appendChild(card);
    }
    container.appendChild(grid);
  }

  if (!rendered) {
    const empty = el('div', 'empty');
    empty.appendChild(el('h3', null, `No ${only ?? ''} sets yet`));
    empty.appendChild(el('p', null, 'Only the 3×3 OLL and PLL sets are complete. Use the 3×3 database for now.'));
    empty.appendChild(link('/a/3x3', 'btn btn-ghost', 'Open 3×3'));
    container.appendChild(empty);
  }

  if (!only) {
    const note = el('p', 'faint');
    note.style.marginTop = '22px';
    note.textContent = '2×2, 4×4 and 5×5 are planned; the 3×3 sets are complete and validated.';
    container.appendChild(note);
  }
  return container;
}

function cardFor(puzzle, setName, cs, colour, data) {
  const sheetKey = `sheet:${puzzle}/${setName}`;
  let sheet = get(sheetKey, {});
  const a = link(`/a/${puzzle}/${setName}/${cs.id}`, 'case-card');

  const preview = el('div', 'case-preview');
  let stickers = cs.stickers;
  const rot = colour && data.crossOrientations?.[colour];
  if (rot) {
    try { stickers = rotateStickerString(cs.stickers, parseNotation(rot), 3); } catch { /* keep the default */ }
  }
  preview.innerHTML = netSvg(stickers, 3, 7);
  a.appendChild(preview);

  a.appendChild(el('span', 'case-name', cs.name ?? cs.id));
  a.appendChild(el('span', 'case-group', cs.group));
  a.appendChild(el('span', 'case-alg', cs.algs[0].seq));

  const badges = el('span', 'case-badges');
  const learn = el('span', `badge-pill${(sheet[cs.id] ?? 0) === 2 ? ' good' : (sheet[cs.id] ?? 0) === 1 ? ' learning' : ''}`);
  learn.textContent = LEARN_STATES[sheet[cs.id] ?? 0];
  badges.appendChild(learn);
  if (sheet[`#${cs.id}`]) badges.appendChild(el('span', 'badge-pill star', '★ saved'));
  badges.appendChild(el('span', 'badge-pill', `${cs.algs[0].htm} moves`));
  a.appendChild(badges);

  // The toggle lives inside the link: stop the navigation, then update the
  // badge in place so the grid does not re-render under the pointer.
  const toggle = el('button', 'learn-toggle');
  toggle.type = 'button';
  toggle.textContent = 'Learnt?';
  toggle.title = 'Cycle: not learnt → learning → learnt';
  toggle.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    sheet = cycle(puzzle, setName, cs.id);
    const state = sheet[cs.id] ?? 0;
    learn.textContent = LEARN_STATES[state];
    learn.className = `badge-pill${state === 2 ? ' good' : state === 1 ? ' learning' : ''}`;
  });
  const star = el('button', 'learn-toggle', '★');
  star.type = 'button';
  star.title = 'Bookmark this case';
  star.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    sheet = bookmark(puzzle, setName, cs.id);
    const has = Boolean(sheet[`#${cs.id}`]);
    star.classList.toggle('on', has);
  });
  star.classList.toggle('on', Boolean(sheet[`#${cs.id}`]));
  const actions = el('span', 'case-actions');
  actions.appendChild(toggle);
  actions.appendChild(star);
  a.appendChild(actions);

  return a;
}

export async function renderCases(container, route) {
  const puzzle = route.params.puzzle ?? '3x3';
  const setName = route.params.set;
  const data = await getSet(puzzle, setName);
  if (!data) {
    const empty = el('div', 'empty');
    empty.appendChild(el('h3', null, `No set ${puzzle} ${setName}`));
    empty.appendChild(el('p', null, 'That set is not in the database yet.'));
    empty.appendChild(link(`/a/${puzzle}`, 'btn btn-ghost', `Back to ${puzzle}`));
    container.appendChild(empty);
    return container;
  }

  const group = route.query.group ?? '';
  const colour = route.query.colour ?? '';
  const q = (route.query.q ?? '').trim().toLowerCase();
  const base = `/a/${puzzle}/${setName}`;
  const searchTerm = route.query.q ?? '';

  const toolbar = el('div', 'toolbar');

  const groupWrap = el('div', 'filters');
  groupWrap.appendChild(el('span', 'toolbar-label', 'Group'));
  const all = link(queryLink(base, { colour, q: searchTerm }), 'filter-chip');
  all.textContent = `All ${data.count}`;
  if (!group) all.classList.add('active');
  groupWrap.appendChild(all);
  for (const g of data.groups ?? []) {
    const n = data.cases.filter((c) => c.group === g).length;
    const chip = link(queryLink(base, { group: g, colour, q: searchTerm }), 'filter-chip');
    chip.textContent = `${g} `;
    chip.appendChild(el('span', 'n', String(n)));
    if (group === g) chip.classList.add('active');
    groupWrap.appendChild(chip);
  }
  toolbar.appendChild(groupWrap);

  if (data.crossOrientations) {
    const crossWrap = el('div', 'cross-select');
    crossWrap.appendChild(el('span', 'toolbar-label', 'Hold'));
    for (const c of COLOURS) {
      if (!data.crossOrientations[c]) continue;
      const a = link(queryLink(base, { group, colour: c === colour ? '' : c, q: searchTerm }), 'cross-choice');
      a.setAttribute('aria-pressed', String(c === colour));
      const dot = el('span', 'cross-dot');
      dot.style.background = c;
      a.appendChild(dot);
      a.appendChild(el('span', null, c));
      crossWrap.appendChild(a);
    }
    toolbar.appendChild(crossWrap);
  }

  const form = el('form', 'search-form');
  form.setAttribute('role', 'search');
  const input = el('input', 'search-input');
  input.type = 'search';
  input.name = 'q';
  input.value = route.query.q ?? '';
  input.placeholder = 'Filter by name or algorithm…';
  input.setAttribute('aria-label', `Filter ${setName} cases`);
  const submit = el('button', 'filter-chip', 'Filter');
  submit.type = 'submit';
  form.appendChild(input);
  form.appendChild(submit);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const url = new URL(queryLink(base, { group, colour, q: input.value.trim() }), location.origin);
    globalThis.history?.pushState({}, '', url);
    globalThis.dispatchEvent(new PopStateEvent('popstate'));
  });
  toolbar.appendChild(form);
  container.appendChild(toolbar);

  let fields = data.cases;
  if (group) fields = fields.filter((c) => c.group === group);
  if (q) {
    fields = fields.filter((c) =>
      `${c.name ?? ''} ${c.id} ${c.group} ${c.algs.map((a) => a.seq).join(' ')}`.toLowerCase().includes(q));
  }

  const count = el('p', 'faint');
  count.textContent = `${fields.length} of ${data.count} cases${group ? ` · ${group}` : ''}${colour ? ` · ${colour} cross` : ''}${q ? ` · “${q}”` : ''}`;
  container.appendChild(count);

  const grid = el('div', 'case-grid');
  for (const cs of fields) grid.appendChild(cardFor(puzzle, setName, cs, colour, data));
  container.appendChild(grid);

  if (!fields.length) {
    const empty = el('div', 'empty');
    empty.appendChild(el('h3', null, 'No cases match'));
    empty.appendChild(link(base, 'btn btn-ghost', 'Clear filters'));
    container.appendChild(empty);
  }

  return container;
}
