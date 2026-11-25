/*
 * Smoke test: opens <folder>/index.html via file:// in Chromium with the network DISABLED and verifies the app
 * starts with no errors and makes no network requests. Usage: node tests/smoke/dist-smoke.js dist|build
 * Required before every release PR (D-018).
 */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const folder = path.resolve(process.argv[2] || 'dist');
const indexFile = path.join(folder, 'index.html');
if (!fs.existsSync(indexFile)) { console.error(`Missing ${indexFile} — build first.`); process.exit(1); }

const failures = [];
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => failures.push(`Page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') failures.push(`Console error: ${m.text()}`); });
  page.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) failures.push(`Network request attempted: ${r.url()}`); });
  page.on('requestfailed', (r) => { if (r.url().startsWith('file://')) failures.push(`Missing local file: ${r.url()}`); });

  await page.goto('file://' + indexFile);
  await page.waitForSelector('[data-app-ready="true"]', { timeout: 15000 });

  const checks = await page.$$eval('[data-check]', (rows) => rows.map((r) => [r.dataset.check, r.dataset.status, r.lastElementChild.textContent]));
  for (const [name, status, detail] of checks) {
    console.log(`  ${status.padEnd(4)} ${name}: ${detail}`);
    if (status === 'fail') failures.push(`Environment check failed: ${name} (${detail})`);
  }
  const offlineBanner = await page.isVisible('text=Offline — viewing saved data');
  if (!offlineBanner) failures.push('Offline banner not shown while offline');
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\nSMOKE TEST FAILED (${folder}):\n - ` + failures.join('\n - '));
  process.exit(1);
}
console.log(`\nSMOKE TEST PASSED: ${folder}/index.html runs from file:// with no network.`);
