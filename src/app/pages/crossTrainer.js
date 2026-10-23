// /cross — Cross Trainer.
//
// Difficulty d means "a cross solvable in at most d moves": the scramble is
// built by applying d random turns to a solved cube, so the shortest solution
// is at most d, and the trainer states that length only because the search
// below proves it (crossSolutions is breadth-first, so the first hit is
// optimal).

import { el, link } from '../dom.js';
import { get, set } from '../store.js';
import { crossSolutions, crossEdges, crossSolved, COLOUR_FACE } from '../../analyze/projection.js';
import { summarise, formatMs } from '../../trainers/stats.js';
import { Stopwatch, HOLD_MS } from '../../trainers/stopwatch.js';
import { netSvg } from '../../render/net2d.js';
import { rotateStickerString, stateToStickerString } from '../../render/stickerString.js';
import { stateOf } from '../../analyze/analyzer.js';
import { parseNotation } from '../../moves.js';
import { rngFor } from '../../trainers/casePicker.js';
import { onPageLeave } from '../lifecycle.js';

const COLOURS = ['white', 'yellow', 'green', 'blue', 'red', 'orange'];
/** Whole-cube turn that puts each colour on the bottom. */
const TO_BOTTOM = { white: 'z2', yellow: '', green: "x'", blue: 'x', red: 'z', orange: "z'" };

