/*
 * E2E: Phase 2 shell in demo mode (Firebase config forced to null), opened via file://.
 * Usage: node tests/e2e/shell.e2e.js [build|dist] [screenshotDir]
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
const shot = async (page, name) => { if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: false }); } };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 800 } });
await context.addInitScript(() => {
  Object.defineProperty(window, 'RJ_FIREBASE_CONFIG', { configurable: false, get: () => null, set: () => {} });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await step('Unauthenticated visit redirects to sign-in', async () => {
  await page.goto(url + '#/activity');
  await page.waitForSelector('h1:has-text("Sign in")');
  expect(page.url().includes('#/login?next=%2Factivity'), 'expected redirect with next=/activity, got ' + page.url());
  expect(await page.isVisible('text=Demo mode'), 'demo notice missing');
  await shot(page, '01-login');
});

await step('Wrong password shows a clear error and stays signed out', async () => {
  await page.fill('input[autocomplete="username"]', 'owner');
  await page.fill('input[autocomplete="current-password"]', 'wrong-password');
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=Incorrect username or password.');
});

await step('Correct sign-in goes to the requested page', async () => {
  await page.fill('input[autocomplete="current-password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForSelector('h1:has-text("Activity log")');
  expect(await page.isVisible('text=Entries cannot be edited or deleted'), 'activity log page missing');
  expect(await page.isVisible('.nav-item.is-active:has-text("Activity log")'), 'active nav not highlighted');
  await shot(page, '02-shell-placeholder');
});

await step('Session survives a reload (stays signed in)', async () => {
  await page.reload();
  await page.waitForSelector('h1:has-text("Activity log")');
});

await step('Desktop layout: content sits beside the sidebar, not below it', async () => {
  const side = await page.locator('.sidebar').boundingBox();
  const main = await page.locator('.main').boundingBox();
  expect(main.x >= side.x + side.width - 1 && main.y === 0, `main at x=${main.x}, y=${main.y}`);
});

await step('All menu items fit on a 1366×768 laptop screen without scrolling', async () => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const box = await page.locator('.nav-item:has-text("Settings")').boundingBox();
  expect(box && box.y + box.height <= 768, 'Settings menu item below the fold: y=' + (box && box.y));
  await page.setViewportSize({ width: 1366, height: 800 });
});

await step('Sidebar navigation and page title', async () => {
  await page.click('.nav-item:has-text("Items")');
  await page.waitForSelector('h1:has-text("Items")');
  expect((await page.title()).startsWith('Items · '), 'title: ' + await page.title());
});

await step('Unknown route shows "Page not found"', async () => {
  await page.goto(url + '#/nope');
  await page.waitForSelector('h1:has-text("Page not found")');
});

await step('Appearance: dark theme + palette apply everywhere and persist after reload', async () => {
  await page.goto(url + '#/settings/appearance');
  await page.waitForSelector('text=Color palette');
  await page.click('.segmented-option:has-text("Dark")');
  await page.click('.palette-option:has-text("Forest")');
  expect(await page.getAttribute('html', 'data-theme') === 'dark', 'theme not dark');
  expect(await page.getAttribute('html', 'data-palette') === 'forest', 'palette not forest');
  await shot(page, '03-settings-dark-forest');
  await page.reload();
  await page.waitForSelector('text=Color palette');
  expect(await page.getAttribute('html', 'data-theme') === 'dark', 'dark theme lost after reload');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg === 'rgb(14, 19, 26)', 'body background not dark token: ' + bg);
  await page.click('.segmented-option:has-text("Light")');
  await page.click('.palette-option:has-text("Navy")');
});

await step('Density and sidebar preferences', async () => {
  await page.click('.segmented-option:has-text("Compact")');
  expect(await page.getAttribute('html', 'data-density') === 'compact', 'density not compact');
  await page.click('.segmented-option:has-text("Icons only")');
  expect(await page.isVisible('.shell.is-collapsed'), 'sidebar not collapsed');
  await page.click('.segmented-option:has-text("Comfortable")');
  await page.click('.segmented-option:has-text("Show labels")');
});

await step('General settings: validation and save', async () => {
  await page.click('.tab:has-text("General")');
  const name = page.locator('label:has-text("Business name") + .input-wrap input');
  await name.fill('');
  await page.click('button:has-text("Save changes")');
  await page.waitForSelector('text=Required.');
  await name.fill('RJ Bugasan Store');
  expect(!(await page.isVisible('text=Required.')), 'error should clear once the field is edited');
  await page.click('button:has-text("Save changes")');
  await page.waitForSelector('.toast:has-text("Settings saved.")');
  expect((await page.title()).endsWith('RJ Bugasan Store'), 'title did not use business name: ' + await page.title());
  await shot(page, '04-settings-general');
});

await step('Change password: mismatch is caught before submitting', async () => {
  await page.click('.tab:has-text("Account")');
  await page.click('button:has-text("Change password")');
  await page.fill('input[autocomplete="current-password"]', 'demo1234');
  const news = page.locator('input[autocomplete="new-password"]');
  await news.nth(0).fill('newpass123');
  await news.nth(1).fill('different1');
  await page.click('.dialog-footer button:has-text("Change password")');
  await page.waitForSelector('text=Passwords do not match.');
  await shot(page, '05-change-password');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.dialog', { state: 'detached' });
});

await step('Lock screen: wrong password rejected, correct password unlocks', async () => {
  await page.click('.user-button');
  await page.click('.menu-item:has-text("Lock screen")');
  await page.waitForSelector('h1:has-text("Locked")');
  await page.reload(); // lock must survive reopening the app
  await page.waitForSelector('h1:has-text("Locked")');
  await page.fill('input[autocomplete="current-password"]', 'nope');
  await page.click('button:has-text("Unlock")');
  await page.waitForSelector('text=Incorrect password.');
  await shot(page, '06-locked');
  await page.fill('input[autocomplete="current-password"]', 'demo1234');
  await page.click('button:has-text("Unlock")');
  await page.waitForSelector('h1:has-text("Settings")');
});

await step('Sign out returns to sign-in and protects pages again', async () => {
  await page.click('.user-button');
  await page.click('.menu-item:has-text("Sign out")');
  await page.waitForSelector('h1:has-text("Sign in")');
  await page.goto(url + '#/settings');
  await page.waitForSelector('h1:has-text("Sign in")');
});

await step('Phone layout: drawer navigation', async () => {
  await page.fill('input[autocomplete="username"]', 'owner');
  await page.fill('input[autocomplete="current-password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForSelector('h1:has-text("Settings")');
  await page.setViewportSize({ width: 390, height: 780 });
  const offscreen = async () => (await page.locator('.sidebar').boundingBox()).x + 264 <= 1;
  await page.waitForTimeout(300);
  expect(await offscreen(), 'sidebar should be off-screen on phone');
  await page.click('button[aria-label="Open menu"]');
  await page.waitForSelector('.drawer-open');
  await shot(page, '07-phone-drawer');
  await page.click('.nav-item:has-text("Collections")');
  await page.waitForSelector('h1:has-text("Collections")');
  await page.waitForTimeout(300);
  expect(!(await page.isVisible('.drawer-open')) && await offscreen(), 'drawer should close after navigating');
  await page.setViewportSize({ width: 1366, height: 800 });
});

await step('No JavaScript errors during the run', async () => { expect(!errors.length, errors.join(' | ')); });

await browser.close();
console.log(results.join('\n'));
console.log(failed ? `\nE2E FAILED: ${failed} step(s)` : '\nE2E PASSED');
process.exit(failed ? 1 : 0);
