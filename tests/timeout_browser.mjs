// Playwright E2E for the timer changes: Solve auto-stops the clock, and
// running out fires a red "TIMEOUT" pop (same style as the solve "GG").
// Usage: node tests/timeout_browser.mjs http://localhost:8123/ shots_timeout

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const url = process.argv[2] || 'http://localhost:8123/';
const out = process.argv[3] || 'shots_timeout';
mkdirSync(out, { recursive: true });

let n = 0;
function ok(cond, msg) { assert.ok(cond, msg); n++; console.log('ok:', msg); }

async function timerText(page) {
  return (await page.locator('#timer').textContent()).trim();
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.EXE || undefined });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await page.goto(url, { waitUntil: 'networkidle' });

  // wait for the solver to be ready so Solve is clickable
  for (let i = 0; i < 200; i++) {
    const t = (await page.locator('#solver-status').textContent()).trim();
    if (t.includes('ready')) break;
    await page.waitForTimeout(700);
  }

  // --- Solve auto-stops a running countdown ------------------------------
  await page.locator('#btn-time-down').click();          // 60s -> 55s
  await page.locator('#btn-start').click();
  ok(!((await timerText(page))).includes('0:00'), 'countdown started');
  await page.locator('#btn-scramble').click();
  await page.waitForTimeout(6000); // let the scramble animate in before solving
  await page.locator('#btn-solve').click();
  let gg = null;
  for (let i = 0; i < 120 && !gg; i++) { // solve playback ends with the GG pop
    await page.waitForTimeout(250);
    gg = await page.evaluate(() => {
      const el = document.querySelector('.gg-pop');
      return el && { t: el.textContent, anim: getComputedStyle(el).animationName };
    });
  }
  ok(gg && gg.t === 'GG' && gg.anim === 'gg-pop', 'solve still pops GG with the same animation');
  await page.waitForTimeout(400); // a bit into the pop, where it is solid
  await page.screenshot({ path: `${out}/gg.png` });
  await page.waitForTimeout(2500);
  const afterSolve = await timerText(page);
  await page.waitForTimeout(2500);
  ok(await timerText(page) === afterSolve, 'Solve froze the clock (no time lost while solving)');
  ok(!await page.locator('#btn-stop').isVisible(), 'Stop button hidden once the clock is frozen');

  // --- a solved cube freezes the clock too (Reset snaps it solved) --------
  await page.locator('#btn-scramble').click();
  await page.locator('#btn-start').click();
  await page.waitForTimeout(800);
  await page.locator('#btn-reset').click();
  const frozen = await timerText(page);
  await page.waitForTimeout(2500);
  ok(await timerText(page) === frozen, 'solving the cube auto-stopped the clock');

  // --- running out fires the TIMEOUT pop ---------------------------------
  for (let i = 0; i < 10; i++) await page.locator('#btn-time-down').click();
  await page.locator('#btn-start').click();
  await page.waitForTimeout(5600);                     // 5s limit + ~0.6s into the pop
  const pop = await page.evaluate(() => {
    const el = document.querySelector('.timeout-pop');
    return el && { text: el.textContent, color: getComputedStyle(el).color, anim: getComputedStyle(el).animationName };
  });
  ok(pop && pop.text === 'TIMEOUT', 'TIMEOUT pop shown at 0:00');
  ok(pop.anim === 'gg-pop', 'TIMEOUT uses the same pop animation as GG');
  ok(pop.text && (await timerText(page)) === 'Timer 0:00', 'readout pinned at 0:00');
  ok((await page.locator('#timer').evaluate((e) => e.className)).includes('low'), 'readout turns red');
  await page.screenshot({ path: `${out}/timeout.png` });

  await browser.close();
  console.log(`timeout_browser: ${n} assertions ok`);
}

main().catch((e) => { console.log('FAIL:', e.message); process.exit(1); });
