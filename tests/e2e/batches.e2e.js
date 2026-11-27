/*
 * E2E: Phase 13 (restock batches oldest first, batch ids, weighted price, owner batch pick, batch edits, other charges on
 * a sale) in demo mode, opened via file://.  Usage: node tests/e2e/batches.e2e.js [build|dist] [screenshotDir]
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
const stat = async (label) => (await page.locator('.stat').filter({ has: page.locator('.stat-label', { hasText: new RegExp('^' + label + '$') }) }).locator('.stat-value').textContent()).trim();
const money = (s) => Number(String(s).replace(/[^\d.−-]/g, '').replace('−', '-'));
async function pick(input, text) {
  await input.click();
  await input.fill(text);
  await page.locator('.combobox-option:not(.is-disabled)', { hasText: text }).first().click();
}
const lineItem = (n) => page.locator('.sale-line').nth(n - 1).locator('input[role="combobox"]');
const lineQty = (n) => page.locator('.sale-line').nth(n - 1).locator('.sale-line-qty input');
const linePrice = (n) => page.locator('.sale-line').nth(n - 1).locator('.sale-line-price input');
async function itemRow(name) {
  await page.goto(url + '#/items');
  const row = page.locator('tr', { has: page.locator(`a:text-is("${name}")`) });
  await row.waitFor();
  return row.innerText();
}
const sacksIn = (text) => Number((/(\d+) sacks?/.exec(text) || [])[1]);


/** Batch rows on an item page: [{ id, qty, cost, price }] (oldest first). */
async function batchRows() {
  const panel = page.locator('.panel', { has: page.locator('.panel-title:text-is("Batches")') });
  await panel.locator('tbody tr').first().waitFor();
  const rows = await panel.locator('tbody tr').all();
  const out = [];
  for (const r of rows) {
    const cells = await r.locator('td').allInnerTexts();
    out.push({ id: cells[0].split('\n')[0].trim(), qty: sacksIn(cells[2]), cost: money(cells[4]), price: money(cells[5]) });
  }
  return out;
}
async function openItem(name) {
  await page.goto(url + '#/items');
  await page.click(`.table a:text-is("${name}")`);
  await page.waitForSelector(`h1:has-text("${name}")`);
}
let newBatch = null, rows0 = null;
const TODAY_YEAR = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date());

