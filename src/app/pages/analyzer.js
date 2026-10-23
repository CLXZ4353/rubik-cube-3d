// /analyze — Scramble Analyzer UI.
// Deep link: /analyze?scramble=...&howfar=cross+2&colors=yellow,white&maxDepth=6
// The search itself lives in src/analyze/ (shared with the cross trainer).

import { el, link } from '../dom.js';
import { analyze, filterSolutions, stateOf, DEFAULTS } from '../../analyze/analyzer.js';
import { netSvg } from '../../render/net2d.js';
import { stateToStickerString as stickersOf } from '../../render/stickerString.js';

const COLOURS = ['white', 'yellow', 'green', 'blue', 'red', 'orange'];
const HOWFAR = [
  ['full', 'Full solve'],
  ['cross+3', 'Cross + 3'],
  ['cross+2', 'Cross + 2'],
  ['cross+1', 'Cross + 1'],
  ['cross', 'Cross only'],
];
const FILTERS = [
  ['all', 'All'],
  ['full', 'Full step'],
  ['oll', 'OLL skip'],
  ['pll', 'PLL skip'],
  ['ll', 'LL skip'],
];

function parseColours(value) {
  if (!value) return [...DEFAULTS.colors];
  const out = value.split(',').map((c) => c.trim().toLowerCase()).filter((c) => COLOURS.includes(c));
  return out.length ? out : [...DEFAULTS.colors];
}

function buildUrl(p) {
  const q = new URLSearchParams();
  if (p.scramble) q.set('scramble', p.scramble);
  q.set('howfar', p.howfar);
  q.set('colors', p.colors.join(','));
  q.set('maxDepth', String(p.maxDepth));
  if (p.filter && p.filter !== 'all') q.set('filter', p.filter);
  return `/analyze?${q.toString()}`;
}

