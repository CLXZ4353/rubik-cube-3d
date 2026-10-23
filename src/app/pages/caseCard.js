// /a/:puzzle/:set/:case — one case: the net, the setup that produces it, the
// standard algorithm, every alternative, and the local learnt/bookmark state.

import { el, link } from '../dom.js';
import { getCase } from '../../algdb/dataset.js';
import { get, set } from '../store.js';
import { netSvg } from '../../render/net2d.js';
import { LEARN_STATES } from './algsheet.js';

function sheetFor(puzzle, setName) {
  return get(`sheet:${puzzle}/${setName}`, {});
}

function writeSheet(puzzle, setName, sheet) {
  return set(`sheet:${puzzle}/${setName}`, sheet);
}

function copyButton(text) {
  const btn = el('button', 'copy-btn', 'Copy');
  btn.type = 'button';
  btn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    try {
      await globalThis.navigator?.clipboard?.writeText(text);
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
    } catch {
      btn.textContent = 'Select it';
    }
  });
  return btn;
}

export async function render(container, route) {
  const puzzle = route.params.puzzle;
  const setName = route.params.set;
  const cs = await getCase(puzzle, setName, route.params.case);
  if (!cs) {
    const p = el('div', 'missing');
    p.appendChild(el('h3', null, `No case ${route.params.case}`));
    p.appendChild(el('p', null, `There is no ${route.params.case} in ${puzzle} ${setName}.`));
    p.appendChild(link(`/a/${puzzle}/${setName}`, 'btn btn-ghost', `Back to ${setName}`));
    container.appendChild(p);
    return container;
  }

  const layout = el('div', 'case-detail');

  // ---- left: net + meta ---------------------------------------------------
  const left = el('aside', 'detail-preview');
  const net = el('div');
  net.innerHTML = netSvg(cs.stickers, 3, 14);
  left.appendChild(net);
  const meta = el('div', 'detail-meta');
  meta.appendChild(el('span', 'badge-pill', `${puzzle} · ${setName}`));
  meta.appendChild(el('span', 'badge-pill', `${cs.algs[0].htm} htm`));
  for (const alg of cs.algs.slice(0, 1)) meta.appendChild(el('span', 'badge-pill', `${alg.qtm} qtm`));
  left.appendChild(meta);
  layout.appendChild(left);

  // ---- right: heading, learned state, setup, algorithms -------------------
  const right = el('div');
  right.appendChild(el('h2', 'detail-title', cs.name ?? cs.id));
  right.appendChild(el('p', 'detail-group', cs.group));

  let sheet = sheetFor(puzzle, setName);

  const learnRow = el('div', 'learn-row');
  const learnButtons = LEARN_STATES.map((label, value) => {
    const btn = el('button', `learn-btn${(sheet[cs.id] ?? 0) === value ? ' active' : ''}`, label);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      sheet[cs.id] = value;
      writeSheet(puzzle, setName, sheet);
      for (const [i, b] of learnButtons.entries()) b.classList.toggle('active', i === value);
    });
    learnRow.appendChild(btn);
    return btn;
  });

  const star = el('button', `learn-btn${sheet[`#${cs.id}`] ? ' learnt' : ''}`, sheet[`#${cs.id}`] ? '★ saved' : '☆ save');
  star.type = 'button';
  star.addEventListener('click', () => {
    const flag = `#${cs.id}`;
    if (sheet[flag]) delete sheet[flag];
    else sheet[flag] = true;
    writeSheet(puzzle, setName, sheet);
    star.textContent = sheet[flag] ? '★ saved' : '☆ save';
    star.classList.toggle('learnt', Boolean(sheet[flag]));
  });
  learnRow.appendChild(star);
  right.appendChild(learnRow);

  const setup = el('div', 'setup-box');
  setup.appendChild(el('b', null, 'Setup · apply this to a solved cube to get the case'));
  setup.appendChild(el('div', null, cs.setup));
  right.appendChild(setup);

  right.appendChild(el('h3', null, 'Algorithms'));
  const list = el('div', 'alg-list');
  cs.algs.forEach((alg, i) => {
    const card = el('div', `alg-card${i === 0 ? ' primary' : ''}`);
    const head = el('div', 'alg-card-head');
    head.appendChild(el('span', 'alg-tag', i === 0 ? 'standard' : `alternative ${i}`));
    head.appendChild(copyButton(alg.seq));
    card.appendChild(head);
    card.appendChild(el('div', 'alg-seq', alg.seq));
    const metrics = el('div', 'alg-metrics');
    metrics.appendChild(el('span', null, `htm ${alg.htm}`));
    metrics.appendChild(el('span', null, `qtm ${alg.qtm}`));
    metrics.appendChild(el('span', null, `etm ${alg.etm}`));
    metrics.appendChild(el('span', null, `stm ${alg.stm}`));
    if (alg.gen) metrics.appendChild(el('span', null, alg.gen));
    card.appendChild(metrics);
    list.appendChild(card);
  });
  right.appendChild(list);

  const actions = el('div', 'row');
  actions.style.marginTop = '20px';
  actions.appendChild(link(`/t?set=${encodeURIComponent(setName)}&case=${encodeURIComponent(cs.id)}`, 'btn btn-primary', 'Train this case'));
  actions.appendChild(link(`/a/${puzzle}/${setName}`, 'btn btn-ghost', `All ${setName}`));
  const print = el('button', 'btn btn-ghost', 'Print');
  print.type = 'button';
  print.addEventListener('click', () => globalThis.print?.());
  actions.appendChild(print);
  right.appendChild(actions);

  layout.appendChild(right);
  container.appendChild(layout);
  return container;
}
