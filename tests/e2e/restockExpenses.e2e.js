/*
 * E2E: Phase 14 (restock expenses D-060 … D-062, edit a received delivery D-063, new item from the order form D-064)
 * in demo mode (Firebase config forced to null), opened via file://.  Usage: node tests/e2e/restockExpenses.e2e.js [build|dist] [screenshotDir]
 */
import path from 'node:path';
import fs from 'node:fs';
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
const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
await context.addInitScript(() => {
  Object.defineProperty(window, 'RJ_FIREBASE_CONFIG', { configurable: false, get: () => null, set: () => {} });
  window.__printed = [];
  window.print = () => { const r = document.querySelector('.print-root'); window.__printed.push(r ? r.innerText : ''); window.dispatchEvent(new Event('afterprint')); };
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
const receiveRow = (name) => page.locator('.dialog .receive-row', { has: page.locator(`strong:text-is("${name}")`) });
const NEW = 'Test Premium 50kg Sack';
let rid = '';

await step('Sign in and load sample data', async () => {
  await page.goto(url + '#/settings/system');
  await page.fill('input[autocomplete="username"]', 'owner');
  await page.fill('input[autocomplete="current-password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.panel button:has-text("Load sample data")');
  await loadSample();
  await toast('Sample data loaded');
});

await step('Expenses page: sample restock expenses are linked to their restock and cannot be voided there', async () => {
  await page.goto(url + '#/expenses');
  await page.locator('.toolbar .field').filter({ has: page.locator('.field-label', { hasText: /^Category/ }) }).locator('select').selectOption('Restock');
  await page.locator('.toolbar input[type="date"]').first().fill('');
  await page.waitForSelector('.table td a:has-text("Restock RS-")');
  const rows = page.locator('.table tbody tr');
  expect(await rows.count() >= 3, 'restock expense rows: ' + await rows.count());
  expect(await page.locator('.table tbody tr button[aria-label^="Void"]').count() === 0, 'restock expenses must not have a void button');
  expect((await page.locator('.table').innerText()).includes('Trucking'), 'Trucking shown');
});

await step('New restock: "New item" opens the full item form and puts the new item on the line', async () => {
  await page.goto(url + '#/restocks/new');
  await pick(page.locator('.field').filter({ has: page.locator('.field-label', { hasText: /^Supplier/ }) }).locator('input'), 'Golden Grains');
  await page.click('.panel-footer button:has-text("New item")');
  await page.waitForSelector('.dialog .field-label:has-text("Sack weight")');
  await field('Item name').fill(NEW);
  await field('Cash price').fill('2800');
  await field('Cost per').fill('2500');
  await page.click('.dialog-footer button:has-text("Add item")');
  await toast(`${NEW} added`);
  await page.waitForSelector('.dialog', { state: 'detached' });
  await page.waitForFunction((n) => document.querySelector('.sale-line input[role="combobox"]').value.includes(n), NEW);
  const cost = await page.locator('.sale-line').first().locator('.sale-line-price input').inputValue();
  expect(cost.startsWith('2500'), 'unit cost prefilled from the new item: ' + cost);
  await page.locator('.sale-line').first().locator('.sale-line-qty input').fill('150');
  await page.locator('.sale-line').first().locator('.sale-line-price input').fill('2500');
  await shot('01-order-with-new-item');
  await page.click('button:has-text("Save order")');
  await page.waitForSelector('h1:has-text("RS-")');
  rid = (await page.locator('h1').innerText()).match(/RS-\d{4}-\d{5}/)[0];
});

await step('Receive: expenses ₱6,000 on 150 sacks show ₱40 per sack, cost incl. expenses ₱2,540 and profit ₱260', async () => {
  await page.click('button:has-text("Receive goods")');
  const row = receiveRow(NEW);
  await row.waitFor();
  await row.locator('input[aria-label^="Cash price"]').fill('2800');
  await page.click('.dialog button:has-text("Add expense")');
  await page.fill('.dialog input[aria-label="Expense 1"]', 'Trucking');
  await page.fill('.dialog input[aria-label="Expense amount 1"]', '4000');
  await page.click('.dialog button:has-text("Add expense")');
  await page.fill('.dialog input[aria-label="Expense 2"]', 'Labor');
  await page.fill('.dialog input[aria-label="Expense amount 2"]', '2000');
  const txt = await row.locator('.landed-cost').innerText();
  expect(txt.includes('₱40.00') && txt.includes('₱2,540.00') && txt.includes('₱260.00'), 'landed: ' + txt);
  expect((await page.locator('.dialog .summary-box').innerText()).includes('₱381,000.00'), 'total incl. expenses');
  await shot('02-receive-with-expenses');
  await page.click('.dialog-footer button:has-text("Receive and add to stock")');
  await toast('Expenses of ₱6,000.00 recorded');
  expect(await stat('Expenses') === '₱6,000.00', 'expenses stat: ' + await stat('Expenses'));
  expect((await page.locator('.table').nth(1).innerText()).includes('Trucking ₱4,000.00'), 'delivery row lists expenses');
});

await step('Batch cost stays ₱2,500 (show only, D-061)', async () => {
  await page.goto(url + '#/items');
  await page.click(`a:text-is("${NEW}")`);
  await page.waitForSelector(`h1:has-text("${NEW}")`);
  const body = await page.locator('main').innerText();
  expect(body.includes('₱2,500.00') && !body.includes('₱2,540.00'), 'batch cost unchanged');
});

await step('Edit the received delivery: new cost and expenses; Expenses page follows (update in place, removed = voided)', async () => {
  await page.goto(url + '#/restocks/' + rid);
  await page.click('.table button:has-text("Edit")');
  await page.waitForSelector('.dialog:has-text("Edit delivery")');
  await receiveRow(NEW).locator('input[aria-label^="Unit cost"]').fill('2550');
  await page.fill('.dialog input[aria-label="Expense amount 1"]', '4500');
  await page.click('.dialog button[aria-label="Remove expense 2"]');
  // suggestions: names used before are offered
  const opts = await page.locator('#restock-expense-names option').evaluateAll((os) => os.map((o) => o.value));
  expect(opts.includes('Trucking') && opts.includes('Labor'), 'suggestions: ' + opts.join(','));
  expect((await receiveRow(NEW).locator('.landed-cost').innerText()).includes('₱2,580.00'), 'landed after edit');
  await shot('03-edit-delivery');
  await page.click('.dialog-footer button:has-text("Save changes")');
  await toast('updated');
  expect(await stat('Expenses') === '₱4,500.00', 'expenses stat after edit: ' + await stat('Expenses'));
  expect((await page.locator('.table').nth(1).innerText()).includes('₱2,550.00'), 'delivery cost updated');
  await page.goto(url + '#/expenses');
  await page.locator('.toolbar .field').filter({ has: page.locator('.field-label', { hasText: /^Status/ }) }).locator('select').selectOption('');
  await page.waitForSelector(`.table td a:has-text("Restock ${rid}")`);
  const t = await page.locator('.table').innerText();
  expect(t.includes('₱4,500.00'), 'trucking updated in place');
  expect(t.includes(`Removed from restock ${rid}`), 'labor voided');
});

await step('Add expense on the Expenses page does not offer the Restock category', async () => {
  await page.click('.page-header button:has-text("Add expense")');
  const opts = await page.locator('.dialog select').evaluate((s) => [...s.options].map((o) => o.value));
  expect(!opts.includes('Restock'), 'Restock must not be offered: ' + opts.join(','));
  await page.click('.dialog-footer button:has-text("Cancel")');
});

await step('Phone width: the edit-delivery dialog with expenses does not overflow sideways', async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(url + '#/restocks/' + rid);
  await page.click('.table button:has-text("Edit")');
  await page.waitForSelector('.dialog .landed-cost');
  const o = await page.evaluate(() => { const d = document.querySelector('.dialog'); return Math.max(document.documentElement.scrollWidth - window.innerWidth, d.scrollWidth - d.clientWidth); });
  await shot('04-phone-edit-delivery');
  expect(o <= 1, 'overflow ' + o + 'px');
  await page.click('.dialog-footer button:has-text("Cancel")');
  await page.setViewportSize({ width: 1366, height: 860 });
});

await step('No console errors', async () => { expect(!errors.length, errors.join('\n')); });

await browser.close();
console.log(results.join('\n'));
console.log(failed ? `\n${failed} step(s) FAILED` : `\nAll ${results.length} steps passed`);
process.exit(failed ? 1 : 0);