export async function render(container, route) {
  const scramble = (route.query.scramble ?? '').trim();
  const howfar = HOWFAR.some(([v]) => v === route.query.howfar) ? route.query.howfar : DEFAULTS.howfar;
  const colours = parseColours(route.query.colors);
  const maxDepth = Math.min(7, Math.max(3, Number(route.query.maxDepth ?? DEFAULTS.maxDepth)));
  const filter = FILTERS.some(([v]) => v === route.query.filter) ? route.query.filter : 'all';

  // ---- form --------------------------------------------------------------
  const form = el('form', 'analyze-form');
  const input = el('textarea', 'analyze-input');
  input.placeholder = 'Paste a scramble, e.g. R U R\' U\' F\' U F';
  input.value = scramble;
  input.setAttribute('aria-label', 'Scramble');
  form.appendChild(input);

  const controls = el('div', 'analyze-controls');
  const label = (text, node) => {
    const l = el('label');
    l.appendChild(el('span', null, text));
    l.appendChild(node);
    return l;
  };

  const howfarSelect = el('select', 'select');
  for (const [value, name] of HOWFAR) {
    const o = el('option', null, name);
    o.value = value;
    if (value === howfar) o.selected = true;
    howfarSelect.appendChild(o);
  }
  controls.appendChild(label('Stop at', howfarSelect));

  const depthSelect = el('select', 'select');
  for (let d = 3; d <= 7; d++) {
    const o = el('option', null, `${d} moves`);
    o.value = String(d);
    if (d === maxDepth) o.selected = true;
    depthSelect.appendChild(o);
  }
  controls.appendChild(label('Cross depth', depthSelect));

  const colourWrap = el('div', 'filters');
  const colourInputs = [];
  for (const c of COLOURS) {
    const l = el('label', 'filter-chip');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.value = c;
    cb.checked = colours.includes(c);
    cb.style.marginRight = '6px';
    cb.addEventListener('change', () => l.classList.toggle('active', cb.checked));
    if (cb.checked) l.classList.add('active');
    l.appendChild(cb);
    l.appendChild(el('span', null, c));
    colourWrap.appendChild(l);
    colourInputs.push(cb);
  }
  controls.appendChild(colourWrap);
  form.appendChild(controls);

  const submit = el('button', 'btn btn-primary', 'Analyze');
  submit.type = 'submit';
  const reset = el('button', 'btn btn-ghost', 'Clear');
  reset.type = 'button';
  reset.addEventListener('click', () => {
    input.value = '';
    const url = '/analyze';
    globalThis.history?.pushState({}, '', url);
    container.textContent = '';
    void render(container, { ...route, query: {} });
  });
  const actions = el('div', 'row');
  actions.appendChild(submit);
  actions.appendChild(reset);
  form.appendChild(actions);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const chosen = colourInputs.filter((c) => c.checked).map((c) => c.value);
    const next = {
      scramble: input.value.trim(),
      howfar: howfarSelect.value,
      colors: chosen.length ? chosen : ['white'],
      maxDepth: Number(depthSelect.value),
      filter: 'all',
    };
    const url = buildUrl(next);
    globalThis.history?.pushState({}, '', url);
    container.textContent = '';
    void render(container, { ...route, query: { ...next, colors: next.colors.join(','), maxDepth: String(next.maxDepth) } });
  });

  container.appendChild(form);

  // ---- empty state -------------------------------------------------------
  if (!scramble) {
    const empty = el('div', 'empty');
    empty.appendChild(el('h3', null, 'Paste a scramble to analyze'));
    empty.appendChild(el('p', null, 'The analyzer counts the crosses, F2L pairs and last-layer paths that each lead to a verified solution. Every sequence is replayed on the cube engine, so a result is never a guess.'));
    empty.appendChild(el('p', 'faint', 'Tip: start with “Cross + 1” and one or two colours; the full six-colour search is much wider.'));
    const examples = el('div', 'row');
    for (const ex of ["R U R' U' F' U F", "F R U R' U' F'", "D2 L R' U2 F D' B' L2 U R"]) {
      const b = el('button', 'filter-chip', ex);
      b.type = 'button';
      b.addEventListener('click', () => {
        input.value = ex;
        input.focus();
        form.requestSubmit();
      });
      examples.appendChild(b);
    }
    empty.appendChild(examples);
    container.appendChild(empty);
    return container;
  }

  // ---- analysis ----------------------------------------------------------
  const loading = el('div', 'solution-empty', 'Searching and verifying…');
  container.appendChild(loading);

  const result = await analyze(scramble, {
    howfar,
    colors: colours,
    maxDepth,
    timeBudgetMs: DEFAULTS.timeBudgetMs,
  });

  loading.remove();

  const layout = el('div', 'analyze-layout');
  const side = el('aside', 'analyze-side');
  const main = el('div');

  const preview = el('div', 'analyze-preview');
  try {
    preview.innerHTML = netSvg(stickersOf(stateOf(scramble)), 3, 10);
  } catch {
    preview.appendChild(el('p', 'muted', 'No cube preview for this scramble.'));
  }
  side.appendChild(preview);

  const counters = el('div', 'analyze-counters');
  for (const [labelText, value, title] of [
    ['Crosses', result.counters.crosses, 'cross prefixes that lead to a verified solution'],
    ['Pairs', result.counters.pairs, 'cross + F2L pairs that lead somewhere'],
    ['Last layer', result.counters.ll, 'verified last-layer completions'],
    ['Solutions', result.counters.total, 'verified full solutions'],
  ]) {
    const c = el('div', 'counter');
    c.title = title;
    c.appendChild(el('b', null, String(value)));
    c.appendChild(el('span', null, labelText));
    counters.appendChild(c);
  }
  side.appendChild(counters);

  const params = el('div', 'side-card');
  params.appendChild(el('h3', null, 'Search'));
  const steps = el('div', 'analyze-steps');
  for (const [k, v] of [
    ['How far', HOWFAR.find(([x]) => x === howfar)?.[1] ?? howfar],
    ['Colours', colours.join(', ')],
    ['Cross depth', `${maxDepth} moves`],
    ['Budget', `${Math.round(DEFAULTS.timeBudgetMs / 1000)}s`],
  ]) {
    const row = el('div', 'step-row');
    row.appendChild(el('span', null, k));
    row.appendChild(el('b', null, v));
    steps.appendChild(row);
  }
  if (result.truncated) {
    const note = el('p', 'faint');
    note.textContent = 'The time budget stopped the search early; counts are partial but every listed solution is verified.';
    steps.appendChild(note);
  }
  params.appendChild(steps);
  side.appendChild(params);
  layout.appendChild(side);

  let activeFilter = filter;
  const head = el('div', 'section-head');
  const headTitle = el('h2', 'section-title', '');
  head.appendChild(headTitle);
  const chips = el('div', 'analyze-filters');
  const chipButtons = [];
  for (const [value, name] of FILTERS) {
    const b = el('button', `filter-chip${value === activeFilter ? ' active' : ''}`, name);
    b.type = 'button';
    b.addEventListener('click', () => {
      activeFilter = value;
      drawSolutions();
      const url = buildUrl({ scramble, howfar, colors: colours, maxDepth, filter: value });
      globalThis.history?.pushState({}, '', url);
    });
    chips.appendChild(b);
    chipButtons.push(b);
  }
  main.appendChild(head);
  main.appendChild(chips);

  const listWrap = el('div');
  main.appendChild(listWrap);

  function drawSolutions() {
    const solutions = filterSolutions(result.solutions, activeFilter);
    headTitle.textContent = `Solutions · ${solutions.length}`;
    FILTERS.forEach(([value], i) => chipButtons[i].classList.toggle('active', value === activeFilter));
    listWrap.textContent = '';

    if (!solutions.length) {
      const empty = el('div', 'solution-empty');
      empty.textContent = result.counters.total === 0
        ? 'No verified solution at these settings. Try another colour or a deeper cross.'
        : 'No solution matches this filter.';
      listWrap.appendChild(empty);
      return;
    }

    const list = el('div', 'analyze-solutions');
    solutions.forEach((s) => {
      const row = el('div', 'solution-row');
      const top = el('div', 'row');
      top.appendChild(el('span', 'mono', s.seq));
      const copy = el('button', 'copy-btn', 'Copy');
      copy.type = 'button';
      copy.addEventListener('click', async () => {
        try { await globalThis.navigator?.clipboard?.writeText(s.seq); copy.textContent = 'Copied'; } catch { copy.textContent = 'Select'; }
        setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
      });
      top.appendChild(copy);
      row.appendChild(top);
      const meta = el('div', 'solution-comments');
      meta.textContent = `${s.htm} htm · ${s.cross} cross${s.skips?.oll ? ' · OLL skip' : ''}${s.skips?.pll ? ' · PLL skip' : ''}${s.comments ? `\n${s.comments}` : ''}`;
      row.appendChild(meta);
      list.appendChild(row);
    });
    listWrap.appendChild(list);
  }

  drawSolutions();

  layout.appendChild(main);
  container.appendChild(layout);

  const again = el('p', 'faint');
  again.style.marginTop = '18px';
  again.appendChild(link('/t', null, 'Train the last layer'));
  again.appendChild(document.createTextNode(' · '));
  again.appendChild(link('/cross', null, 'Cross trainer'));
  container.appendChild(again);

  return container;
}
