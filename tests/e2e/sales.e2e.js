/*
 * E2E: Phases 6–7 (sales, payments, schedules, collections, receipts) in demo mode (Firebase config forced to null),
 * opened via file://.  Usage: node tests/e2e/sales.e2e.js [build|dist] [screenshotDir]
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
const tab = (name) => page.click(`.tab:has-text("${name}")`);
const money = (s) => Number(String(s).replace(/[^\d.−-]/g, '').replace('−', '-'));
async function pick(inputLocator, text) {
  await inputLocator.click();
  await inputLocator.fill(text);
  await page.locator('.combobox-option:not(.is-disabled)', { hasText: text }).first().click();
}
const lineItem = (n) => page.locator(`input[aria-label="Item ${n}"], .sale-line:nth-child(${n}) input[role="combobox"]`).first();
const lineQty = (n) => page.locator('.sale-line').nth(n - 1).locator('.sale-line-qty input');
const linePrice = (n) => page.locator('.sale-line').nth(n - 1).locator('.sale-line-price input');
const customerBox = () => page.locator('.panel').filter({ has: page.locator('.panel-title', { hasText: 'Customer' }) }).locator('input[role="combobox"]');
async function itemQty(name) {
  await page.goto(url + '#/items');
  const row = page.locator('tr', { has: page.locator(`a:text-is("${name}")`) });
  await row.waitFor();
  return (await row.innerText());
}

await step('Sign in; Sales shows the empty state with New sale and sample data', async () => {
  await page.goto(url + '#/sales');
  await page.fill('input[autocomplete="username"]', 'owner');
  await page.fill('input[autocomplete="current-password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=No sales yet');
  expect(await page.isVisible('.empty-state button:has-text("Load sample data")'), 'sample data button missing');
});

await step('Load sample data: sales, stats and a cancelled sale appear', async () => {
  await page.click('.empty-state button:has-text("Load sample data")');
  await page.click('.dialog-footer button:has-text("Load sample data")');
  await toast('Sample data loaded');
  await page.waitForSelector('.table a:has-text("RJ-2026-")');
  const shown = await page.locator('.table tbody tr').count();
  expect(shown === 6, 'active sales shown: ' + shown);
  expect(money(await stat('Still to collect')) > 0, 'nothing to collect');
  await field('Status', '.toolbar').selectOption('CANCELLED');
  await page.waitForSelector('.toolbar-end:has-text("1 shown")');
  await field('Status', '.toolbar').selectOption('ACTIVE');
  await shot('30-sales-list');
});

let walkInSale;
await step('New walk-in sale: item search, live total, terms locked to full payment, save', async () => {
  await page.goto(url + '#/sales/new');
  await page.waitForSelector('h1:has-text("New sale")');
  expect(await page.locator('.sale-summary select').first().isDisabled(), 'terms should be locked for Walk-in');
  await pick(page.locator('.sale-line').first().locator('input[role="combobox"]'), 'Dinorado 50kg Sack');
  await lineQty(1).fill('2');
  await page.click('.panel-footer button:has-text("Add line")');
  await pick(page.locator('.sale-line').nth(1).locator('input[role="combobox"]'), 'Sinandomeng per KG');
  await lineQty(2).fill('2.5');
  await page.waitForSelector('.summary-box .total-row:has-text("₱6,635.00")'); // 2 × 3,250 + 2.5 × 54
  await shot('31-new-sale');
  await page.click('button:has-text("Save sale")');
  await page.waitForSelector('h1:has-text("RJ-2026-")');
  walkInSale = (await page.locator('h1').innerText()).match(/RJ-\d{4}-\d{5}/)[0];
  expect(await stat('Balance') === '₱0.00', 'balance: ' + await stat('Balance'));
  await page.waitForSelector('.badge:has-text("Paid")');
  await page.waitForSelector('text=Paid at sale');
});

await step('Stock guard: more than available is flagged and cannot be saved', async () => {
  await page.goto(url + '#/sales/new');
  await pick(page.locator('.sale-line').first().locator('input[role="combobox"]'), 'Jasmine 25kg Sack');
  await lineQty(1).fill('99');
  await page.waitForSelector('.field-error:has-text("in stock")');
  await page.click('button:has-text("Save sale")');
  await page.waitForSelector('.banner-danger:has-text("Not enough stock")');
  expect(await page.locator('button:has-text("Save sale")').isDisabled(), 'save should be disabled');
});

await step('Line price follows the terms: cash price for Full, payday price for Installment (D-046)', async () => {
  await page.goto(url + '#/sales/new');
  await pick(customerBox(), 'Carmen Dela Cruz');
  await pick(page.locator('.sale-line').first().locator('input[role="combobox"]'), 'Brown Rice 25kg Sack');
  expect((await linePrice(1).inputValue()).startsWith('1900'), 'cash price ' + await linePrice(1).inputValue());
  await page.locator('.sale-summary select').first().selectOption('INSTALLMENT');
  await page.waitForFunction(() => document.querySelector('.sale-line-price input').value.startsWith('2050'));
  await page.locator('.sale-summary select').first().selectOption('FULL');
  await page.waitForFunction(() => document.querySelector('.sale-line-price input').value.startsWith('1900'));
});

let instSale;
await step('Installment sale for a registered customer: default 2 payments, then 3-row preview with editable dates', async () => {
  await page.goto(url + '#/sales/new');
  await pick(customerBox(), 'Carmen Dela Cruz');
  await pick(page.locator('.sale-line').first().locator('input[role="combobox"]'), 'Brown Rice 25kg Sack');
  await lineQty(1).fill('1');
  await linePrice(1).fill('1,800');
  await page.waitForSelector('.sale-line .field-help:has-text("Cash price")');
  await page.locator('.sale-summary select').first().selectOption('INSTALLMENT');
  await field('Down payment', '.sale-summary').fill('300');
  // Default plan is 2 payments (user request 2026-11-25); then switch to 3.
  await page.waitForSelector('.schedule-row >> nth=1');
  expect(await page.locator('.schedule-row').count() === 2, 'default is 2 installments');
  const two = await page.locator('.schedule-row strong').allInnerTexts();
  expect(two.join('|') === '₱750.00|₱750.00', 'two amounts ' + two.join('|'));
  await page.locator('.sale-summary .field:has(.field-label:text-is("Number of installments")) .segmented-option:has-text("3")').click();
  await page.waitForSelector('.schedule-row >> nth=2');
  const amounts = await page.locator('.schedule-row strong').allInnerTexts();
  expect(amounts.join('|') === '₱500.00|₱500.00|₱500.00', 'amounts ' + amounts.join('|'));
  await shot('32-installment-preview');
  await page.click('button:has-text("Save sale")');
  await page.waitForSelector('h1:has-text("RJ-2026-")');
  instSale = (await page.locator('h1').innerText()).match(/RJ-\d{4}-\d{5}/)[0];
  expect(await stat('Balance') === '₱1,500.00', 'balance ' + await stat('Balance'));
  expect(await page.locator('.panel:has(.panel-title:has-text("Installment schedule")) tbody tr').count() === 3, 'schedule rows');
  await page.waitForSelector('text=Down payment');
});

await step('Record payment: allocation preview oldest first; overpayment rejected; balance updates', async () => {
  await page.click('.page-header button:has-text("Record payment")');
  await page.waitForSelector('.dialog:has-text("Record payment")');
  await field('Amount received').fill('2000');
  await page.click('.dialog-footer button:has-text("Record payment")');
  await page.waitForSelector('.dialog .field-error:has-text("More than the balance")');
  await field('Amount received').fill('700');
  await page.waitForSelector('.dialog .summary-box:has-text("Installment 2")');
  await page.locator('.dialog .segmented-option:has-text("E-wallet")').click();
  await field('Reference no.').fill('GCASH-123');
  await page.click('.dialog-footer button:has-text("Record payment")');
  await toast('recorded');
  await page.waitForSelector(`.stat:has-text("Balance") .stat-value:text-is("₱800.00")`);
  await page.waitForSelector('tbody .badge:has-text("Partly paid")');
});

await step('Void payment: reason required, balance goes back up, shown as voided', async () => {
  await page.locator('tr:has-text("GCASH-123") button[aria-label^="Void"]').click();
  await page.click('.dialog-footer button:has-text("Void payment")');
  await page.waitForSelector('.dialog .field-error:has-text("reason")');
  await field('Reason').fill('Wrong amount');
  await page.click('.dialog-footer button:has-text("Void payment")');
  await toast('voided');
  await page.waitForSelector(`.stat:has-text("Balance") .stat-value:text-is("₱1,500.00")`);
  await page.waitForSelector('tr:has-text("GCASH-123") .badge:has-text("Voided")');
  expect(!(await page.isVisible('tr:has-text("Down payment") button[aria-label^="Void"]')), 'down payment must not be voidable');
});

await step('Reschedule: total must stay the same; saved with history', async () => {
  await page.click('.page-header button:has-text("Reschedule")');
  await page.waitForSelector('.dialog:has-text("Reschedule")');
  await page.fill('input[aria-label="Amount 1"]', '400');
  await page.waitForSelector('.dialog .summary-box .delta-out');
  await field('Reason').fill('Customer asked');
  await page.click('.dialog-footer button:has-text("Save new schedule")');
  await page.waitForSelector('.dialog .banner-danger:has-text("same total")');
  await page.fill('input[aria-label="Amount 3"]', '600');
  await page.fill('input[aria-label="Due date 3"]', '2027-03-31');
  await page.click('.dialog-footer button:has-text("Save new schedule")');
  await toast('Schedule updated');
  await page.waitForSelector('td:has-text("Mar 31, 2027")');
  await page.waitForSelector('.cell-sub:has-text("Rescheduled")');
});

await step('Delivery status and notes can be changed after saving', async () => {
  await page.click('.page-header button:has-text("Delivery")');
  await field('Delivery status').selectOption('DELIVERED');
  await field('Notes').fill('Left at the gate');
  await page.click('.dialog-footer button:has-text("Save")');
  await toast('Delivery updated');
  await page.waitForSelector('h1 .badge:has-text("Delivered")');
  await page.waitForSelector('dd:has-text("Left at the gate")');
});

await step('Print sale receipt and payment receipt', async () => {
  await page.click('.page-header button:has-text("Print receipt")');
  await page.waitForFunction(() => window.__printed.length === 1);
  const text = await page.evaluate(() => window.__printed[0]);
  expect(/SALES RECEIPT/i.test(text) && text.includes(instSale) && text.includes('Brown Rice 25kg Sack') && /Payment schedule/i.test(text), 'receipt: ' + text.slice(0, 200));
  await page.locator('tr:has-text("Down payment") button[aria-label^="Print"]').click();
  await page.waitForFunction(() => window.__printed.length === 2);
  expect(/PAYMENT RECEIPT/i.test(await page.evaluate(() => window.__printed[1])), 'payment receipt');
});

await step('Cancel sale: reason required; stock returned; payments refunded; customer balance cleared', async () => {
  await page.goto(url + '#/sales/' + walkInSale);
  await page.click('.page-header button:has-text("Cancel sale")');
  await page.waitForSelector('.dialog:has-text("returns")');
  await page.click('.dialog-footer button:has-text("Cancel sale")');
  await page.waitForSelector('.dialog .field-error:has-text("reason")');
  await field('Reason').fill('Wrong quantity entered');
  await page.click('.dialog-footer button:has-text("Cancel sale")');
  await toast('cancelled');
  await page.waitForSelector('.banner:has-text("Wrong quantity entered")');
  await page.waitForSelector('.badge:has-text("Refunded")');
  const row = await itemQty('Dinorado 50kg Sack');
  expect(row.includes('32 sacks'), 'Dinorado stock after cancel: ' + row); // 20 − 2 (sample) − 1 (sample walk-in) + 10 + 5 (sample restocks, Phase 8) = 32
});

await step('Collections: overdue first, contacts shown, copy reminder, record payment from the list', async () => {
  await page.goto(url + '#/collections');
  await page.waitForSelector('.tab.is-active:has-text("Overdue")');
  await page.waitForSelector(`.table a:has-text("Mang Tonyo Carinderia")`);
  await page.waitForSelector('.collect-row-contact:has-text("Mario Santos")');
  const before = money(await stat('Overdue'));
  await page.locator('tr:has-text("Mang Tonyo") button[aria-label^="Copy reminder"]').click();
  await toast('Reminder copied');
  await page.locator('tr:has-text("Mang Tonyo") button:has-text("Record payment")').click();
  await page.waitForSelector('.dialog:has-text("Record payment")');
  await field('Amount received').fill('1000');
  await page.click('.dialog-footer button:has-text("Record payment")');
  await toast('recorded');
  await page.waitForFunction((b) => {
    const v = [...document.querySelectorAll('.stat')].find((s) => s.querySelector('.stat-label').textContent === 'Overdue');
    return v && Number(v.querySelector('.stat-value').textContent.replace(/[^\d.]/g, '')) === b - 1000;
  }, before);
  await tab('Later');
  await page.waitForURL(/#\/collections\/later$/);
  await shot('33-collections');
});

await step('Customer detail: sales, payments, schedule and statement tabs filled', async () => {
  await page.goto(url + '#/customers');
  await page.click(`.table a:has-text("Carmen Dela Cruz")`);
  await page.waitForSelector('h1:has-text("Carmen Dela Cruz")');
  // ₱1,500.00 from this run + ₱5,200.00 sample opening balance (Phase 11)
  expect(await stat('Outstanding balance') === '₱6,700.00', 'outstanding ' + await stat('Outstanding balance'));
  await page.waitForSelector('.list-row:has-text("' + instSale + '")');
  await tab('Sales');
  await page.waitForSelector(`.table a:has-text("${instSale}")`);
  await tab('Payments');
  await page.waitForSelector('.table:has-text("GCASH-123")');
  await tab('Schedule');
  await page.waitForSelector('.table tbody tr >> nth=4', { timeout: 5000 }).catch(() => {}); // rows load after the tab opens
  const n = await page.locator('.table tbody tr').count();
  expect(n === 5, 'schedule rows (3 + 2 opening-balance rows): ' + n);
  await tab('Statement');
  await page.waitForSelector('.doc-total:has-text("₱6,700.00")');
  await page.click('button:has-text("Print statement")');
  await page.waitForFunction(() => window.__printed.some((t) => /STATEMENT OF ACCOUNT/i.test(t)));
});

await step('Settings → Sales: validation, save, and the new prefix is used for the next sale', async () => {
  await page.goto(url + '#/settings/sales');
  await field('Sale ID prefix', '.panel').fill('R J');
  await page.click('button:has-text("Save changes")');
  await page.waitForSelector('.field-error:has-text("letters or digits")');
  await field('Sale ID prefix', '.panel').fill('RJS-');
  await page.click('button:has-text("Save changes")');
  await toast('Sales settings saved');
  await page.goto(url + '#/sales/new');
  await pick(page.locator('.sale-line').first().locator('input[role="combobox"]'), 'Sinandomeng per KG');
  await lineQty(1).fill('1');
  await page.click('button:has-text("Save sale")');
  await page.waitForSelector('h1:has-text("RJS-2026-")');
});

await step('Phone width: new sale, sale detail and collections do not overflow sideways', async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  for (const p of ['#/sales/new', '#/sales/' + instSale, '#/collections', '#/sales']) {
    await page.goto(url + p);
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow <= 0, `${p} overflow: ${overflow}px`);
  }
  await shot('34-sales-phone');
  await page.setViewportSize({ width: 1366, height: 860 });
});

await step('No JavaScript errors during the run', async () => { expect(!errors.length, errors.join(' | ')); });

await browser.close();
console.log(results.join('\n'));
console.log(failed ? `\nE2E FAILED: ${failed} step(s)` : '\nE2E PASSED');
process.exit(failed ? 1 : 0);
