/*
 * E2E: Phase 10 (dashboard KPIs, chart, reports with presets, print and CSV) cross-checked against each other, in demo mode (Firebase config forced to null),
 * opened via file://.  Usage: node tests/e2e/reports.e2e.js [build|dist] [screenshotDir]
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
const context = await browser.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true });
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
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const FROM = addDays(TODAY, -120);
const kpi = {};
const report = async (tab, q = '') => { await page.goto(url + `#/reports/${tab}${q}`); await page.waitForSelector('.stat-strip .stat'); await page.waitForTimeout(150); };
const near = (a, b) => Math.abs(a - b) < 0.005;

await step('Sign in to the dashboard; empty database offers sample data', async () => {
  await page.goto(url + '#/');
  await page.fill('input[autocomplete="username"]', 'owner');
  await page.fill('input[autocomplete="current-password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForSelector('h1:has-text("Dashboard")');
  await page.waitForSelector('text=Nothing to show yet');
  expect(!(await page.isVisible('button:has-text("Load sample data")')), 'dashboard must not offer sample data (D-057)');
  await loadSample();
  await toast('Sample data loaded');
  await page.goto(url + '#/');
  await page.waitForSelector('text=Needs attention');
});

await step('Dashboard: KPIs, attention list, 14-day chart with hover and table view', async () => {
  for (const k of ['Revenue this month', 'Gross profit this month', 'Net profit this month', 'Cash collected this month', 'Receivables', 'Overdue', 'Stock value']) kpi[k] = money(await stat(k));
  expect(kpi.Overdue > 0 && kpi.Receivables >= kpi.Overdue, 'overdue/receivables ' + JSON.stringify(kpi));
  expect(await page.isVisible('.attention:has-text("overdue installment")'), 'overdue not in attention list');
  expect(await page.locator('svg path.chart-rev').count() > 0, 'no revenue bars');
  await page.locator('.chart-hit').last().hover();
  await page.waitForSelector('.chart-tip:has-text("Revenue")');
  await page.click('.chart-table summary');
  expect(await page.locator('.chart-table tbody tr').count() === 14, '14 rows expected in table view');
  await shot('60-dashboard');
});

await step('KPI tiles link to the matching screens', async () => {
  await page.click('.stat-link:has-text("Overdue")');
  await page.waitForSelector('h1:has-text("Collections")');
  expect(page.url().includes('#/collections/overdue'), page.url());
});

await step('Sales report (this month) matches the dashboard revenue; cancelled sales excluded', async () => {
  await report('sales');
  expect(near(money(await stat('Revenue')), kpi['Revenue this month']), 'revenue differs from dashboard');
  const rows = await page.locator('.table tbody tr').count();
  expect(rows === Number(await stat('Sales')), 'rows vs count');
  await report('sales', `?from=${FROM}&to=${TODAY}`);
  await page.waitForSelector('.report-note:has-text("cancelled sale")');
  expect(!(await page.isVisible('.table td:has-text("Carmen Dela Cruz")')), 'cancelled sale (Carmen) listed');
  await shot('61-report-sales');
});

await step('Period presets and custom range drive the URL; From after To warns', async () => {
  await field('Period', '.toolbar').selectOption('year');
  await page.waitForFunction(() => location.hash.includes('-01-01&to='));
  await page.goto(url + `#/reports/sales?from=${TODAY}&to=${addDays(TODAY, -1)}`);
  await page.waitForSelector('.banner:has-text("is after")');
  expect(await page.isDisabled('button:has-text("Export CSV")'), 'export allowed on a bad range');
});

await step('Profit by item adds up to revenue; profit & loss: net = gross − expenses and matches the dashboard', async () => {
  await report('profit');
  const itemRev = money(await stat('Revenue'));
  const charges = money(await stat('Other charges'));
  // Phase 13 (D-054): other charges (delivery fee …) are not item revenue.
  expect(near(itemRev + charges, kpi['Revenue this month']), `item revenue ${itemRev} + charges ${charges}`);
  expect(near(money(await stat('Gross profit')) + charges, kpi['Gross profit this month']), 'gross profit differs');
  await report('pnl');
  const g = money(await stat('Gross profit')), e = money(await stat('Expenses')), n = money(await stat('Net profit'));
  expect(near(n, g - e), `net ${n} vs ${g} − ${e}`);
  expect(near(n, kpi['Net profit this month']), 'net differs from dashboard');
});

await step('Cash collected, receivables aging and inventory valuation match the dashboard', async () => {
  await report('cash');
  expect(near(money(await stat('Cash collected')), kpi['Cash collected this month']), 'cash differs');
  await report('aging');
  expect(near(money(await stat('Receivables')), kpi.Receivables), 'receivables differ');
  expect(near(money(await stat('Overdue')), kpi.Overdue), 'overdue differs');
  expect(await page.isVisible('th:text-is("61+ days")'), 'aging buckets missing');
  await report('inventory');
  expect(near(money(await stat('Value at cost')), kpi['Stock value']), 'stock value differs');
});

await step('Movements & losses and restocks by supplier over the last 120 days', async () => {
  await report('movements', `?from=${FROM}&to=${TODAY}`);
  expect(money(await stat('Stock losses')) > 0, 'no losses found');
  await page.waitForSelector('td:has-text("Spillage")');
  await report('restocks', `?from=${FROM}&to=${TODAY}`);
  await page.waitForSelector('td a:has-text("Golden Grains Trading")');
  expect(Number(await stat('Suppliers')) === 2, 'suppliers with deliveries: ' + await stat('Suppliers'));
});

await step('Export CSV downloads the report with a header row and plain numbers', async () => {
  await report('sales', `?from=${FROM}&to=${TODAY}`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export CSV")')]);
  expect(dl.suggestedFilename() === `sales_${FROM}_to_${TODAY}.csv`, dl.suggestedFilename());
  const text = fs.readFileSync(await dl.path(), 'utf8').replace(/^\ufeff/, '');
  const lines = text.trim().split(/\r\n/);
  expect(lines[0] === 'Date,Sale,Customer,Terms,Payment,Other charges,Revenue,Cost,Gross profit,Balance', 'header: ' + lines[0]);
  expect(lines.length === 1 + Number(await stat('Sales')), 'row count');
  expect(/,\d+\.\d{2},/.test(lines[1]), 'money not plain: ' + lines[1]);
});

await step('Print / PDF prints the report with business header and period', async () => {
  await page.evaluate(() => { window.__printed = []; });
  await page.click('button:has-text("Print / PDF")');
  await page.waitForFunction(() => window.__printed.length > 0);
  const printed = await page.evaluate(() => window.__printed[0]);
  expect(/SALES/i.test(printed) && printed.includes('RJ Bugasan') && printed.includes('Total'), printed.slice(0, 200));
});

await step('Phone width: dashboard and reports do not overflow sideways', async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  for (const p of ['#/', '#/reports/sales', '#/reports/aging']) {
    await page.goto(url + p);
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow <= 0, `${p} overflow: ${overflow}px`);
  }
  await shot('62-dashboard-phone');
  await page.setViewportSize({ width: 1366, height: 860 });
});

await step('No JavaScript errors during the run', async () => { expect(!errors.length, errors.join(' | ')); });

await browser.close();
console.log(results.join('\n'));
console.log(failed ? `\nE2E FAILED: ${failed} step(s)` : '\nE2E PASSED');
process.exit(failed ? 1 : 0);
