// Home: the entry point. It links to the things that actually exist — the two
// algorithm sets, the trainers, the analyzer and the 3D cube — and shows a few
// real cases. It never mounts Three.js; the cube lives on /3d only.

import { el, link } from '../dom.js';
import { buildIndex, lookup } from '../search.js';
import { listSets, getSet } from '../../algdb/dataset.js';
import { netSvg } from '../../render/net2d.js';

const FEATURED = [
  ['3x3', 'OLL', 'OLL 21'],
  ['3x3', 'OLL', 'OLL 27'],
  ['3x3', 'OLL', 'OLL 45'],
  ['3x3', 'OLL', 'OLL 57'],
  ['3x3', 'PLL', 'PLL_16'],
  ['3x3', 'PLL', 'PLL_20'],
  ['3x3', 'PLL', 'PLL_9'],
  ['3x3', 'PLL', 'PLL_1'],
];

function icon(text) {
  return el('span', 'tile-icon', text);
}

function tile({ href, iconText, title, desc, meta = [], disabled = false }) {
  const node = href && !disabled ? link(href, 'tile') : el('div', `tile${disabled ? ' tile-disabled' : ''}`);
  node.appendChild(icon(iconText));
  node.appendChild(el('span', 'tile-title', title));
  node.appendChild(el('span', 'tile-desc', desc));
  if (meta.length) {
    const m = el('span', 'tile-meta');
    for (const item of meta) m.appendChild(el('span', null, item));
    node.appendChild(m);
  }
  if (href && !disabled) node.appendChild(el('span', 'tile-arrow', '→'));
  return node;
}

function section(title, moreHref, moreText) {
  const head = el('div', 'section-head');
  head.appendChild(el('h2', 'section-title', title));
  if (moreHref) head.appendChild(link(moreHref, 'section-link', moreText ?? 'See all →'));
  return head;
}

