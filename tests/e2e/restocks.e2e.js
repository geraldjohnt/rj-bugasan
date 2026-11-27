/*
 * E2E: Phase 8 (suppliers, restocks, receiving with cost update, expenses) in demo mode (Firebase config forced to null),
 * opened via file://.  Usage: node tests/e2e/restocks.e2e.js [build|dist] [screenshotDir]
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
const money = (s) => Number(String(s).replace(/[^\d.−-]/g, '').replace('−', '-'));
async function pick(input, text) {
  await input.click();
  await input.fill(text);
  await page.locator('.combobox-option:not(.is-disabled)', { hasText: text }).first().click();
}
const lineItem = (n) => page.locator('.sale-line').nth(n - 1).locator('input[role="combobox"]');
const lineQty = (n) => page.locator('.sale-line').nth(n - 1).locator('.sale-line-qty input');
const lineCost = (n) => page.locator('.sale-line').nth(n - 1).locator('.sale-line-price input');
async function itemRow(name) {
  await page.goto(url + '#/items');
  const row = page.locator('tr', { has: page.locator(`a:text-is("${name}")`) });
  await row.waitFor();
  return row.innerText();
}
const sacksIn = (text) => Number((/(\d+) sacks?/.exec(text) || [])[1]);

await step('Sign in; Suppliers shows the empty state with Add supplier and sample data', async () => {
  await page.goto(url + '#/suppliers');
  await page.fill('input[autocomplete="username"]', 'owner');
  await page.fill('input[autocomplete="current-password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=No suppliers yet');
  expect(!(await page.isVisible('button:has-text("Load sample data")')), 'sample data button must only be in Settings → System (D-057)');
});

await step('Load sample data: suppliers and restocks in every status appear', async () => {
  await loadSample();
  await toast('Sample data loaded');
  await page.goto(url + '#/suppliers');
  await page.waitForSelector('.table a:has-text("Golden Grains Trading")');
  expect(await page.locator('.table tbody tr').count() === 3, 'expected 3 suppliers');
  await page.goto(url + '#/restocks');
  await page.waitForSelector('.table a:has-text("RS-")');
  expect(await page.locator('.table tbody tr').count() === 2, 'open orders shown: ' + await page.locator('.table tbody tr').count());
  await field('Status', '.toolbar').selectOption('');
  await page.waitForSelector('.toolbar-end:has-text("6 shown")');
  for (const s of ['Received', 'Partially received', 'Ordered', 'Cancelled']) expect(await page.isVisible(`.table .badge:text-is("${s}")`), 'missing status ' + s);
  await shot('40-restocks-list');
});

await step('Add supplier: name required; saved supplier opens its page', async () => {
  await page.goto(url + '#/suppliers');
  await page.click('button:has-text("Add supplier")');
  await page.click('.dialog-footer button:has-text("Add supplier")');
  await page.waitForSelector('.dialog .field-error:has-text("Required")');
  await field('Supplier name').fill('Test Rice Supplier');
  await field('Contact person').fill('Mrs. Santos');
  await field('Contact number').fill('0917 000 1111');
  await page.click('.dialog-footer button:has-text("Add supplier")');
  await page.waitForSelector('h1:has-text("Test Rice Supplier")');
  await page.waitForSelector('text=No orders yet');
});

let rs, sackBefore;
await step('New restock from the supplier page: two lines, live total; saving does not change stock', async () => {
  sackBefore = sacksIn(await itemRow('Dinorado 50kg Sack'));
  await page.goto(url + '#/suppliers');
  await page.click('.table a:has-text("Test Rice Supplier")');
  await page.click('button:has-text("New restock")');
  await page.waitForSelector('h1:has-text("New restock")');
  expect((await page.locator('.field', { has: page.locator('.field-label', { hasText: /^Supplier/ }) }).locator('input').inputValue()).includes('Test Rice Supplier'), 'supplier not preselected');
  await page.click('button:has-text("Save order")');
  await page.waitForSelector('.banner:has-text("Add at least one item")');
  await pick(lineItem(1), 'Dinorado 50kg Sack');
  expect(await lineCost(1).inputValue() === '2900.00', 'cost not prefilled: ' + await lineCost(1).inputValue());
  await lineQty(1).fill('4');
  await lineCost(1).fill('3000');
  await page.click('button:has-text("Add line")');
  await pick(lineItem(2), 'Malagkit per KG');
  await lineQty(2).fill('12.5');
  await page.waitForSelector('.footer-total:has-text("₱12,812.50")'); // 4 × 3,000 + 12.5 × 65
  await page.fill('input[type="date"] >> nth=1', '2026-12-01');
  await page.click('button:has-text("Save order")');
  await page.waitForSelector('h1:has-text("RS-")');
  rs = (await page.locator('h1').innerText()).match(/RS-\d{4}-\d{5}/)[0];
  expect(await page.isVisible('.badge:text-is("Ordered")'), 'status not Ordered');
  expect(sacksIn(await itemRow('Dinorado 50kg Sack')) === sackBefore, 'stock changed on ordering');
});

await step('Receive part of it at a new cost: update-cost box is pre-checked; stock and cost change', async () => {
  await page.goto(url + '#/restocks/' + rs);
  await page.click('button:has-text("Receive goods")');
  await page.fill('input[aria-label="Received Dinorado 50kg Sack"]', '3');
  await page.fill('input[aria-label="Received Malagkit per KG"]', '0');
  const box = page.locator('.dialog label.checkbox:has-text("default cost and price") input');
  expect(await box.isChecked(), 'update cost not pre-checked');
  await shot('41-receive');
  await page.click('.dialog-footer button:has-text("Receive and add to stock")');
  await toast('The rest is still to come');
  await page.waitForSelector('.badge:text-is("Partially received")');
  expect(await page.isVisible('td:has-text("3 sacks Dinorado 50kg Sack @ ₱3,000.00")'), 'receipt row missing');
  const row = await itemRow('Dinorado 50kg Sack');
  expect(sacksIn(row) === sackBefore + 3, `stock ${sacksIn(row)} vs ${sackBefore + 3}`);
  await page.click('a:text-is("Dinorado 50kg Sack")');
  await page.waitForSelector('text=Restock received');
  expect(await page.isVisible('text=₱3,000.00'), 'item cost not updated');
});

await step('Cannot receive more than remains; editing the order cannot go below what was received', async () => {
  await page.goto(url + '#/restocks/' + rs);
  await page.click('button:has-text("Receive goods")');
  await page.fill('input[aria-label="Received Dinorado 50kg Sack"]', '2');
  await page.waitForSelector('.dialog .field-error:has-text("Only 1 sack left")');
  await page.click('.dialog-footer button:has-text("Cancel")');
  await page.click('button:has-text("Edit order")');
  await page.waitForSelector('h1:has-text("Edit order")');
  await lineQty(1).fill('2');
  await page.click('button:has-text("Save changes")');
  await page.waitForSelector('.field-error:has-text("Already received 3 sacks")');
  await lineQty(1).fill('5');
  await lineQty(2).fill('10');
  await page.click('button:has-text("Save changes")');
  await toast('updated');
  await page.waitForSelector('td:has-text("5 sacks")');
});

await step('Receive the rest without updating cost: order becomes Received and is locked', async () => {
  await page.click('button:has-text("Receive goods")');
  expect(await page.inputValue('input[aria-label="Received Dinorado 50kg Sack"]') === '2', 'remaining not prefilled');
  await page.fill('input[aria-label="Unit cost Dinorado 50kg Sack"]', '3100');
  await page.locator('.dialog label.checkbox:has-text("default cost and price") input').first().uncheck();
  await page.click('.dialog-footer button:has-text("Receive and add to stock")');
  await toast('is complete');
  await page.waitForSelector('.badge:text-is("Received")');
  expect(!(await page.isVisible('button:has-text("Receive goods")')), 'receive still offered');
  const row = await itemRow('Dinorado 50kg Sack');
  expect(sacksIn(row) === sackBefore + 5, 'stock after full receipt');
  await page.click('a:text-is("Dinorado 50kg Sack")');
  await page.waitForSelector('h1:has-text("Dinorado 50kg Sack")');
  expect((await page.locator('.stat:has(.stat-label:text-is("Default cost")) .stat-value').textContent()).trim() === '₱3,000.00', 'cost changed although unticked');
});

await step('Cancel an order with nothing received; close a partly received order', async () => {
  await page.goto(url + '#/restocks/new');
  await pick(page.locator('.field', { has: page.locator('.field-label', { hasText: /^Supplier/ }) }).locator('input'), 'Test Rice Supplier');
  await pick(lineItem(1), 'Jasmine 25kg Sack');
  await lineQty(1).fill('2');
  await page.click('button:has-text("Save order")');
  await page.waitForSelector('h1:has-text("RS-")');
  await page.click('button:has-text("Cancel order")');
  await page.click('.dialog-footer button:has-text("Cancel order")');
  await page.waitForSelector('.dialog .field-error:has-text("Enter the reason")');
  await field('Reason').fill('Ordered by mistake');
  await page.click('.dialog-footer button:has-text("Cancel order")');
  await toast('cancelled');
  await page.waitForSelector('.badge:text-is("Cancelled")');
  await page.waitForSelector('.banner:has-text("Ordered by mistake")');
  await page.goto(url + '#/restocks');
  await page.click('tr:has(.badge:text-is("Partially received")) a:has-text("RS-")');
  await page.click('button:has-text("Close order")');
  await field('Reason').fill('Supplier ran out');
  await page.click('.dialog-footer button:has-text("Close order")');
  await toast('closed');
  await page.waitForSelector('.badge:has-text("Received (closed short)")');
});

await step('Expenses: Other needs a note; add, void with reason; totals exclude voided', async () => {
  await page.goto(url + '#/expenses');
  await page.waitForSelector('.table tbody tr');
  const before = money(await stat('Expenses in period'));
  await page.click('button:has-text("Add expense")');
  await field('Amount').fill('1500');
  await field('Category').selectOption('Other');
  await page.click('.dialog-footer button:has-text("Add expense")');
  await page.waitForSelector('.dialog .field-error:has-text("Describe the expense")');
  await field('Category').selectOption('Rent');
  await page.click('.dialog-footer button:has-text("Add expense")');
  await toast('Expense of ₱1,500.00 recorded');
  const after = money(await stat('Expenses in period'));
  expect(Math.abs(after - before - 1500) < 0.001, `total ${before} → ${after}`);
  await page.click('button[aria-label^="Void expense"] >> nth=0');
  await field('Reason').fill('Wrong amount');
  await page.click('.dialog-footer button:has-text("Void expense")');
  await toast('Expense voided');
  expect(Math.abs(money(await stat('Expenses in period')) - (after - 1500)) < 0.001, 'void not excluded from total');
  await field('Status', '.toolbar').selectOption('VOIDED');
  await page.waitForSelector('td:has-text("Voided: Wrong amount")');
  await shot('42-expenses');
});

await step('Movements page lists the restock receipts', async () => {
  await page.goto(url + '#/movements');
  await page.waitForSelector('td:has-text("Restock received")');
});

await step('Phone width: suppliers, restocks, restock form/detail and expenses do not overflow sideways', async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  for (const p of ['#/suppliers', '#/restocks', '#/restocks/new', '#/restocks/' + rs, '#/expenses']) {
    await page.goto(url + p);
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow <= 0, `${p} overflow: ${overflow}px`);
  }
  await page.setViewportSize({ width: 1366, height: 860 });
});

await step('No JavaScript errors during the run', async () => { expect(!errors.length, errors.join(' | ')); });

await browser.close();
console.log(results.join('\n'));
console.log(failed ? `\nE2E FAILED: ${failed} step(s)` : '\nE2E PASSED');
process.exit(failed ? 1 : 0);
