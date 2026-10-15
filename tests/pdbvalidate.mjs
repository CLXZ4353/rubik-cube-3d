// Playwright E2E for PDB validation: the worker must use the fetched tables when
// data/pdb_meta.json matches, and must NOT use them when the manifest says they
// are stale (bad v) or the bytes are not what the manifest claims (bad hash).
// Run with: node tests/pdbvalidate.mjs

import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const port = 8200 + (process.pid % 100);
const base = `http://localhost:${port}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REJECTED = /pre-computed ones rejected/;

async function statusTrail(page, waitMs) {
  // The status line is rewritten as the worker posts progress; collect labels.
  const seen = [];
  for (let t = 0; t < waitMs; t += 500) {
    seen.push((await page.locator('#solver-status').textContent()).trim());
    await page.waitForTimeout(500);
  }
  return seen.join(' | ');
}

async function loadOnce() {
  const browser = await chromium.launch({ executablePath: process.env.EXE || undefined });
  const page = await browser.newPage({ viewport: { width: 700, height: 500 } });
  await page.goto(base, { waitUntil: 'networkidle' });
  const trail = await statusTrail(page, 12000);
  await browser.close();
  return trail;
}

function tamper(fn) {
  const m = JSON.parse(readFileSync('data/pdb_meta.json', 'utf8'));
  if (fn) fn(m);
  writeFileSync('data/pdb_meta.json', JSON.stringify(m, null, 1) + '\n');
}

async function main() {
  const server = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(port) } });
  let n = 0;
  const ok = (c, msg) => { assert.ok(c, msg); n++; console.log('ok:', msg); };
  try {
  await sleep(1500);

  let trail = await loadOnce();
  console.log('fresh:', trail);
  ok(!REJECTED.test(trail), 'fresh manifest: tables fetched, no fallback');

  tamper((m) => { m.files['jointCE_qsym.pdb'].hash = 'deadbeef'; });
  trail = await loadOnce();
  console.log('bad hash:', trail);
  ok(REJECTED.test(trail), 'bad hash: jointCE rejected -> rebuilt, never wrong pruning');

  tamper((m) => { m.files['jointCE.pdb'].v = 'zzzzzz'; });
  trail = await loadOnce();
  console.log('stale v:', trail);
  ok(REJECTED.test(trail), 'stale v: jointCE rejected -> rebuilt');
  } finally {
    // never leave a tampered manifest behind, even when an assertion failed
    tamper(null);
    console.log('restore:', spawnSync('node', ['tests/pdb_manifest.mjs'], { stdio: 'inherit' }).stdout);
    server.kill();
  }
  console.log(`pdbvalidate: ${n} assertions ok`);
}

main().catch((e) => { console.log('FAIL:', e.message); process.exit(1); });
