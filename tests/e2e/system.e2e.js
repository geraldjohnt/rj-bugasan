/*
 * E2E: Phase 11 (opening balances, activity log, backup reminder, download and restore) in demo mode (Firebase config
 * forced to null), opened via file://.  Usage: node tests/e2e/system.e2e.js [build|dist] [screenshotDir]
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const folder = path.resolve(process.argv[2] || 'build');
const shots = process.argv[3];
const url = 'file://' + path.join(folder, 'index.html');
const results = [];
let failed = 0;
async function step(name, fn) {
  try { await fn(); results.push(`PASS ${name}`); }
  catch (e) { failed++; results.push(`FAIL ${name}\n     ${String(e.message).split('\n')[0]}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true });
await context.addInitScript(() => {
  Object.defineProperty(window, 'RJ_FIREBASE_CONFIG', { configurable: false, get: () => null, set: () => {} });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = async (name) => { if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: true }); } };

const field = (label, scope = '.dialog') => page.locator(`${scope} .field`).filter({ has: page.locator('.field-label', { hasText: new RegExp('^' + label) }) }).locator('input, select, textarea').first();
const toast = (text) => page.waitForSelector(`.toast:has-text("${text}")`);

/** D-057: sample data loads only from Settings → System, after re-entering the password. */
async function loadSample() {
  if (!page.url().includes('#/settings/system')) await page.goto(url + '#/settings/system');
  await page.click('.panel button:has-text("Load sample data")');
  await page.fill('.dialog input[autocomplete="current-password"]', 'demo1234');
  await page.click('.dialog-footer button:has-text("Load sample data")');
}
const stat = async (label) => (await page.locator('.stat').filter({ has: page.locator('.stat-label', { hasText: new RegExp('^' + label + '$') }) }).locator('.stat-value').textContent()).trim();
async function pick(input, text) {
  await input.click();
  await input.fill(text);
  await page.locator('.combobox-option:not(.is-disabled)', { hasText: text }).first().click();
}
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rj-e2e-'));
let backupPath, obId;

