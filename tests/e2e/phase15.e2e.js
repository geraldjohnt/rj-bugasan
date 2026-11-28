/*
 * E2E: Phase 15 (item expense + credit price at receiving D-065/D-066, automatic SKUs D-067, promised payment dates
 * D-068/D-069) in demo mode (Firebase config forced to null), opened via file://.  Usage: node tests/e2e/phase15.e2e.js [build|dist] [screenshotDir]
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

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const plusDays = (n) => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
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

await step('Items: every item has an automatic SKU (RJ-<variety>-NNN) and the list is searchable by SKU (D-067)', async () => {
  await page.goto(url + '#/items');
  await page.waitForSelector('tr:has-text("Dinorado 50kg Sack") .sku:text-is("RJ-DIN-001")');
  expect(await page.locator('th:text-is("Credit price")').count() === 1, 'Credit price column (renamed from Payday, D-066)');
  await page.fill('.toolbar input[type="search"]', 'rj-jas');
  await page.waitForFunction(() => document.querySelectorAll('.table tbody tr').length === 2);
  const t = await page.locator('.table tbody').innerText();
  expect(t.includes('Jasmine 25kg Sack') && t.includes('Jasmine per KG') && !t.includes('Dinorado'), 'search by SKU: ' + t);
  await shot('01-items-sku');
});

await step('Item form: a used SKU is refused; blank gets an automatic one', async () => {
  await page.goto(url + '#/items');
  await page.click('.page-header button:has-text("Add item")');
  await field('Item name').fill('Dinorado 25kg Sack');
  await field('Variety').fill('Dinorado');
  await field('Sack weight').fill('25');
  await field('Cash price').fill('1700');
  await field('Cost per').fill('1500');
  await field('SKU').fill('rj-din-001');
  await page.click('.dialog-footer button:has-text("Add item")');
  await page.waitForSelector('.dialog .field-error:has-text("already has SKU RJ-DIN-001")');
  await field('SKU').fill('');
  await page.click('.dialog-footer button:has-text("Add item")');
  await toast('added');
  await page.goto(url + '#/items');
  await page.waitForSelector('tr:has-text("Dinorado 25kg Sack") .sku:text-is("RJ-DIN-003")');
});

await step('Restock order: the item picker shows and searches the SKU', async () => {
  await page.goto(url + '#/restocks/new');
  await pick(page.locator('.field').filter({ has: page.locator('.field-label', { hasText: /^Supplier/ }) }).locator('input'), 'Golden Grains');
  const box = page.locator('.sale-line').first().locator('input[role="combobox"]');
  await box.click();
  await box.fill('RJ-DIN-001');
  await page.waitForSelector('.combobox-option:has-text("Dinorado 50kg Sack") .combobox-detail:has-text("RJ-DIN-001")');
  await page.locator('.combobox-option', { hasText: 'Dinorado 50kg Sack' }).first().click();
  await page.waitForSelector('.sale-line .field-help .sku:text-is("RJ-DIN-001")');
  await page.locator('.sale-line').first().locator('.sale-line-qty input').fill('10');
  await page.locator('.sale-line').first().locator('.sale-line-price input').fill('2900');
  await page.click('button:has-text("Save order")');
  await page.waitForSelector('h1:has-text("RS-")');
  rid = (await page.locator('h1').innerText()).match(/RS-\d{4}-\d{5}/)[0];
  await page.waitForSelector('.table .cell-sub.sku:text-is("RJ-DIN-001")');
});

await step('Receive: Received, Unit cost, Expense, Cash price, Credit price; the item expense is in the cost per sack (D-065, D-066)', async () => {
  await page.click('button:has-text("Receive goods")');
  const row = receiveRow('Dinorado 50kg Sack');
  await row.waitFor();
  const labels = await row.locator('.field-label').allInnerTexts();
  expect(['Received', 'Unit cost', 'Expense', 'Cash price', 'Credit price'].every((l, i) => labels[i] && labels[i].startsWith(l)), 'fields: ' + labels.join(' | '));
  expect((await row.locator('input[aria-label^="Credit price"]').inputValue()).startsWith('3500'), 'credit price prefilled from the item');
  await row.locator('input[aria-label^="Expense"]').fill('500');
  await row.locator('input[aria-label^="Cash price"]').fill('3300');
  await row.locator('input[aria-label^="Credit price"]').fill('3600');
  await row.locator('.field-help:has-text("Updates the item")').waitFor();
  // other expenses of the delivery stay below the items (split by value)
  await page.click('.dialog button:has-text("Add expense")');
  await page.fill('.dialog input[aria-label="Expense 1"]', 'Trucking');
  await page.fill('.dialog input[aria-label="Expense amount 1"]', '1000');
  const txt = await row.locator('.landed-cost').innerText();
  // (₱500 + ₱1,000) / 10 sacks = ₱150 → ₱2,900 + ₱150 = ₱3,050; profit ₱3,300 − ₱3,050 = ₱250
  expect(txt.includes('₱150.00') && txt.includes('₱3,050.00') && txt.includes('₱250.00'), 'landed: ' + txt);
  const sum = await page.locator('.dialog .summary-box').innerText();
  expect(sum.includes('Item expenses') && sum.includes('₱500.00') && sum.includes('₱30,500.00'), 'summary: ' + sum);
  await shot('02-receive-item-expense-credit');
  await page.click('.dialog-footer button:has-text("Receive and add to stock")');
  await toast('Expenses of ₱1,500.00 recorded');
  expect(await stat('Expenses') === '₱1,500.00', 'expenses stat: ' + await stat('Expenses'));
  expect((await page.locator('.table').nth(1).innerText()).includes('Dinorado 50kg Sack ₱500.00'), 'delivery row lists the item expense');
});

await step('Credit price of the item was updated by receiving; the Expenses page has the linked item expense', async () => {
  await page.goto(url + '#/items');
  await page.click('a:text-is("Dinorado 50kg Sack")');
  await page.waitForSelector('h1:has-text("Dinorado 50kg Sack")');
  expect(await stat('Credit price') === '₱3,600.00', 'credit price: ' + await stat('Credit price'));
  await page.goto(url + '#/expenses');
  await page.locator('.toolbar .field').filter({ has: page.locator('.field-label', { hasText: /^Category/ }) }).locator('select').selectOption('Restock');
  await page.locator('.toolbar input[type="date"]').first().fill('');
  await page.waitForSelector(`.table tr:has-text("Restock ${rid}"):has-text("Dinorado 50kg Sack")`);
});

await step('Edit delivery: the item expense and credit price are editable too', async () => {
  await page.goto(url + '#/restocks/' + rid);
  await page.click('.table button:has-text("Edit")');
  await page.waitForSelector('.dialog:has-text("Edit delivery")');
  const row = receiveRow('Dinorado 50kg Sack');
  expect((await row.locator('input[aria-label^="Expense"]').inputValue()).startsWith('500'), 'expense prefilled');
  await row.locator('input[aria-label^="Expense"]').fill('700');
  await row.locator('input[aria-label^="Credit price"]').fill('3650');
  await page.click('.dialog-footer button:has-text("Save changes")');
  await toast('updated');
  expect(await stat('Expenses') === '₱1,700.00', 'expenses after edit: ' + await stat('Expenses'));
  await page.goto(url + '#/items');
  await page.waitForSelector('tr:has-text("Dinorado 50kg Sack") td:has-text("₱3,650.00")');
});

await step('New sale: SKU in the picker and on the line; pay-later terms default to the editable credit price', async () => {
  await page.goto(url + '#/sales/new');
  await pick(page.locator('.field').filter({ has: page.locator('.field-label', { hasText: /^Customer/ }) }).locator('input'), 'Carmen Dela Cruz');
  const box = page.locator('.sale-line').first().locator('input[role="combobox"]');
  await box.click();
  await box.fill('RJ-BRO');
  await page.locator('.combobox-option', { hasText: 'Brown Rice 25kg Sack' }).first().click();
  await page.waitForSelector('.sale-line-batch .sku:text-is("RJ-BRO-001")');
  await page.locator('.sale-summary select').first().selectOption('INSTALLMENT');
  await page.waitForFunction(() => document.querySelector('.sale-line-price input').value.startsWith('2050'));
  await page.locator('.sale-line-price input').first().fill('2000');
  await page.waitForSelector('.sale-line .field-help:has-text("Credit price ₱2,050.00")');
});

await step('Sale detail: SKU on the line; overdue installment gets a promised date by hand (D-068)', async () => {
  await page.goto(url + '#/collections/overdue');
  const row = page.locator('tr:has-text("Aling Nena")').first();
  await page.waitForSelector('tr:has-text("Aling Nena")');
  await row.locator('a[href*="#/sales/"]').first().click();
  await page.waitForSelector('h1:has-text("-")');
  await page.waitForSelector('.table .cell-sub.sku');
  await page.locator('.table button:has-text("Add promise")').first().click();
  await page.waitForSelector('.dialog:has-text("Add promised date")');
  await field('Promised date').fill(plusDays(-1));
  await page.click('.dialog-footer button:has-text("Add promise")');
  await page.waitForSelector('.dialog .field-error:has-text("past")');
  await field('Promised date').fill(plusDays(3));
  await page.click('.dialog-footer button:has-text("Add promise")');
  await toast('Promise added');
  await page.waitForSelector('.table .promise-line.is-open');
  await shot('03-sale-promise');
});

await step('Calendar shows promised dates as their own entries; Collections lists them under Promised (D-069)', async () => {
  const d = plusDays(3);
  await page.goto(url + '#/calendar/agenda?m=' + d.slice(0, 7));
  await page.waitForSelector('.agenda-row .badge:text-is("Promised")');
  await page.waitForSelector('.cal-filter:has-text("Promised")');
  await page.goto(url + '#/collections/promised');
  await page.waitForSelector('.tab.is-active:has-text("Promised")');
  expect(await page.locator('.table tbody tr').count() >= 2, 'promised rows');
  await shot('04-collections-promised');
});

await step('Phone width: the receive dialog with five fields does not overflow sideways', async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(url + '#/restocks/' + rid);
  await page.click('.table button:has-text("Edit")');
  await page.waitForSelector('.dialog .landed-cost');
  const o = await page.evaluate(() => { const d = document.querySelector('.dialog'); return Math.max(document.documentElement.scrollWidth - window.innerWidth, d.scrollWidth - d.clientWidth); });
  await shot('05-phone-edit-delivery');
  expect(o <= 1, 'overflow ' + o + 'px');
  await page.click('.dialog-footer button:has-text("Cancel")');
  await page.setViewportSize({ width: 1366, height: 860 });
});

await step('No console errors', async () => { expect(!errors.length, errors.join('\n')); });

await browser.close();
console.log(results.join('\n'));
console.log(failed ? `\n${failed} step(s) FAILED` : `\nAll ${results.length} steps passed`);
process.exit(failed ? 1 : 0);