export async function render(container, route) {
  const colour = COLOURS.includes(route.query.colour) ? route.query.colour : 'yellow';
  const difficulty = Math.min(7, Math.max(1, Number(route.query.difficulty ?? 3)));
  const seed = route.query.seed ?? String(Date.now() >> 8);

  const scramble = buildScramble(difficulty, seed);
  const state = stateOf(scramble);
  const solutions = crossSolutions(state, colour, difficulty, 6);
  const shortest = solutions.length ? Math.min(...solutions.map((s) => (s ? s.split(' ').length : 0))) : null;
  const solved = crossSolved(state, crossEdges(colour));

  const layout = el('div', 'trainer-layout');
  const stage = el('section', 'trainer-stage');
  const side = el('aside', 'trainer-side');
  layout.appendChild(stage);
  layout.appendChild(side);
  container.appendChild(layout);

  stage.appendChild(el('div', 'cross-head', `cross colour ${colour} · difficulty ${difficulty}`));
  stage.appendChild(el('div', 'cross-scramble', scramble));

  const preview = el('div', 'cross-preview');
  let stickers = null;
  try { stickers = rotateStickerString(stateToSticker(state), parseNotation(TO_BOTTOM[colour] ?? ''), 3); } catch { /* default */ }
  preview.innerHTML = netSvg(stickers ?? stateToSticker(state), 3, 10);
  stage.appendChild(preview);

  const proven = el('div', 'cross-length');
  proven.textContent = solved
    ? 'The cross is already solved. Tap next for a new scramble.'
    : shortest === null
      ? `No cross within ${difficulty} moves.`
      : `Shortest cross: ${shortest} ${shortest === 1 ? 'move' : 'moves'} (proved by breadth-first search).`;
  stage.appendChild(proven);

  const solvedLine = el('div', 'cross-solved', `Cross already solved: ${solved ? 'yes' : 'no'}`);
  stage.appendChild(solvedLine);

  const solutionsWrap = el('div');
  const toggle = el('button', 'btn btn-ghost', 'Show solutions');
  const list = el('div', 'cross-solutions');
  list.style.display = 'none';
  for (const s of solutions) {
    list.appendChild(el('div', 'cross-solution', `${s || '(already solved)'}${s ? ` · ${s.split(' ').length}f` : ''}`));
  }
  toggle.addEventListener('click', () => {
    const hidden = list.style.display === 'none';
    list.style.display = hidden ? '' : 'none';
    toggle.textContent = hidden ? 'Hide solutions' : 'Show solutions';
  });
  solutionsWrap.appendChild(toggle);
  solutionsWrap.appendChild(list);
  stage.appendChild(solutionsWrap);

  // ---- timer -------------------------------------------------------------
  const watch = new Stopwatch();
  const clock = el('div', 'cross-clock', '0.00');
  const hint = el('div', 'timer-hint', `Hold for ${HOLD_MS} ms, release to start. Press again to stop.`);
  const pad = el('button', 'press-btn start', 'Hold to start');
  pad.type = 'button';
  const padRow = el('div', 'press-pad');
  padRow.appendChild(pad);
  stage.appendChild(clock);
  stage.appendChild(hint);
  stage.appendChild(padRow);

  const tick = globalThis.setInterval(() => {
    if (!container.isConnected) { globalThis.clearInterval(tick); return; }
    if (watch.state === 'running') clock.textContent = watch.display();
  }, 50);

  const setPad = (label, cls) => { pad.textContent = label; pad.className = `press-btn ${cls}`; };
  function down() {
    if (watch.state === 'running') return;
    watch.press(performance.now());
    if (watch.state === 'pressing') { setPad('Keep holding…', 'start'); hint.textContent = 'Release when ready.'; }
  }
  function up() {
    watch.release(performance.now());
    if (watch.state === 'running') {
      clock.className = 'cross-clock running';
      setPad('Stop', 'stop');
      hint.textContent = 'Timer running. Press again to stop.';
      return;
    }
    if (watch.state === 'stopped') {
      const ms = watch.ms();
      clock.textContent = formatMs(ms);
      clock.className = 'cross-clock done';
      record(colour, difficulty, ms);
      watch.reset();
      setPad('Hold to start', 'start');
      hint.textContent = `Saved ${formatMs(ms)}.`;
      refresh();
    } else if (watch.reject) {
      hint.textContent = watch.reject;
      setPad('Hold to start', 'start');
    }
  }
  pad.addEventListener('pointerdown', (ev) => { ev.preventDefault(); down(); });
  pad.addEventListener('pointerup', (ev) => { ev.preventDefault(); up(); });
  pad.addEventListener('pointercancel', () => { watch.reset(); setPad('Hold to start', 'start'); });

  let spaceHeld = false;
  const onKey = (ev) => {
    if (ev.code !== 'Space' || ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
    ev.preventDefault();
    if (ev.repeat) return;
    if (watch.state === 'running') { up(); spaceHeld = false; return; }
    if (!spaceHeld) { spaceHeld = true; down(); }
  };
  const onKeyUp = (ev) => {
    if (ev.code !== 'Space' || !spaceHeld) return;
    spaceHeld = false;
    up();
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKeyUp);

  // ---- side: controls and stats -----------------------------------------
  const settings = el('div', 'side-card');
  settings.appendChild(el('h3', null, 'Cross colour'));
  const colourWrap = el('div', 'cross-select');
  for (const c of COLOURS) {
    const a = link(`/cross?colour=${c}&difficulty=${difficulty}`, 'cross-choice');
    a.setAttribute('aria-pressed', String(c === colour));
    const dot = el('span', 'cross-dot');
    dot.style.background = c;
    a.appendChild(dot);
    a.appendChild(el('span', null, c));
    colourWrap.appendChild(a);
  }
  settings.appendChild(colourWrap);
  settings.appendChild(el('h3', null, 'Difficulty'));
  const diffWrap = el('div', 'filters');
  diffWrap.style.marginTop = '8px';
  for (let d = 1; d <= 7; d++) {
    const a = link(`/cross?colour=${colour}&difficulty=${d}`, 'filter-chip');
    a.textContent = `${d} moves`;
    if (d === difficulty) a.classList.add('active');
    diffWrap.appendChild(a);
  }
  settings.appendChild(diffWrap);
  side.appendChild(settings);

  const statsCard = el('div', 'side-card');
  statsCard.appendChild(el('h3', null, 'This drill'));
  const statsBody = el('div', 'session-stats');
  statsCard.appendChild(statsBody);
  side.appendChild(statsCard);

  const nextCard = el('div', 'side-card');
  const nextBtn = el('button', 'again', 'New scramble');
  nextBtn.type = 'button';
  nextBtn.addEventListener('click', () => {
    cleanup();
    onPageLeave(null);
    const nextSeed = String(Math.random());
    const url = `/cross?colour=${colour}&difficulty=${difficulty}&seed=${encodeURIComponent(nextSeed)}`;
    globalThis.history?.pushState({}, '', url);
    container.textContent = '';
    void render(container, { ...route, query: { colour, difficulty: String(difficulty), seed: nextSeed }, params: {} });
  });
  nextCard.appendChild(nextBtn);
  nextCard.appendChild(link('/analyze', 'section-link', 'Open the analyzer →'));
  side.appendChild(nextCard);

  function refresh() {
    const rows = get(sessionKey(colour, difficulty), []);
    const s = summarise(rows.map((r) => r.ms));
    statsBody.textContent = '';
    for (const [label, value, cls] of [
      ['Solves', String(s.count), ''],
      ['Best', formatMs(s.best), 'big'],
      ['Mean', formatMs(s.mean), ''],
      ['ao5', formatMs(s.ao5), ''],
      ['ao12', formatMs(s.ao12), ''],
    ]) {
      const line = el('div', `stat-line${cls ? ` ${cls}` : ''}`);
      line.appendChild(el('span', null, label));
      line.appendChild(el('b', null, value));
      statsBody.appendChild(line);
    }
  }
  function cleanup() {
    globalThis.clearInterval(tick);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup', onKeyUp);
  }

  refresh();
  onPageLeave(cleanup);
  return container;
}

function stateToSticker(state) {
  return stateToStickerString(state);
}

/** d random turns off a solved cube, so the cross is at most d moves away. */
function buildScramble(difficulty, seed) {
  const rng = rngFor(seed);
  const faces = ['U', 'D', 'R', 'L', 'F', 'B'];
  const out = [];
  let last = '';
  while (out.length < difficulty) {
    const f = faces[Math.floor(rng() * faces.length)];
    if (f === last) continue;
    last = f;
    const mod = ['', "'", '2'][Math.floor(rng() * 3)];
    out.push(`${f}${mod}`);
  }
  return out.join(' ');
}

function sessionKey(colour, difficulty) {
  return `session:cross/${colour}/${difficulty}`;
}

function record(colour, difficulty, ms) {
  const key = sessionKey(colour, difficulty);
  const rows = get(key, []);
  rows.push({ case: `${colour}/${difficulty}`, ms, at: Date.now() });
  set(key, rows.slice(-500));
}
