/*
 * E2E: Phase 5 customers in demo mode (Firebase config forced to null), opened via file://.
 * Usage: node tests/e2e/customers.e2e.js [build|dist] [screenshotDir]
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

const field = (label, scope = '.dialog') => page.locator(`${scope} .field`).filter({ has: page.locator('.field-label', { hasText: new RegExp('^' + label) }) }).locator('input, select, textarea').first();
const toast = (text) => page.waitForSelector(`.toast:has-text("${text}")`);
const stat = async (label) => (await page.locator('.stat').filter({ has: page.locator('.stat-label', { hasText: new RegExp('^' + label + '$') }) }).locator('.stat-value').textContent()).trim();
const tab = (name) => page.click(`.tab:has-text("${name}")`);

await step('Sign in and open Customers: empty state offers Add customer and sample data', async () => {
  await page.goto(url + '#/customers');
  await page.fill('input[autocomplete="username"]', 'owner');
  await page.fill('input[autocomplete="current-password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=No customers yet');
  expect(await page.isVisible('.empty-state button:has-text("Load sample data")'), 'sample data button missing');
});

await step('Add customer: name and contact number are required', async () => {
  await page.click('.page-header button:has-text("Add customer")');
  await page.waitForSelector('.dialog');
  await page.click('.dialog-footer button:has-text("Add customer")');
  await page.waitForSelector('.dialog .field-error:has-text("Required.")');
  expect(await page.locator('.dialog .field-error').count() >= 2, 'expected name and contact errors');
  await field('Name').fill('Test Nena Store');
  await field('Contact number').fill('abc');
  await page.click('.dialog-footer button:has-text("Add customer")');
  await page.waitForSelector('.dialog .field-error:has-text("valid phone")');
});

await step('Add customer with credit limit → detail page shows it', async () => {
  await field('Customer type').selectOption('Store');
  await field('Contact number').fill('0917 555 1234');
  await field('Address').fill('Purok 3, San Isidro');
  await field('Credit limit').fill('5,000');
  await shot('20-customer-form');
  await page.click('.dialog-footer button:has-text("Add customer")');
  await page.waitForSelector('h1:has-text("Test Nena Store")');
  expect(await stat('Credit limit') === '₱5,000.00', 'limit: ' + await stat('Credit limit'));
  expect(await stat('Outstanding balance') === '₱0.00', 'balance: ' + await stat('Outstanding balance'));
  expect(await page.isVisible('h1 .badge:has-text("New payer")'), 'reliability badge missing');
  await page.waitForSelector('dd:has-text("Purok 3, San Isidro")');
});

await step('Contacts: add two, only one primary; edit; remove', async () => {
  await tab('Contacts');
  await page.waitForSelector('text=No alternate contacts');
  await page.click('button:has-text("Add contact")');
  await page.click('.dialog-footer button:has-text("Save contact")');
  await page.waitForSelector('.dialog .field-error:has-text("Required.")');
  await field('Name').fill('Mario Santos');
  await page.click('.dialog-footer button:has-text("Save contact")');
  await page.waitForSelector('.dialog .field-error:has-text("at least a phone")');
  await field('Relationship').fill('Son');
  await field('Contact number').fill('0918 555 0102');
  await page.click('.dialog-footer button:has-text("Save contact")');
  await toast('Mario Santos added as a contact.');
  await page.click('button:has-text("Add contact")');
  await field('Name').fill('Liza Cruz');
  await field('Facebook').fill('facebook.com/liza');
  await page.check('.dialog input[type="checkbox"]');
  await page.click('.dialog-footer button:has-text("Save contact")');
  await toast('Liza Cruz added');
  expect(await page.locator('.contact-card').count() === 2, 'two contacts expected');
  expect(await page.locator('.contact-card .badge:has-text("Primary")').count() === 1, 'exactly one primary expected');
  expect((await page.locator('.contact-card').first().textContent()).includes('Liza'), 'primary should be listed first');
  await page.click('button[aria-label="Edit Mario Santos"]');
  await field('Relationship').fill('Eldest son');
  await page.click('.dialog-footer button:has-text("Save contact")');
  await toast('Contact saved.');
  await page.waitForSelector('.contact-card:has-text("Eldest son")');
  await shot('21-contacts');
  await page.click('button[aria-label="Remove Liza Cruz"]');
  await page.click('.dialog-footer button:has-text("Remove contact")');
  await toast('Contact removed.');
  expect(await page.locator('.contact-card').count() === 1, 'one contact expected after removal');
});

await step('Tab state is in the URL and survives reload; sales/payments/schedule tabs are empty for a new customer', async () => {
  await page.reload();
  await page.waitForSelector('.tab.is-active:has-text("Contacts")');
  await tab('Sales');
  await page.waitForSelector('text=No sales yet');
  await tab('Payments');
  await page.waitForSelector('text=No payments yet');
  await tab('Schedule');
  await page.waitForSelector('text=Nothing scheduled');
  await tab('Contacts');
});

await step('Edit: clear credit limit; duplicate-name warning shown for a new customer', async () => {
  await page.click('.page-header button:has-text("Edit")');
  await field('Credit limit').fill('');
  await page.click('.dialog-footer button:has-text("Save changes")');
  await toast('Changes saved.');
  expect(await stat('Credit limit') === 'None', 'limit: ' + await stat('Credit limit'));
  await page.goto(url + '#/customers');
  await page.click('.page-header button:has-text("Add customer")');
  await field('Name').fill('test nena store');
  await page.waitForSelector('.dialog .banner:has-text("already named")');
  await page.keyboard.press('Escape');
});

await step('Search by phone digits and by alternate contact name', async () => {
  await field('Search', '.toolbar').fill('5551234');
  await page.waitForSelector('.table a:has-text("Test Nena Store")');
  await field('Search', '.toolbar').fill('mario');
  await page.waitForSelector('.table a:has-text("Test Nena Store")');
  await field('Search', '.toolbar').fill('nobody here');
  await page.waitForSelector('text=No matching customers');
  await field('Search', '.toolbar').fill('');
});

await step('Archive and restore; archived customers are filtered out by default', async () => {
  await page.click('.table a:has-text("Test Nena Store")');
  await page.click('.page-header button:has-text("Archive")');
  await page.click('.dialog-footer button:has-text("Archive customer")');
  await toast('Customer archived.');
  await page.waitForSelector('.banner:has-text("archived")');
  await page.goto(url + '#/customers');
  await page.waitForSelector('.toolbar-end:has-text("1 shown")'); // only Walk-in
  await field('Status', '.toolbar').selectOption('ARCHIVED');
  await page.click('.table a:has-text("Test Nena Store")');
  await page.click('.page-header button:has-text("Restore")');
  await page.click('.dialog-footer button:has-text("Restore customer")');
  await toast('Customer restored.');
});

await step('Walk-in is built in: listed, no Edit or Archive', async () => {
  await page.goto(url + '#/customers');
  await page.click('.table a:has-text("Walk-in")');
  await page.waitForSelector('h1:has-text("Walk-in")');
  expect(await page.isVisible('h1 .badge:has-text("Built-in")'), 'built-in badge missing');
  expect(!(await page.isVisible('.page-header button:has-text("Edit")')), 'Walk-in must not be editable');
  expect(!(await page.isVisible('.page-header button:has-text("Archive")')), 'Walk-in must not be archivable');
});

await step('Load sample data: 5 customers added; second load adds nothing', async () => {
  await page.goto(url + '#/settings/system');
  await page.click('button:has-text("Load sample data")');
  await page.click('.dialog-footer button:has-text("Load sample data")');
  await toast('5 customer(s)');
  await page.click('button:has-text("Load sample data")');
  await page.click('.dialog-footer button:has-text("Load sample data")');
  await toast('Sample data is already loaded.');
  await page.goto(url + '#/customers');
  await page.waitForSelector('.toolbar-end:has-text("7 shown")');
  await page.waitForSelector(`.table a:has-text("Aling Nena's Sari-sari Store")`);
  await field('Type', '.toolbar').selectOption('Household');
  await page.waitForSelector('.toolbar-end:has-text("2 shown")');
  await field('Type', '.toolbar').selectOption('');
  await shot('22-customers-list');
});

await step('Phone width: list and detail do not overflow sideways', async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(200);
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 0, 'list overflow: ' + overflow + 'px');
  await page.click(`.table a:has-text("Aling Nena's Sari-sari Store")`);
  await page.waitForSelector(`h1:has-text("Aling Nena")`);
  await tab('Contacts');
  await page.waitForTimeout(200);
  overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 0, 'detail overflow: ' + overflow + 'px');
  await shot('23-customer-phone');
  await page.setViewportSize({ width: 1366, height: 860 });
});

await step('No JavaScript errors during the run', async () => { expect(!errors.length, errors.join(' | ')); });

await browser.close();
console.log(results.join('\n'));
console.log(failed ? `\nE2E FAILED: ${failed} step(s)` : '\nE2E PASSED');
process.exit(failed ? 1 : 0);