await step('Sign in and load sample data; suppliers have codes', async () => {
  await page.goto(url + '#/items');
  await page.fill('input[autocomplete="username"]', 'owner');
  await page.fill('input[autocomplete="current-password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.click('.empty-state button:has-text("Load sample data")');
  await page.click('.dialog-footer button:has-text("Load sample data")');
  await toast('Sample data loaded');
  await page.goto(url + '#/suppliers');
  await page.waitForSelector('.table .cell-sub:text-is("SUP001")');
  await page.waitForSelector('.table .cell-sub:text-is("SUP003")');
});

await step('Sample: NFA has its newer batch; the sample sale spans two batches and carries a delivery fee', async () => {
  await openItem('NFA Well-milled 50kg Sack');
  const rows = await batchRows();
  expect(rows.length === 1 && rows[0].id.startsWith('RJ-RS-SUP002-') && rows[0].price === 2350, 'NFA batches ' + JSON.stringify(rows));
  // Find the sample sale with the delivery fee (sale numbers RJ-YYYY-00001 …).
  let found = null;
  for (let n = 1; n <= 12 && !found; n++) {
    const id = `RJ-${TODAY_YEAR}-${String(n).padStart(5, '0')}`;
    await page.goto(url + '#/sales/' + id);
    await page.waitForSelector('h1');
    await page.waitForTimeout(150);
    if (await page.isVisible('.panel-footer:has-text("Delivery fee")')) found = id;
  }
  const href = found;
  expect(await page.isVisible('.panel-footer:has-text("Delivery fee")'), 'delivery fee not shown (' + href + ')');
  expect((await page.locator('.cell-line').count()) === 2, 'expected the line to show 2 batches');
  await shot('70-sale-batches');
});

await step('Receive a restock at a new cost and cash price: one batch id for the delivery, item defaults kept', async () => {
  await openItem('Dinorado 50kg Sack');
  rows0 = await batchRows();
  await page.goto(url + '#/restocks/new');
  await pick(page.locator('.panel:has(.panel-title:text-is("Supplier and dates")) input[role="combobox"]'), 'Golden Grains Trading');
  await pick(lineItem(1), 'Dinorado 50kg Sack');
  await lineQty(1).fill('2');
  await linePrice(1).fill('3100');
  await page.click('button:has-text("Save order")');
  await page.waitForSelector('h1:has-text("RS-")');
  await page.click('button:has-text("Receive goods")');
  await page.fill('input[aria-label="Cash price Dinorado 50kg Sack"]', '3500');
  const box = page.locator('.dialog label.checkbox:has-text("default cost and price") input');
  if (await box.isChecked()) await box.uncheck();
  await shot('71-receive-price');
  await page.click('.dialog-footer button:has-text("Receive and add to stock")');
  const t = await (await toast('as batch RJ-RS-SUP001-')).innerText();
  newBatch = /RJ-RS-SUP001-\d{4}/.exec(t)[0];
  await page.waitForSelector(`td:text-is("${newBatch}")`);
});

await step('Item page: newest batch last; shown price is the oldest batch with a "next batch" hint', async () => {
  await openItem('Dinorado 50kg Sack');
  const rows = await batchRows();
  const last = rows[rows.length - 1];
  expect(last.id === newBatch && last.price === 3500 && last.cost === 3100 && last.qty === 2, 'new batch ' + JSON.stringify(last));
  expect(money(await stat('Cash price')) === rows[0].price, 'shown price is not the oldest batch');
  expect(await page.isVisible('.stat:has(.stat-label:text-is("Cash price")) :text("next batch ₱3,500.00")'), 'next batch hint missing');
  expect(money(await stat('Default cost')) !== 3100, 'defaults should be kept');
  await shot('72-item-batches');
});

let spanSale = null;
await step('New sale spanning old batches and the new one: weighted price; charge added after the total; saved with batches', async () => {
  const rows = await batchRows();
  const older = rows.slice(0, -1).reduce((s, r) => s + r.qty, 0);
  const qty = older + 1;
  const expectC = Math.round(rows.reduce((s, r, i) => s + (i < rows.length - 1 ? r.qty : 1) * r.price * 100, 0) / qty);
  await page.goto(url + '#/sales/new');
  await pick(lineItem(1), 'Dinorado 50kg Sack');
  await lineQty(1).fill(String(qty));
  await page.waitForSelector(`.sale-line-batch :text("${newBatch} (1 sack)")`);
  const shown = Math.round(money(await linePrice(1).inputValue()) * 100);
  expect(shown === expectC, `weighted price ${shown} vs ${expectC}`);
  await page.click('button:has-text("Add charge")');
  await page.fill('input[aria-label="Charge 1"]', 'Delivery fee');
  await page.fill('input[aria-label="Charge amount 1"]', '75');
  await page.waitForSelector('.summary-box .row:has-text("Delivery fee")');
  const total = money(await page.locator('.summary-box .total-row strong').innerText());
  expect(Math.abs(total - (Math.round(qty * expectC) / 100 + 75)) < 0.001, `total ${total}`);
  await shot('73-new-sale-charge');
  await page.click('button:has-text("Save sale")');
  await page.waitForSelector('h1:has-text("RJ-2026-")');
  spanSale = (await page.locator('h1').innerText()).match(/RJ-\d{4}-\d{5}/)[0];
  expect(await page.isVisible('.panel-footer:has-text("Delivery fee")'), 'charge not on sale');
  expect(await page.isVisible(`.cell-line:has-text("${newBatch}")`), 'new batch not on line');
  await openItem('Dinorado 50kg Sack');
  const after = await batchRows();
  expect(after.length === 1 && after[0].id === newBatch && after[0].qty === 1, 'after sale ' + JSON.stringify(after));
});

await step('Receipt prints the charge', async () => {
  await page.goto(url + '#/sales/' + spanSale);
  await page.click('button:has-text("Print receipt")');
  await page.waitForFunction(() => window.__printed.length > 0);
  const printed = await page.evaluate(() => window.__printed[window.__printed.length - 1]);
  expect(printed.includes('Delivery fee'), 'receipt lacks charge');
});

await step('Cancel puts the stock back into the same batches', async () => {
  await page.click('.page-header button:has-text("Cancel sale")');
  await field('Reason').fill('Test');
  await page.click('.dialog-footer button:has-text("Cancel sale")');
  await toast('cancelled');
  await openItem('Dinorado 50kg Sack');
  const back = await batchRows();
  expect(JSON.stringify(back.map((r) => [r.id, r.qty])) === JSON.stringify([...rows0.map((r) => [r.id, r.qty]), [newBatch, 2]]), 'batches after cancel ' + JSON.stringify(back));
});

await step('Owner picks a batch on a line: its price is used', async () => {
  await page.goto(url + '#/sales/new');
  await pick(lineItem(1), 'Dinorado 50kg Sack');
  await lineQty(1).fill('1');
  await page.locator('select[aria-label="Batch 1"]').selectOption(newBatch);
  await page.waitForFunction(() => document.querySelector('.sale-line-price input').value === '3500.00');
  await page.click('button:has-text("Save sale")');
  await page.waitForSelector('h1:has-text("RJ-2026-")');
  expect(await page.isVisible('.cell-sub:text-is("Picked by hand")'), 'picked flag missing');
});

await step('Edit a batch price; editing the item price can update batches in stock', async () => {
  await openItem('Dinorado 50kg Sack');
  await page.locator('.panel:has(.panel-title:text-is("Batches")) tbody tr').first().locator('button:has-text("Edit")').click();
  await field('Cash price').fill('3333');
  await page.click('.dialog-footer button:has-text("Save")');
  await toast('updated');
  expect(money(await stat('Cash price')) === 3333, 'batch price edit not shown');
  await page.click('.page-header button:has-text("Edit")');
  await field('Cash price').fill('3600');
  expect(await page.isVisible('.dialog label.checkbox:has-text("Also change the cash price") input:checked'), 'reprice option not pre-checked');
  await page.click('.dialog-footer button:has-text("Save changes")');
  await toast('Changes saved.');
  const rows = await batchRows();
  expect(rows.every((r) => r.price === 3600), 'batches not repriced ' + JSON.stringify(rows));
});

await step('Phone width: new sale with charge and item batches do not overflow sideways', async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(url + '#/sales/new');
  await pick(lineItem(1), 'Dinorado 50kg Sack');
  await page.click('button:has-text("Add charge")');
  await page.waitForTimeout(300);
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 0, `new sale overflow: ${overflow}px`);
  await openItem('Dinorado 50kg Sack');
  await page.waitForTimeout(300);
  overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 0, `item overflow: ${overflow}px`);
  await page.setViewportSize({ width: 1366, height: 860 });
});

await step('No JavaScript errors during the run', async () => { expect(!errors.length, errors.join(' | ')); });

await browser.close();
console.log(results.join('\n'));
console.log(failed ? `\nE2E FAILED: ${failed} step(s)` : '\nE2E PASSED');
process.exit(failed ? 1 : 0);
