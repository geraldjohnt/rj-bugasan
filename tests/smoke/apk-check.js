/*
 * APK check (D-058): verifies apk/rj-ims-<version>.apk for the current package.json version.
 *   1. Signature (apksigner verify), package id, version and launcher activity (aapt2 dump badging).
 *   2. The packed web app is the same as /dist (every /dist file is inside assets/www, byte for byte,
 *      except index.html, which only gains the Android bridge script tag).
 *   3. The packed app starts from file:// with the network disabled (like dist-smoke), with a fake
 *      window.RJAndroid bridge, and window.print() and blob downloads are routed to that bridge.
 * Cannot replace a test on a real phone (no Android emulator here) — see TESTING_STATUS.
 * Usage: node tests/smoke/apk-check.js
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const apk = path.join(ROOT, 'apk', `rj-ims-${pkg.version}.apk`);
if (!fs.existsSync(apk)) { console.error(`Missing ${apk} — run npm run apk first.`); process.exit(1); }

const failures = [];
const ok = (cond, msg) => { if (!cond) failures.push(msg); else console.log(`  ok   ${msg}`); };

// --- 1. signature + manifest
const sdkDirs = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, path.join(os.homedir(), 'android-sdk'), path.join(os.homedir(), 'Android', 'Sdk')].filter(Boolean);
let bt = null;
for (const s of sdkDirs) {
  const d = path.join(s, 'build-tools');
  if (fs.existsSync(d)) { const v = fs.readdirSync(d).sort(); if (v.length) { bt = path.join(d, v[v.length - 1]); break; } }
}
if (!bt) { console.error('Android SDK build-tools not found (ANDROID_HOME).'); process.exit(1); }
try { execFileSync(path.join(bt, 'apksigner'), ['verify', apk], { stdio: 'pipe' }); ok(true, 'APK signature verifies'); }
catch (e) { failures.push(`apksigner verify failed: ${e.stderr || e.message}`); }
const badging = execFileSync(path.join(bt, 'aapt2'), ['dump', 'badging', apk], { encoding: 'utf8' });
ok(badging.includes("package: name='com.rjbugasan.ims'"), 'package id com.rjbugasan.ims');
ok(badging.includes(`versionName='${pkg.version}'`), `versionName ${pkg.version}`);
ok(badging.includes("launchable-activity: name='com.rjbugasan.ims.MainActivity'"), 'launcher activity present');
ok(badging.includes("uses-permission: name='android.permission.INTERNET'"), 'INTERNET permission');

// --- 2. packed web app == /dist
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rj-apk-check-'));
try {
  execFileSync('unzip', ['-q', apk, '-d', work]);
  const www = path.join(work, 'assets', 'www');
  ok(fs.existsSync(path.join(work, 'classes.dex')), 'classes.dex present');
  const dist = path.join(ROOT, 'dist');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  let same = 0;
  for (const f of walk(dist)) {
    const rel = path.relative(dist, f);
    const packed = path.join(www, rel);
    if (!fs.existsSync(packed)) { failures.push(`Missing in APK: ${rel}`); continue; }
    if (rel === 'index.html') {
      const a = fs.readFileSync(f, 'utf8');
      const b = fs.readFileSync(packed, 'utf8').replace('<script src="android-bridge.js"></script>', '');
      if (a !== b) failures.push('APK index.html differs from dist/index.html beyond the bridge script tag'); else same++;
    } else if (!fs.readFileSync(f).equals(fs.readFileSync(packed))) failures.push(`APK file differs from /dist: ${rel}`);
    else same++;
  }
  ok(same === walk(dist).length, `all ${same} /dist files packed unchanged`);

  // --- 3. packed app runs (file://, offline) and the bridge routes print + downloads
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ offline: true });
    await context.addInitScript(() => {
      window.__bridgeCalls = [];
      window.RJAndroid = {
        print: (t) => window.__bridgeCalls.push(['print', t]),
        saveFile: (n, m, b64) => window.__bridgeCalls.push(['saveFile', n, m, b64]),
        toast: (m) => window.__bridgeCalls.push(['toast', m]),
        isAndroid: () => true,
      };
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => failures.push(`Page error: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') failures.push(`Console error: ${m.text()}`); });
    page.on('requestfailed', (r) => { if (r.url().startsWith('file://')) failures.push(`Missing local file: ${r.url()}`); });
    await page.goto('file://' + path.join(www, 'index.html'));
    await page.waitForSelector('html[data-app-ready="true"]', { timeout: 15000 });
    ok(await page.isVisible('h1:has-text("Sign in")'), 'packed app starts and shows Sign in');

    await page.evaluate(() => window.print());
    let calls = await page.evaluate(() => window.__bridgeCalls);
    ok(calls.some((c) => c[0] === 'print'), 'window.print() goes to the Android print bridge');

    await page.evaluate(() => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['hello,world\n'], { type: 'text/csv' }));
      a.download = 'test.csv';
      document.body.appendChild(a); a.click(); a.remove();
    });
    await page.waitForFunction(() => window.__bridgeCalls.some((c) => c[0] === 'saveFile'), null, { timeout: 5000 }).catch(() => {});
    calls = await page.evaluate(() => window.__bridgeCalls);
    const save = calls.find((c) => c[0] === 'saveFile');
    ok(!!save && save[1] === 'test.csv' && save[2] === 'text/csv' && Buffer.from(save[3], 'base64').toString() === 'hello,world\n',
      'blob download goes to the Android save bridge with name, type and content');
  } finally {
    await browser.close();
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\nAPK CHECK FAILED (${path.relative(ROOT, apk)}):\n - ` + failures.join('\n - '));
  process.exit(1);
}
console.log(`\nAPK CHECK PASSED: ${path.relative(ROOT, apk)}`);
