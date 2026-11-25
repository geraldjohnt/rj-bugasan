/*
 * E2E: Phase 4 inventory in demo mode (Firebase config forced to null), opened via file://.
 * Usage: node tests/e2e/inventory.e2e.js [build|dist] [screenshotDir]
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
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = async (name) => { if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, name + '.png') }); } };

/** Input/select inside a field whose label starts with `label` (within the open dialog unless scope given). */
const field = (label, scope = '.dialog') => page.locator(`${scope} .field`).filter({ has: page.locator('.field-label', { hasText: new RegExp('^' + label) }) }).locator('input, select').first();
const toast = (text) => page.waitForSelector(`.toast:has-text("${text}")`);
const stat = async (label) => (await page.locator('.stat').filter({ has: page.locator('.stat-label', { hasText: new RegExp('^' + label + '$') }) }).locator('.stat-value').textContent()).trim();

await step('Sign in and open Items: empty state offers Add item and sample data', async () => {
  await page.goto(url + '#/items');
  await page.fill('input[autocomplete="username"]', 'owner');
  await page.fill('input[autocomplete="current-password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=No items yet');
  expect(await page.isVisible('.empty-state button:has-text("Load sample data")'), 'sample data button missing');
});

await step('Add item: required fields are validated', async () => {
  await page.click('.page-header button:has-text("Add item")');
  await page.waitForSelector('.dialog');
  await page.click('.dialog-footer button:has-text("Add item")');
  await page.waitForSelector('.dialog .field-error:has-text("Required.")');
  expect(await page.evaluate(() => document.activeElement.getAttribute('aria-invalid')) === 'true', 'focus not moved to first error');
});

await step('Add sack item with opening stock → item page shows stock and history', async () => {
  await field('Item name').fill('Test Dinorado 50kg Sack');
  await field('Variety').fill('Dinorado');
  await field('Selling price').fill('2,500');
  await field('Cost per').fill('2200');
  await field('Low-stock level').fill('2');
  await field('Opening stock').fill('3');
  await shot('10-item-form');
  await page.click('.dialog-footer button:has-text("Add item")');
  await page.waitForSelector('h1:has-text("Test Dinorado 50kg Sack")');
  expect(await stat('In stock') === '3 sacks', 'stock: ' + await stat('In stock'));
  expect(await stat('Stock value') === '₱6,600.00', 'value: ' + await stat('Stock value'));
  await page.waitForSelector('.table td:has-text("Opening stock")');
});

await step('Add per-kg item linked to the sack (no opening stock → Out of stock)', async () => {
  await page.goto(url + '#/items');
  await page.click('.page-header button:has-text("Add item")');
  await page.click('.dialog .segmented-option:has-text("Kilo")');
  await field('Item name').fill('Test Dinorado per KG');
  await field('Linked sack item').selectOption({ label: 'Test Dinorado 50kg Sack (50 kg)' });
  await field('Selling price').fill('50');
  await field('Cost per').fill('60');
  await page.waitForSelector('.dialog .banner:has-text("below the cost")');
  await field('Selling price').fill('55');
  await page.click('.dialog-footer button:has-text("Add item")');
  await page.waitForSelector('h1:has-text("Test Dinorado per KG")');
  expect(await page.isVisible('h1 .badge:has-text("Out of stock")'), 'out of stock badge missing');
});

await step('Duplicate active item name is rejected', async () => {
  await page.goto(url + '#/items');
  await page.click('.page-header button:has-text("Add item")');
  await field('Item name').fill('test dinorado per kg');
  await field('Selling price').fill('1');
  await field('Cost per').fill('1');
  await page.click('.dialog-footer button:has-text("Add item")');
  await page.waitForSelector('.dialog .field-error:has-text("already has this name")');
  await page.keyboard.press('Escape');
});

await step('Open sack: 1 sack → +50 kg, kg cost set; sack now low stock', async () => {
  await page.click('.table a:has-text("Test Dinorado 50kg Sack")');
  await page.waitForSelector('h1:has-text("Test Dinorado 50kg Sack")');
  await page.click('.page-header button:has-text("Open sack")');
  await page.waitForSelector('.dialog:has-text("Open sack")');
  expect(await field('Cost per kg').inputValue() === '44.00', 'default kg cost: ' + await field('Cost per kg').inputValue());
  await field('Sacks to open').fill('5');
  await page.click('.dialog-footer button:has-text("Open sack")');
  await page.waitForSelector('.dialog .field-error:has-text("Only 3 sacks in stock")');
  await field('Sacks to open').fill('1');
  await shot('11-open-sack');
  await page.click('.dialog-footer button:has-text("Open sack")');
  await toast('Opened 1 sack');
  expect(await stat('In stock') === '2 sacks', 'sack stock: ' + await stat('In stock'));
  expect(await page.isVisible('h1 .badge:has-text("Low stock")'), 'low stock badge missing');
  await page.click('a:has-text("Test Dinorado per KG")');
  await page.waitForSelector('h1:has-text("Test Dinorado per KG")');
  expect(await stat('In stock') === '50 kg', 'kg stock: ' + await stat('In stock'));
  expect(await stat('Cost') === '₱44.00', 'kg cost: ' + await stat('Cost'));
});

await step('Adjust stock: cannot remove more than available; reason recorded in history', async () => {
  await page.click('.page-header button:has-text("Adjust stock")');
  await field('Quantity').fill('60');
  await field('Reason').selectOption('Spillage');
  await page.click('.dialog-footer button:has-text("Save adjustment")');
  await page.waitForSelector('.dialog .field-error:has-text("Only 50 kg in stock")');
  await field('Quantity').fill('2.5');
  await field('Reason').selectOption('Other');
  await page.click('.dialog-footer button:has-text("Save adjustment")');
  await page.waitForSelector('.dialog .field-error:has-text("Describe the reason")');
  await field('Note').fill('Sample for customer');
  await shot('12-adjust');
  await page.click('.dialog-footer button:has-text("Save adjustment")');
  await toast('now 47.5 kg');
  expect(await stat('In stock') === '47.5 kg', 'after adjust: ' + await stat('In stock'));
  await page.waitForSelector('.table td:has-text("Other — Sample for customer")');
  await page.waitForSelector('.table td:has-text("−2.5 kg")');
  await shot('13-item-detail');
});