await step('Sign in, load sample data; dashboard reminds that no backup exists', async () => {
  await page.goto(url + '#/');
  await page.fill('input[autocomplete="username"]', 'owner');
  await page.fill('input[autocomplete="current-password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForSelector('h1:has-text("Dashboard")');
  await loadSample();
  await toast('opening balance(s)');
  await page.goto(url + '#/');
  await page.waitForSelector('.banner:has-text("No backup has been downloaded yet")');
});

await step('Opening balances page: sample entries listed with totals; not in the Sales list', async () => {
  await page.goto(url + '#/opening-balances');
  await page.waitForSelector('h1:has-text("Opening balances")');
  await page.waitForSelector('tbody tr:has-text("OB-")');
  expect(await page.locator('tbody tr').count() === 2, 'two sample OBs');
  expect(await stat('Carried over') === '₱6,450.00', 'carried ' + await stat('Carried over'));
  expect(await stat('Still to collect') === '₱5,950.00', 'to collect ' + await stat('Still to collect'));
  await page.goto(url + '#/sales');
  await page.waitForSelector('tbody tr');
  expect(!(await page.isVisible('tbody tr:has-text("OB-")')), 'OB shown in Sales list');
});

await step('Add opening balance: validation, 2 installments split evenly, opens its page', async () => {
  await page.goto(url + '#/opening-balances');
  await page.click('.page-header button:has-text("Add opening balance")');
  await page.waitForSelector('.dialog:has-text("Add opening balance")');
  await page.click('.dialog-footer button:has-text("Add opening balance")');
  await page.waitForSelector('.dialog .field-error:has-text("Choose the customer")');
  await pick(page.locator('.dialog input[role="combobox"]'), 'Josie Reyes');
  await field('Original sale date').fill(addDays(TODAY, -60));
  await field('Remaining balance').fill('3001');
  await field('Description').fill('2 sacks Dinorado from the Excel ledger');
  await page.locator('.dialog .segmented-option:has-text("2")').click();
  await field('Installment 1 due').fill(addDays(TODAY, 5));
  await page.click('.dialog button:has-text("Split evenly")');
  expect(await field('Installment 1 amount').inputValue() === '1500.00' || await field('Installment 1 amount').inputValue() === '1500', 'amount 1 ' + await field('Installment 1 amount').inputValue());
  expect(await field('Installment 2 amount').inputValue().then((v) => Number(v) === 1501), 'amount 2');
  expect((await field('Installment 2 due').inputValue()) !== '', 'second date filled');
  await shot('70-opening-balance-dialog');
  await page.click('.dialog-footer button:has-text("Add opening balance")');
  await toast('Opening balance OB-');
  await page.waitForSelector('h1:has-text("OB-")');
  obId = (await page.locator('h1').innerText()).match(/OB-\d{4}-\d{5}/)[0];
  await page.waitForSelector('.banner:has-text("does not count as revenue")');
  expect(await stat('Balance') === '₱3,001.00', 'balance ' + await stat('Balance'));
  expect(!(await page.isVisible('.page-header button:has-text("Delivery")')), 'no delivery for OB');
  expect(await page.locator('.panel:has(.panel-title:has-text("Installment schedule")) tbody tr').count() === 2, 'two rows');
});

await step('Record a payment on the opening balance; it shows in Collections', async () => {
  await page.click('.page-header button:has-text("Record payment")');
  await field('Amount received').fill('1500');
  await page.click('.dialog-footer button:has-text("Record payment")');
  await toast('recorded');
  await page.waitForSelector('.stat:has-text("Balance") .stat-value:text-is("₱1,501.00")');
  await page.goto(url + '#/collections/later');
  await page.goto(url + '#/collections');
  await page.waitForSelector('h1:has-text("Collections")');
  await page.waitForSelector(`text=${obId}`, { timeout: 4000 }).catch(async () => {
    for (const t of ['week', 'later']) { await page.goto(url + '#/collections/' + t); if (await page.isVisible(`text=${obId}`)) return; }
    throw new Error('OB not in collections');
  });
});

await step('Customer page: Opening balance button preselects the customer', async () => {
  await page.goto(url + '#/customers');
  await page.click('tbody a:has-text("Carmen Dela Cruz")');
  await page.click('.page-header button:has-text("Opening balance")');
  await page.waitForSelector('.dialog:has-text("Add opening balance")');
  await page.waitForFunction(() => (document.querySelector('.dialog input[role="combobox"]') || {}).value?.includes('Carmen'), null, { timeout: 5000 })
    .catch(() => { throw new Error('customer preselected'); });
  await page.click('.dialog-footer button:has-text("Cancel")');
});

await step('Activity log: newest first, area filter, search, links to the record', async () => {
  await page.goto(url + '#/activity');
  await page.waitForSelector('h1:has-text("Activity log")');
  await page.waitForSelector('tbody tr');
  const first = await page.locator('tbody tr').first().innerText();
  expect(/Payment/i.test(first), 'newest first: ' + first.slice(0, 80));
  await page.locator('.toolbar select').first().selectOption('sale');
  await page.waitForSelector(`tbody tr:has-text("Opening balance ${obId}")`);
  expect(!(await page.isVisible('tbody tr:has-text("Added item")')), 'items not filtered out');
  await page.fill('.toolbar input[type="search"]', obId);
  await page.waitForTimeout(100);
  expect(await page.locator('tbody tr').count() >= 1, 'search');
  await shot('71-activity-log');
  await page.click(`tbody a:has-text("${obId}")`);
  await page.waitForSelector(`h1:has-text("${obId}")`);
});

await step('Backup: download a file that contains everything; reminder goes away', async () => {
  await page.goto(url + '#/backup');
  await page.waitForSelector('h1:has-text("Backup")');
  await page.waitForSelector('text=No backup has been downloaded yet');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Download backup")')]);
  backupPath = path.join(tmp, dl.suggestedFilename());
  await dl.saveAs(backupPath);
  expect(/^rj-bugasan-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(dl.suggestedFilename()), 'name ' + dl.suggestedFilename());
  const b = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  expect(b.app === 'rj-ims' && b.counts.sales >= 9 && b.counts.items === 9 && b.collections.sales.some((s) => s.id === obId), 'content ' + JSON.stringify(b.counts));
  expect(!b.collections.settings.some((s) => s.id === 'bootstrap'), 'bootstrap exported');
  await toast('Backup downloaded');
  await page.waitForSelector('text=Last backup:');
  await page.goto(url + '#/');
  await page.waitForSelector('h1:has-text("Dashboard")');
  await page.waitForTimeout(200);
  expect(!(await page.isVisible('.banner:has-text("backup")')), 'reminder still shown');
});

await step('Restore: wrong file refused; typed RESTORE required; data returns to the backup', async () => {
  // change something after the backup: add an expense
  await page.goto(url + '#/expenses');
  await page.click('.page-header button:has-text("Add expense")');
  await field('Amount').fill('999');
  await page.click('.dialog-footer button:has-text("Add expense")');
  await toast('Expense of ₱999.00');

  await page.goto(url + '#/backup');
  const bad = path.join(tmp, 'notes.json');
  fs.writeFileSync(bad, '{"hello": 1}');
  await page.setInputFiles('#backup-file', bad);
  await page.waitForSelector('.banner:has-text("not a backup from this system")');
  await page.setInputFiles('#backup-file', backupPath);
  await page.waitForSelector('text=Records in the backup');
  await page.waitForSelector('td:has-text("Sales and opening balances")');
  await page.click('button:has-text("Restore this backup")');
  await page.waitForSelector('.dialog:has-text("Restore this backup?")');
  await field('Type RESTORE').fill('restore');
  await page.click('.dialog-footer button:has-text("Restore backup")');
  await page.waitForSelector('.dialog .banner:has-text("Type RESTORE")');
  await shot('72-restore-confirm');
  await field('Type RESTORE').fill('RESTORE');
  await page.click('.dialog-footer button:has-text("Restore backup")');
  await toast('Backup restored');
  await page.goto(url + '#/expenses');
  await page.waitForSelector('h1:has-text("Expenses")');
  await page.waitForTimeout(200);
  expect(!(await page.isVisible('td:has-text("₱999.00")')), 'expense after backup still there');
  await page.goto(url + `#/sales/${obId}`);
  await page.waitForSelector('.stat:has-text("Balance") .stat-value:text-is("₱1,501.00")');
  await page.goto(url + '#/activity');
  await page.waitForSelector('tbody tr:has-text("Restored the backup")');
});

await step('Phone width: new screens do not overflow sideways', async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  for (const p of ['#/opening-balances', '#/activity', '#/backup']) {
    await page.goto(url + p);
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow <= 0, `${p} overflow: ${overflow}px`);
  }
  await page.setViewportSize({ width: 1366, height: 860 });
});

await step('User guide: opens from the user menu, works offline from the folder', async () => {
  await page.goto(url + '#/');
  await page.click('.user-button');
  const [guide] = await Promise.all([context.waitForEvent('page'), page.click('.menu-item:has-text("User guide")')]);
  await guide.waitForSelector('h1:has-text("User Guide")');
  expect(await guide.isVisible('text=Backup and restore'), 'guide content');
  expect(await guide.isVisible('text=2, 3, 4 or 5 payments'), 'guide mentions 2-payment plans');
  await guide.close();
});

await step('No JavaScript errors during the run', async () => { expect(!errors.length, errors.join(' | ')); });

await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(results.join('\n'));
console.log(failed ? `\nE2E FAILED: ${failed} step(s)` : '\nE2E PASSED');
process.exit(failed ? 1 : 0);
