/*
 * E2E: Phase 9 (calendar: month + agenda views, filters, custom events, event details modal) in demo mode (Firebase config forced to null),
 * opened via file://.  Usage: node tests/e2e/calendar.e2e.js [build|dist] [screenshotDir]
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
const lineCost = (n) => page.locator('.sale-line').nth(n - 1).locator('.sale-line-price input');
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const [Y, M] = TODAY.split('-').map(Number);
const title = (y, m) => `${MONTHS[m - 1]} ${y}`;
const next = M === 12 ? [Y + 1, 1] : [Y, M + 1];
const cell = (d) => page.locator(`.cal-cell[data-date="${d}"]`);

await step('Sign in to the calendar; this month is shown with today highlighted', async () => {
  await page.goto(url + '#/calendar');
  await page.fill('input[autocomplete="username"]', 'owner');
  await page.fill('input[autocomplete="current-password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForSelector(`.cal-title:text-is("${title(Y, M)}")`);
  expect(await cell(TODAY).evaluate((el) => el.classList.contains('is-today')), 'today not highlighted');
});

await step('With sample data: overdue, payment, sale, delivery and restock entries appear', async () => {
  await page.goto(url + '#/settings/system');
  await page.click('button:has-text("Load sample data")');
  await page.click('.dialog-footer button:has-text("Load sample data")');
  await toast('Sample data loaded');
  await page.goto(url + '#/calendar/agenda?m=' + TODAY.slice(0, 7));
  await page.waitForSelector('.agenda-day');
  // sample data spans this month; entries of each kind exist in this or the previous/next month
  const kinds = new Set();
  for (const m of [[Y, M], next, M === 1 ? [Y - 1, 12] : [Y, M - 1]]) {
    await page.goto(url + `#/calendar/agenda?m=${m[0]}-${String(m[1]).padStart(2, '0')}`);
    await page.waitForSelector('.agenda, .empty-state');
    for (const t of await page.locator('.agenda-row .badge').allInnerTexts()) kinds.add(t.replace(/ · late$/, ''));
  }
  for (const k of ['Overdue', 'Payment due', 'Sales', 'Deliveries', 'Restocking', 'Other']) expect(kinds.has(k), 'missing kind ' + k + ' in ' + [...kinds].join(','));
  expect(await page.isVisible('.banner:has-text("overdue")'), 'overdue banner missing');
  await shot('50-agenda');
});

await step('Add a custom event on today; it shows in the month grid', async () => {
  await page.goto(url + '#/calendar/month?m=' + TODAY.slice(0, 7));
  await page.click('button:has-text("Add event")');
  await page.click('.dialog-footer button:has-text("Add event")');
  await page.waitForSelector('.dialog .field-error:has-text("Required")');
  await field('Title').fill('Supplier visit');
  await field('Time').fill('10:30');
  await page.click('.dialog-footer button:has-text("Add event")');
  await toast('Event added');
  await cell(TODAY).locator('.cal-chip:has-text("10:30 Supplier visit")').first().waitFor();
  await shot('51-month');
});

await step('Clicking the event shows its details in a modal; Edit moves it to another date', async () => {
  const day = TODAY.slice(0, 8) + (Number(TODAY.slice(8)) === 1 ? '02' : '01');
  await cell(TODAY).locator('.cal-chip:has-text("Supplier visit")').first().click();
  await page.waitForSelector('.dialog-title:text-is("Supplier visit")');
  expect(await page.isVisible('.dialog .cal-detail dd:text-is("10:30")'), 'time not shown in details');
  await page.click('.dialog-footer button:has-text("Edit")');
  await page.waitForSelector('.dialog-title:text-is("Edit event")');
  await field('Title').fill('Supplier visit (moved)');
  await field('Date').fill(day);
  await page.click('.dialog-footer button:has-text("Save")');
  await toast('Event saved');
  await cell(day).locator('.cal-chip:has-text("Supplier visit (moved)")').waitFor();
  expect(!(await cell(TODAY).locator('.cal-chip:has-text("Supplier visit")').count()), 'still on the old date');
});

await step('Filters hide a category and are remembered after reload', async () => {
  const before = await page.locator('.cal-chip.cal-other').count();
  expect(before > 0, 'no custom chips');
  await page.click('.cal-filter:has-text("Other")');
  expect(await page.locator('.cal-chip.cal-other').count() === 0, 'Other still shown');
  await page.reload();
  await page.waitForSelector('.cal-month');
  expect(await page.locator('.cal-chip.cal-other').count() === 0, 'filter not remembered');
  await page.click('.cal-filter:has-text("Other")');
  expect(await page.locator('.cal-chip.cal-other').count() === before, 'Other not back');
});

await step('Month navigation: next, previous and Today update the title and the URL', async () => {
  await page.click('button[aria-label="Next month"]');
  await page.waitForSelector(`.cal-title:text-is("${title(next[0], next[1])}")`);
  expect(page.url().includes(`m=${next[0]}-${String(next[1]).padStart(2, '0')}`), 'url not updated');
  await page.click('button[aria-label="Previous month"]');
  await page.click('button[aria-label="Previous month"]');
  await page.click('.cal-toolbar button:has-text("Today")');
  await page.waitForSelector(`.cal-title:text-is("${title(Y, M)}")`);
});

await step('Clicking a derived entry pops up its details without leaving the calendar', async () => {
  const before = page.url();
  await page.locator('.cal-chip.cal-sale').first().click();
  await page.waitForSelector('.dialog .cal-detail dt:text-is("Customer")');
  for (const t of ['Sale', 'Items', 'Total', 'Balance']) expect(await page.isVisible(`.dialog .cal-detail dt:text-is("${t}")`), 'missing ' + t);
  expect(page.url() === before, 'navigated away: ' + page.url());
  await shot('53-event-details');
  await page.click('.dialog-footer button:has-text("Close")');
  const due = page.locator('.cal-chip.cal-overdue, .cal-chip.cal-payment_due').first();
  if (await due.count()) {
    await due.click();
    await page.waitForSelector('.dialog .cal-detail dt:text-is("Still to pay")');
    await page.click('.dialog-footer button:has-text("Close")');
  }
});

await step('Day dialog lists the day\'s entries; an entry opens its details, and "Open sale" opens the record', async () => {
  const d = await page.locator('.cal-cell:has(.cal-chip.cal-overdue), .cal-cell:has(.cal-chip.cal-payment_due), .cal-cell:has(.cal-chip.cal-sale)').first().getAttribute('data-date');
  await cell(d).locator('.cal-daynum').click();
  await page.waitForSelector('.dialog .agenda-row');
  await page.locator('.dialog .agenda-row button').first().click();
  await page.waitForSelector('.dialog .cal-detail');
  await page.click('.dialog-footer button:has-text("Open sale")');
  await page.waitForSelector('h1:has-text("RJ-")');
});

await step('Delete the custom event', async () => {
  await page.goto(url + '#/calendar/agenda?m=' + TODAY.slice(0, 7));
  await page.click('.agenda-row button:has-text("Supplier visit (moved)")');
  await page.click('.dialog-footer button:has-text("Edit")');
  await page.click('.dialog-footer button:has-text("Delete")');
  await toast('Event deleted');
  expect(!(await page.isVisible('text=Supplier visit (moved)')), 'event still shown');
});

await step('Phone width: month and agenda do not overflow sideways', async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  for (const p of ['#/calendar/month', '#/calendar/agenda']) {
    await page.goto(url + p);
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow <= 0, `${p} overflow: ${overflow}px`);
  }
  await shot('52-calendar-phone');
  await page.setViewportSize({ width: 1366, height: 860 });
});

await step('No JavaScript errors during the run', async () => { expect(!errors.length, errors.join(' | ')); });

await browser.close();
console.log(results.join('\n'));
console.log(failed ? `\nE2E FAILED: ${failed} step(s)` : '\nE2E PASSED');
process.exit(failed ? 1 : 0);
