// Browser test: verify the solver actually solves the cube in the browser
// end-to-end (no cancel). Uses short scrambles so IDA* is fast.
// Usage: node tests/solvebrowser.mjs [url] [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://localhost:9101/';
const outDir = process.argv[3] || 'solve_shots';
mkdirSync(outDir, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.EXE || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  page.on('console', (msg) => console.log('[browser-console]', msg.type, msg.text));
  page.on('page_error', (err) => console.log('[page_error]', err.message));
  await page.goto(url, { waitUntil: 'networkidle' });

  async function status() { return (await page.locator('#solver-status').textContent()).trim(); }
  async function count() { return (await page.locator('#move-count').textContent()).trim(); }
  async function badge() { return (await page.locator('#solved-badge').textContent()).trim(); }

  // Wait for solver ready.
  for (let i = 0; i < 200; i++) {
    const t = await status();
    if (t.includes('ready')) { console.log('ready:', t); break; }
    await page.waitForTimeout(700);
  }

  // --- case 1: keyboard R U R' U' then Solve --------------------------
  for (const k of ['KeyR', 'KeyU', 'Shift+KeyR', 'Shift+KeyU']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(320);
  }
  await page.waitForTimeout(900);
  console.log('case1 moves:', await count(), 'badge:', await badge());
  await page.locator('#btn-solve').click();
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1200);
    const s = await status();
    console.log('case1 status:', s);
    if (s.includes('Solved') || s.includes('solved') || s.includes('no solution')) break;
  }
  await page.waitForTimeout(5000);
  console.log('case1 after:', await status(), 'moves:', await count(), 'badge:', await badge());
  await page.screenshot({ path: `${outDir}/c1_solved.png` });

  // --- case 2: keyboard-only scramble (short) then Solve --------------------
  await page.locator('#btn-reset').click();
  await page.waitForTimeout(700);
  for (const k of ['KeyR', 'KeyU', 'KeyF', 'Shift+KeyD', 'KeyL', 'Shift+KeyB', 'KeyU', 'Shift+KeyR', 'KeyF', 'KeyD', 'Shift+KeyL', 'KeyB']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(280);
  }
  await page.locator('#btn-solve').click();
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1200);
    const s = await status();
    if (s.includes('Solved') || s.includes('solved')) break;
  }
  await page.waitForTimeout(4000);
  console.log('case2 after:', await status(), 'moves:', await count(), 'badge:', await badge());
  await page.screenshot({ path: `${outDir}/c2_solved.png` });

  // --- case 3: whole-cube x' then Solve (already solved visually) ---------
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(600);
  console.log('case3 badge (should be SOLVED):', await badge());

  // --- case 4: real 20-move Scramble, then Solve, expect Cancel --------
  await page.locator('#btn-reset').click();
  await page.waitForTimeout(700);
  await page.locator('#btn-scramble').click();
  await page.waitForTimeout(6000);
  console.log('case4 moves:', await count(), 'badge:', await badge());
  await page.locator('#btn-solve').click();
  await page.waitForTimeout(4000);
  console.log('case4 solving:', await status());
  // wait 15s then Cancel
  await page.waitForTimeout(15000);
  try { await page.locator('#btn-cancel').click({ timeout: 5000 }); } catch {}
  await page.waitForTimeout(3000);
  console.log('case4 after cancel:', await status());
  await page.screenshot({ path: `${outDir}/c4_cancelled.png` });

  // --- case 5: Scramble + Solve with generous wait and NO cancel:
  //        if the solver takes minutes, this is documented and Cancel above
  //        covers it; here we just check the status line keeps updating.
  await page.locator('#btn-reset').click();
  await page.waitForTimeout(700);
  await page.locator('#btn-scramble').click();
  await page.waitForTimeout(6000);
  await page.locator('#btn-solve').click();
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(4000);
    console.log('case5 status:', await status());
  }
  await page.screenshot({ path: `${outDir}/c5_scramble_solving.png` });

  await browser.close();
}

main().catch((e) => { console.log('FAIL:', e.message); process.exit(1); });