await step('Edit price: saved and shown; unit cannot change', async () => {
  await page.click('.page-header button:has-text("Edit")');
  expect(await page.isVisible('.dialog >> text=The unit cannot be changed'), 'unit lock note missing');
  await field('Selling price').fill('58');
  await page.click('.dialog-footer button:has-text("Save changes")');
  await toast('Changes saved.');
  expect(await stat('Selling price') === '₱58.00', 'price: ' + await stat('Selling price'));
});

await step('Movements page lists all changes and filters by type', async () => {
  await page.click('.nav-item:has-text("Movements")');
  await page.waitForSelector('h1:has-text("Movements")');
  await page.waitForSelector('.toolbar-end:has-text("4 shown")');
  await field('Type', '.toolbar').selectOption('ADJUSTMENT');
  await page.waitForSelector('.toolbar-end:has-text("1 shown")');
  await shot('14-movements');
});

await step('Stock count: draft saved, survives reload, finalize adjusts differences only', async () => {
  await page.click('.nav-item:has-text("Stock count")');
  await page.click('.page-header button:has-text("New count")');
  await page.click('.dialog-footer button:has-text("Start count")');
  await page.waitForSelector('h1:has-text("Count of")');
  await page.fill('input[aria-label="Counted Test Dinorado 50kg Sack"]', '1.5');
  await page.waitForSelector('td:has-text("Sacks must be a whole number")');
  expect(await page.isDisabled('button:has-text("Finalize count")'), 'finalize should be disabled with errors');
  await page.fill('input[aria-label="Counted Test Dinorado 50kg Sack"]', '1');
  await page.fill('input[aria-label="Counted Test Dinorado per KG"]', '47.5');
  await page.click('button:has-text("Save draft")');
  await toast('Count saved.');
  await page.reload();
  await page.waitForSelector('h1:has-text("Count of")');
  expect(await page.inputValue('input[aria-label="Counted Test Dinorado 50kg Sack"]') === '1', 'draft not saved');
  await page.waitForSelector('td:has-text("−1 sack")');
  await shot('15-count-sheet');
  await page.click('.page-header button:has-text("Finalize count")');
  await page.waitForSelector('.dialog:has-text("1 item(s)")');
  await page.click('.dialog-footer button:has-text("Finalize count")');
  await toast('1 adjustment(s) recorded');
  await page.waitForSelector('.banner:has-text("finalized and read-only")');
  expect(!(await page.isVisible('input[aria-label="Counted Test Dinorado 50kg Sack"]')), 'finalized count still editable');
  await page.click('.table a:has-text("Test Dinorado 50kg Sack")');
  await page.waitForSelector('h1:has-text("Test Dinorado 50kg Sack")');
  expect(await stat('In stock') === '1 sack', 'after count: ' + await stat('In stock'));
  await page.waitForSelector('.table td:has-text("Stock count")');
});

await step('Archive: item hidden from active list, shown under Archived, restorable', async () => {
  await page.click('.page-header button:has-text("Archive")');
  await page.click('.dialog-footer button:has-text("Archive item")');
  await toast('Item archived.');
  await page.waitForSelector('.banner:has-text("This item is archived")');
  await page.goto(url + '#/items');
  await page.waitForSelector('.toolbar-end:has-text("1 of 2")');
  await field('Status', '.toolbar').selectOption('ARCHIVED');
  await page.waitForSelector('.table a:has-text("Test Dinorado 50kg Sack")');
  await page.click('.table a:has-text("Test Dinorado 50kg Sack")');
  await page.click('.page-header button:has-text("Restore")');
  await page.click('.dialog-footer button:has-text("Restore item")');
  await toast('Item restored.');
});

await step('Load sample data from Settings → System; second load adds nothing', async () => {
  await page.goto(url + '#/settings/system');
  await page.click('button:has-text("Load sample data")');
  await page.click('.dialog-footer button:has-text("Load sample data")');
  await toast('Sample data loaded: 9 item(s)');
  await page.click('button:has-text("Load sample data")');
  await page.click('.dialog-footer button:has-text("Load sample data")');
  await toast('Sample data is already loaded.');
  await page.goto(url + '#/items');
  await page.waitForSelector('.toolbar-end:has-text("11 of 11")');
  await page.waitForSelector('.table a:has-text("Dinorado per KG")');
  await shot('16-items-sample');
});

await step('Low-stock filter shows only low or out-of-stock items', async () => {
  await field('Stock', '.toolbar').selectOption('LOW');
  const n = await page.locator('.table tbody tr').count();
  const badges = await page.locator('.table tbody .badge').count();
  expect(n > 0 && n === badges, `rows ${n}, badges ${badges}`);
  await field('Stock', '.toolbar').selectOption('');
});

await step('Phone width: items page does not overflow sideways', async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 0, 'horizontal overflow: ' + overflow + 'px');
  await shot('17-items-phone');
  await page.setViewportSize({ width: 1366, height: 860 });
});

await step('No JavaScript errors during the run', async () => { expect(!errors.length, errors.join(' | ')); });

await browser.close();
console.log(results.join('\n'));
console.log(failed ? `\nE2E FAILED: ${failed} step(s)` : '\nE2E PASSED');
process.exit(failed ? 1 : 0);
