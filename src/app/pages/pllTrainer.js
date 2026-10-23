// /t/pllrecog — 2 Sided PLL Recognition.
//
// The PLL is shown as a net with only two sides painted (that is how a PLL is
// actually looked at: the U face plus one side), so the user has to work out
// the case from partial information. All 21 answers are offered, the attempt is
// scored per case, and the counters live in the store across sessions.

import { el, link } from '../dom.js';
import { get, set } from '../store.js';
import { getSet } from '../../algdb/dataset.js';
import { pick } from '../../trainers/casePicker.js';
import { netSvg, faceStickers } from '../../render/net2d.js';
import { FACE_ORDER } from '../../render/stickerString.js';
import { onPageLeave } from '../lifecycle.js';

/** Which two side faces a 2-sided look shows. The U face is uniform after
 * OLL, so the information sits in the top rows of two adjacent sides. */
export const MASK_PAIRS = [['F', 'R'], ['R', 'B'], ['B', 'L'], ['L', 'F']];

function historyKey(puzzle, setName) {
  return `recog:${puzzle}/${setName}`;
}

function shortName(name = '') {
  return String(name).replace(/-Perm$/, '');
}

export async function render(container, route) {
  const puzzle = route.params.puzzle ?? '3x3';
  const setName = route.query.set ?? 'PLL';
  const data = await getSet(puzzle, setName);
  if (!data) {
    const p = el('div', 'missing');
    p.appendChild(el('h3', null, `No ${setName} dataset for ${puzzle}`));
    p.appendChild(el('p', null, 'PLL recognition needs the PLL set.'));
    p.appendChild(link('/t/pllrecog?set=PLL', 'btn btn-ghost', 'Open PLL recognition'));
    container.appendChild(p);
    return container;
  }

  const session = `session:${puzzle}/${setName}`;
  const seed = route.query.seed ?? String(Date.now() >> 10);
  const cs = pick(data.cases, session, seed, 1);
  const pair = MASK_PAIRS[hashSeed(seed) % MASK_PAIRS.length];

  const layout = el('div', 'recog-layout');
  const stage = el('section', 'trainer-stage');
  const side = el('aside', 'trainer-side');
  layout.appendChild(stage);
  layout.appendChild(side);
  container.appendChild(layout);

  stage.appendChild(el('div', 'recog-hint', `2-sided look · ${pair[0]} + ${pair[1]}`));

  const preview = el('div', 'recog-preview');
  preview.innerHTML = maskedSvg(cs.stickers, 3, pair);
  stage.appendChild(preview);

  const feedback = el('div', 'recog-feedback');
  stage.appendChild(feedback);

  const answers = el('div', 'recog-answers');
  const buttons = [];
  for (const c of data.cases) {
    const b = el('button', 'answer', shortName(c.name ?? c.id));
    b.type = 'button';
    b.dataset.case = c.id;
    b.title = c.group;
    answers.appendChild(b);
    buttons.push(b);
  }
  stage.appendChild(answers);

  const actions = el('div', 'row');
  const nextBtn = el('button', 'again', 'Next case');
  nextBtn.type = 'button';
  actions.appendChild(nextBtn);
  stage.appendChild(actions);

  const answerWrap = el('div', 'side-card');
  answerWrap.appendChild(el('h3', null, 'Answer'));
  const answerBody = el('div', 'stack');
  answerWrap.appendChild(answerBody);
  answerWrap.style.display = 'none';
  side.appendChild(answerWrap);

  // ---- definition / hint ------------------------------------------------
  const def = el('div', 'side-card');
  def.appendChild(el('h3', null, 'Case'));
  const defBody = el('div', 'stack');
  defBody.appendChild(el('div', 'stat-line', 'Name: hidden'));
  defBody.appendChild(el('div', 'stat-line', `Answers: ${data.count}`));
  const hintBtn = el('button', 'btn btn-ghost', 'Show group hint');
  let hintOn = false;
  hintBtn.addEventListener('click', () => {
    hintOn = !hintOn;
    hintBtn.textContent = hintOn ? 'Hide group hint' : 'Show group hint';
    defBody.firstChild.textContent = `Group: ${cs.group}`;
  });
  defBody.appendChild(hintBtn);
  def.appendChild(defBody);
  side.appendChild(def);

  // ---- timer ------------------------------------------------------------
  const timerCard = el('div', 'side-card');
  timerCard.appendChild(el('h3', null, 'Attempt'));
  const clock = el('div', 'cross-clock', '0.00');
  timerCard.appendChild(clock);
  const timerToggle = el('button', 'btn btn-ghost', 'Timer: on');
  let timerOn = true;
  timerToggle.addEventListener('click', () => {
    timerOn = !timerOn;
    timerToggle.textContent = `Timer: ${timerOn ? 'on' : 'off'}`;
    if (!timerOn) clock.textContent = '—';
  });
  timerCard.appendChild(timerToggle);
  side.appendChild(timerCard);

  const start = performance.now();
  let answered = false;
  let elapsed = 0;
  const tick = globalThis.setInterval(() => {
    if (!container.isConnected) { globalThis.clearInterval(tick); return; }
    if (!timerOn || answered) return;
    clock.textContent = ((performance.now() - start) / 1000).toFixed(2);
  }, 60);

  // ---- history ----------------------------------------------------------
  const historyCard = el('div', 'side-card');
  historyCard.appendChild(el('h3', null, 'By case'));
  const tableWrap = el('div');
  historyCard.appendChild(tableWrap);
  side.appendChild(historyCard);

  function stats() {
    return get(historyKey(puzzle, setName), {});
  }

  function renderHistory() {
    const s = stats();
    const rows = data.cases
      .map((c) => ({ c, st: s[c.id] ?? { seen: 0, right: 0 } }))
      .filter((r) => r.st.seen)
      .sort((a, b) => b.st.seen - a.st.seen || shortName(a.c.name).localeCompare(shortName(b.c.name)));
    tableWrap.textContent = '';
    if (!rows.length) {
      tableWrap.appendChild(el('p', 'muted', 'No attempts yet.'));
      return;
    }
    const table = el('table', 'history-table');
    const head = el('thead');
    head.innerHTML = '<tr><th>Case</th><th>Seen</th><th>Right</th><th>%</th></tr>';
    table.appendChild(head);
    const body = el('tbody');
    for (const { c, st } of rows.slice(0, 10)) {
      const tr = el('tr');
      tr.appendChild(el('td', null, shortName(c.name ?? c.id)));
      tr.appendChild(el('td', 'num', String(st.seen)));
      tr.appendChild(el('td', 'num', String(st.right)));
      tr.appendChild(el('td', 'num', `${Math.round((st.right / st.seen) * 100)}%`));
      body.appendChild(tr);
    }
    table.appendChild(body);
    tableWrap.appendChild(table);
  }

  function record(ok) {
    const s = stats();
    const st = s[cs.id] ?? { seen: 0, right: 0, ms: 0 };
    st.seen++;
    if (ok) st.right++;
    st.ms = (st.ms ?? 0) + elapsed;
    s[cs.id] = st;
    set(historyKey(puzzle, setName), s);
    renderHistory();
  }

  function finish(chosenId) {
    if (answered) return;
    answered = true;
    elapsed = Math.round(performance.now() - start);
    clearInterval(tick);
    clock.textContent = timerOn ? (elapsed / 1000).toFixed(2) : '—';
    const ok = chosenId === cs.id;
    for (const b of buttons) {
      b.disabled = true;
      if (b.dataset.case === cs.id) b.classList.add('right');
      if (b.dataset.case === chosenId && !ok) b.classList.add('wrong');
    }
    feedback.className = `recog-feedback ${ok ? 'right' : 'wrong'}`;
    feedback.textContent = ok
      ? `Correct · ${shortName(cs.name)} (${(elapsed / 1000).toFixed(2)}s)`
      : `Not quite · this is ${shortName(cs.name)}`;
    record(ok);

    answerWrap.style.display = '';
    answerBody.textContent = '';
    const name = el('div', 'stat-line big');
    name.appendChild(el('span', null, cs.name ?? cs.id));
    name.appendChild(el('b', null, cs.id));
    answerBody.appendChild(name);
    answerBody.appendChild(el('div', 'muted', cs.group));
    const alg = el('div', 'alg-seq', cs.algs[0].seq);
    answerBody.appendChild(alg);
    const setup = el('div', 'trainer-scramble');
    setup.appendChild(el('b', null, 'Setup'));
    setup.appendChild(el('div', null, cs.setup));
    answerBody.appendChild(setup);
    const browse = link(`/a/${puzzle}/${setName}/${cs.id}`, 'section-link', 'Open the case →');
    answerBody.appendChild(browse);
  }

  answers.addEventListener('click', (ev) => {
    const btn = ev.target.closest?.('button.answer');
    if (!btn) return;
    finish(btn.dataset.case);
  });

  nextBtn.addEventListener('click', () => {
    cleanup();
    onPageLeave(null);
    const nextSeed = String(Math.random());
    const url = `/t/pllrecog?set=${encodeURIComponent(setName)}&seed=${encodeURIComponent(nextSeed)}`;
    globalThis.history?.pushState({}, '', url);
    container.textContent = '';
    void render(container, { ...route, query: { set: setName, seed: nextSeed }, params: { puzzle } });
  });

  function cleanup() {
    globalThis.clearInterval(tick);
  }

  renderHistory();
  onPageLeave(cleanup);
  return container;
}

/** Net markup where only the two looked-at faces keep their colours. */
export function maskedSvg(stickers, size, pair) {
  const parts = [];
  for (let f = 0; f < 6; f++) {
    const face = FACE_ORDER[f];
    const keep = pair.includes(face);
    const grid = faceStickers(stickers, face, size);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const ch = keep ? grid[row * size + col] : 'x';
        parts.push([face, row, col, ch]);
      }
    }
  }
  return netSvg(rebuild(stickers, parts, size), size);
}

function rebuild(stickers, parts, size) {
  const out = stickers.split('');
  for (const [face, row, col, ch] of parts) {
    const f = FACE_ORDER.indexOf(face);
    out[f * size * size + row * size + col] = ch;
  }
  return out.join('');
}

function hashSeed(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = (h ^ ch.charCodeAt(0)) * 16777619 & 0xffffffff;
  return h >>> 0;
}