export async function render(container, route) {
  const sets = await listSets('3x3');
  const oll = sets.includes('OLL') ? await getSet('3x3', 'OLL') : null;
  const pll = sets.includes('PLL') ? await getSet('3x3', 'PLL') : null;

  // ---- hero ---------------------------------------------------------------
  const hero = el('section', 'hero');
  const copy = el('div', 'hero-copy');
  copy.appendChild(el('span', 'eyebrow', 'Free · no account · offline-friendly'));
  const title = el('h2', 'hero-title');
  title.innerHTML = 'Learn the last layer, <em>not just the algorithms</em>.';
  copy.appendChild(title);
  copy.appendChild(el('p', 'hero-lede', 'Every OLL and PLL case with the algorithms people actually use, a trainer that keeps score locally, and a two-sided recognition drill.'));

  const actions = el('div', 'hero-actions');
  actions.appendChild(link('/t', 'btn btn-primary', 'Start training'));
  actions.appendChild(link('/a/3x3', 'btn btn-ghost', 'Browse the database'));
  copy.appendChild(actions);

  const search = el('form', 'search search-form');
  search.setAttribute('role', 'search');
  const input = el('input', 'search-input');
  input.type = 'search';
  input.name = 'q';
  input.placeholder = 'Search a case, a PLL name or an algorithm…';
  input.setAttribute('aria-label', 'Search cases and pages');
  const go = el('button', 'btn btn-ghost', 'Search');
  go.type = 'submit';
  search.appendChild(input);
  search.appendChild(go);
  copy.appendChild(search);
  const results = el('div', 'search-results');
  copy.appendChild(results);

  let index = null;
  search.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const q = input.value.trim();
    results.textContent = '';
    if (!q) return;
    index ??= await buildIndex();
    const hits = lookup(q, index);
    if (!hits.length) {
      results.appendChild(el('p', 'muted', 'Nothing matched. Try “PLL”, “Sune” or “T-Perm”.'));
      return;
    }
    for (const hit of hits.slice(0, 8)) {
      const a = link(hit.path, 'result');
      a.appendChild(el('span', null, hit.label));
      a.appendChild(el('small', null, hit.kind));
      results.appendChild(a);
    }
  });

  const panel = el('div', 'hero-panel');
  for (const [value, label] of [
    [String(oll?.count ?? 0), 'OLL cases'],
    [String(pll?.count ?? 0), 'PLL cases'],
    [String((oll?.count ?? 0) + (pll?.count ?? 0)), 'algorithms'],
    ['2-sided', 'PLL recognition'],
  ]) {
    const stat = el('div', 'stat');
    stat.appendChild(el('div', 'stat-value', value));
    stat.appendChild(el('div', 'stat-label', label));
    panel.appendChild(stat);
  }

  hero.appendChild(copy);
  hero.appendChild(panel);
  container.appendChild(hero);

  // ---- trainers -----------------------------------------------------------
  container.appendChild(section('Trainers', '/t'));
  const trainers = el('div', 'card-grid');
  trainers.appendChild(tile({
    href: '/t',
    iconText: '◎',
    title: 'Algorithm trainer',
    desc: 'Pick a set, hold to start the timer, and drill cases without repeating one twice in a session.',
    meta: ['OLL', 'PLL', 'local times'],
  }));
  trainers.appendChild(tile({
    href: '/t/pllrecog',
    iconText: '◑',
    title: 'PLL recognition',
    desc: 'Two sides visible, twenty-one possible answers. Train the recognition step on its own.',
    meta: ['2-sided', 'all 21', 'history'],
  }));
  trainers.appendChild(tile({
    href: '/cross',
    iconText: '✚',
    title: 'Cross trainer',
    desc: 'Solve a cross from 1 to 7 moves, on any colour, and compare with the optimal solutions.',
    meta: ['1–7 moves', '6 colours'],
  }));
  trainers.appendChild(tile({
    href: '/analyze',
    iconText: '⌁',
    title: 'Scramble analyzer',
    desc: 'See how many crosses, pairs and last-layer paths a scramble admits, and where they lead.',
    meta: ['cross', 'pairs', 'LL'],
  }));
  container.appendChild(trainers);

  // ---- sets ---------------------------------------------------------------
  container.appendChild(section('Algorithm sets', '/a/3x3'));
  const setsGrid = el('div', 'card-grid');
  if (oll) {
    setsGrid.appendChild(tile({
      href: '/a/3x3/OLL',
      iconText: 'O',
      title: 'OLL · last layer orientation',
      desc: 'All 57 orientation cases, from the dot and line shapes to the awkward corner twists.',
      meta: [`${oll.count} cases`, 'real algs', `${oll.groups.length} groups`],
    }));
  }
  if (pll) {
    setsGrid.appendChild(tile({
      href: '/a/3x3/PLL',
      iconText: 'P',
      title: 'PLL · last layer permutation',
      desc: 'The 21 named permutations: A, E, F, G, J, N, R, T, U, V, Y and Z.',
      meta: [`${pll.count} cases`, 'Aa–Z', `${pll.groups.length} groups`],
    }));
  }
  setsGrid.appendChild(tile({
    href: '/3d',
    iconText: '3D',
    title: 'The cube itself',
    desc: 'Turn a real 3D cube with the keyboard, scramble it, and ask the solver for a solution.',
    meta: ['Three.js', 'keyboard + drag'],
  }));
  setsGrid.appendChild(tile({
    iconText: '2×2',
    title: '2×2, 4×4, 5×5',
    desc: 'Bigger puzzles are not in the database yet. The 3×3 sets are complete and verified.',
    meta: ['planned'],
    disabled: true,
  }));
  container.appendChild(setsGrid);

  // ---- featured cases -----------------------------------------------------
  const featured = [];
  for (const [puzzle, set, id] of FEATURED) {
    const data = await getSet(puzzle, set);
    const cs = data?.cases.find((c) => c.id === id);
    if (cs) featured.push({ puzzle, set, cs });
  }
  if (featured.length) {
    container.appendChild(section('Cases worth knowing', '/a/3x3'));
    const grid = el('div', 'card-grid');
    for (const { puzzle, set, cs } of featured) {
      const a = link(`/a/${puzzle}/${set}/${cs.id}`, 'tile');
      const preview = el('div', 'case-preview');
      preview.innerHTML = netSvg(cs.stickers, 3, 6);
      a.appendChild(preview);
      a.appendChild(el('span', 'tile-title', cs.name ?? cs.id));
      a.appendChild(el('span', 'tile-desc', cs.group));
      const alg = el('span', 'case-alg', cs.algs[0].seq);
      a.appendChild(alg);
      grid.appendChild(a);
    }
    container.appendChild(grid);
  }

  return container;
}
