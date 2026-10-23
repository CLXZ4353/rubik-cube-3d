// /t — the algorithm trainer.
//
// A case is drawn from the set (cases already drilled this session are held
// back until every case had a go), the scramble is the case's setup plus an
// AUF, the timer is the shared Stackmat gate, and the times live in the store.
// Deep links: ?set=OLL&case=OLL_7&seed=42.

import { el, link } from '../dom.js';
import { get, set } from '../store.js';
import { getSet } from '../../algdb/dataset.js';
import { pick } from '../../trainers/casePicker.js';
import { scrambleFor } from '../../trainers/scramble.js';
import { summarise, formatMs } from '../../trainers/stats.js';
import { Stopwatch, HOLD_MS } from '../../trainers/stopwatch.js';
import { netSvg } from '../../render/net2d.js';
import { stateOf } from '../../analyze/analyzer.js';
import { recognize } from '../../cases/recognizer.js';
import { onPageLeave } from '../lifecycle.js';

export async function render(container, route) {
  const puzzle = route.params.puzzle ?? '3x3';
  const setName = route.query.set ?? 'OLL';
  const data = await getSet(puzzle, setName);
  if (!data) {
    const p = el('div', 'missing');
    p.appendChild(el('h3', null, `No dataset for ${puzzle} ${setName}`));
    p.appendChild(el('p', null, 'Try one of the sets that exist: OLL or PLL.'));
    p.appendChild(link('/t?set=OLL', 'btn btn-ghost', 'Train OLL'));
    container.appendChild(p);
    return container;
  }

  const session = `session:${puzzle}/${setName}`;
  const startSeed = route.query.seed ?? String(Date.now() >> 10);
  const forced = route.query.case;
  let cs = forced ? data.cases.find((c) => c.id === forced) : pick(data.cases, session, startSeed, 1);
  if (!cs) cs = data.cases[0];

  const layout = el('div', 'trainer-layout');
  const stage = el('section', 'trainer-stage');
  const side = el('aside', 'trainer-side');
  layout.appendChild(stage);
  layout.appendChild(side);
  container.appendChild(layout);

  // ---- stage --------------------------------------------------------------
  const preview = el('div', 'trainer-preview');
  preview.innerHTML = netSvg(cs.stickers, 3, 12);
  stage.appendChild(preview);

  const caseName = el('div', 'trainer-case', cs.name ?? cs.id);
  stage.appendChild(caseName);
  const sub = el('div', 'trainer-sub', cs.group);
  stage.appendChild(sub);

  const seed = startSeed;
  const scramble = scrambleFor(cs, seed, data.kind ?? setName);
  const scr = el('div', 'trainer-scramble');
  scr.appendChild(el('b', null, 'Scramble'));
  scr.appendChild(el('div', null, scramble));
  stage.appendChild(scr);

  const cube = stateOf(scramble);
  let recognised = null;
  try { recognised = await recognize(cube, puzzle, setName); } catch { recognised = null; }
  const check = el('div', 'trainer-check');
  check.innerHTML = recognised === cs.id
    ? 'The scramble is recognised as <span class="ok">this case</span>.'
    : `Recognised as: ${recognised ?? 'not this set'}`;
  stage.appendChild(check);

  // ---- timer -------------------------------------------------------------
  const watch = new Stopwatch();
  const clock = el('div', 'trainer-clock', '0.00');
  const hint = el('div', 'timer-hint', `Hold for ${HOLD_MS} ms, release to start. Hold again to stop.`);
  const pad = el('button', 'press-btn start', 'Hold to start');
  pad.type = 'button';
  const padRow = el('div', 'press-pad');
  padRow.appendChild(pad);

  const timerBox = el('div', 'timer-box');
  timerBox.appendChild(clock);
  timerBox.appendChild(hint);
  timerBox.appendChild(padRow);
  stage.appendChild(timerBox);

  const setPad = (label, cls) => {
    pad.textContent = label;
    pad.className = `press-btn ${cls}`;
  };

  const tick = globalThis.setInterval(() => {
    if (!container.isConnected) { globalThis.clearInterval(tick); return; }
    if (watch.state === 'running') clock.textContent = watch.display();
  }, 50);

  function down() {
    if (watch.state === 'running') return;
    watch.press(performance.now());
    if (watch.state === 'pressing') {
      setPad('Keep holding…', 'start');
      hint.textContent = 'Release when you are ready.';
    }
  }

  function up() {
    watch.release(performance.now());
    if (watch.state === 'running') {
      clock.textContent = watch.display();
      clock.className = 'trainer-clock running';
      setPad('Stop', 'stop');
      hint.textContent = 'Timer running. Press again when you finish.';
      return;
    }
    if (watch.state === 'stopped') {
      const ms = watch.ms();
      clock.textContent = formatMs(ms);
      clock.className = 'trainer-clock done';
      record(ms);
      watch.reset();
      setPad('Hold to start', 'start');
      hint.textContent = `Saved ${formatMs(ms)}. Hold again for the next solve.`;
      refreshStats();
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
    if (ev.code !== 'Space') return;
    if (!spaceHeld) return;
    spaceHeld = false;
    up();
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKeyUp);

  // ---- side: algorithm + stats ------------------------------------------
  const algCard = el('div', 'side-card');
  algCard.appendChild(el('h3', null, 'Algorithm'));
  const algText = el('div', 'alg-seq', cs.algs[0].seq);
  const reveal = el('button', 'btn btn-ghost', 'Show algorithm');
  const revealWrap = el('div');
  revealWrap.appendChild(algText);
  algText.style.display = 'none';
  reveal.addEventListener('click', () => {
    const hidden = algText.style.display === 'none';
    algText.style.display = hidden ? '' : 'none';
    reveal.textContent = hidden ? 'Hide algorithm' : 'Show algorithm';
  });
  algCard.appendChild(revealWrap);
  algCard.appendChild(reveal);
  const meta = el('div', 'alg-metrics');
  meta.appendChild(el('span', null, `${cs.algs[0].htm} htm`));
  meta.appendChild(el('span', null, `${cs.algs[0].qtm} qtm`));
  algCard.appendChild(meta);
  side.appendChild(algCard);

  const statsCard = el('div', 'side-card');
  statsCard.appendChild(el('h3', null, 'This set'));
  const statsBody = el('div', 'session-stats');
  statsCard.appendChild(statsBody);
  side.appendChild(statsCard);

  const breakdownCard = el('div', 'side-card');
  breakdownCard.appendChild(el('h3', null, 'Cases drilled'));
  const breakdown = el('div', 'breakdown');
  breakdownCard.appendChild(breakdown);
  side.appendChild(breakdownCard);

  const actions = el('div', 'side-card');
  const nextBtn = el('button', 'again', 'Next case');
  nextBtn.type = 'button';
  nextBtn.addEventListener('click', () => {
    cleanup();
    onPageLeave(null);
    container.textContent = '';
    const nextSeed = String(Math.random());
    const url = `/t?set=${encodeURIComponent(setName)}&seed=${encodeURIComponent(nextSeed)}`;
    globalThis.history?.pushState({}, '', url);
    void render(container, { ...route, query: { set: setName, seed: nextSeed }, params: { puzzle } });
  });
  actions.appendChild(nextBtn);
  actions.appendChild(link(`/a/${puzzle}/${setName}`, 'section-link', 'Browse the set →'));
  side.appendChild(actions);

  function cleanup() {
    globalThis.clearInterval(tick);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup', onKeyUp);
  }

  function record(ms) {
    const rows = get(session, []);
    rows.push({ case: cs.id, ms, at: Date.now() });
    set(session, rows.slice(-500));
    const prog = `progress:${puzzle}/${setName}`;
    const p = get(prog, {});
    p[cs.id] = (p[cs.id] ?? 0) + 1;
    set(prog, p);
  }

  function refreshStats() {
    const rows = get(session, []);
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

    const prog = get(`progress:${puzzle}/${setName}`, {});
    const entries = Object.entries(prog).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    breakdown.textContent = '';
    if (!entries.length) {
      breakdown.appendChild(el('p', 'muted', 'No cases drilled yet.'));
      return;
    }
    const max = entries[0][1];
    for (const [id, n] of entries.slice(0, 8)) {
      const row = el('div', 'breakdown-row');
      const left = el('div');
      left.textContent = `${id}`;
      const bar = el('div', 'bar');
      const fill = el('i');
      fill.style.width = `${Math.max(6, Math.round((n / max) * 100))}%`;
      bar.appendChild(fill);
      left.appendChild(bar);
      row.appendChild(left);
      row.appendChild(el('span', null, String(n)));
      breakdown.appendChild(row);
    }
  }

  refreshStats();
  onPageLeave(cleanup);
  return container;
}
