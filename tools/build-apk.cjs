#!/usr/bin/env node
/*
 * Android APK build (developer machine only — D-058). Run on its own with `npm run apk`, only when the owner
 * asks for an APK (it is NOT part of `npm run release`). Packs the current /dist, so build /dist first.
 *
 * Packs the minified /dist app into a small native Android WebView wrapper (android/) and writes
 *   apk/rj-ims-<version>.apk
 * Earlier versions in apk/ are never deleted.
 *
 * No Gradle: uses the Android SDK build tools directly (aapt2, javac, d8, zipalign, apksigner).
 * Needs: a JDK (javac, jar, keytool) and an Android SDK with a platform (android-35 or newer) and build-tools.
 * The SDK is found via ANDROID_HOME, ANDROID_SDK_ROOT, ~/android-sdk or ~/Android/Sdk.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ANDROID = path.join(ROOT, 'android');
const OUT_DIR = path.join(ROOT, 'apk');
const KEYSTORE = path.join(ANDROID, 'keystore', 'rj-ims-release.jks');
const KS_ALIAS = 'rj-ims';
const KS_PASS = process.env.RJ_APK_KS_PASS || 'rj-ims-release';

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts });
  } catch (e) {
    const out = [e.stdout, e.stderr].filter(Boolean).join('\n');
    throw new Error(`${path.basename(cmd)} failed:\n${out || e.message}`);
  }
}

const verNum = (v) => v.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
const byVersion = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };

function findSdk() {
  const candidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), 'android-sdk'), path.join(os.homedir(), 'Android', 'Sdk')].filter(Boolean);
  for (const sdk of candidates) {
    const bt = path.join(sdk, 'build-tools');
    const pf = path.join(sdk, 'platforms');
    if (!fs.existsSync(bt) || !fs.existsSync(pf)) continue;
    const tools = fs.readdirSync(bt).filter((d) => fs.existsSync(path.join(bt, d, 'aapt2'))).sort(byVersion);
    const plats = fs.readdirSync(pf).filter((d) => /^android-\d+$/.test(d) && fs.existsSync(path.join(pf, d, 'android.jar')))
      .sort((a, b) => parseInt(a.slice(8), 10) - parseInt(b.slice(8), 10));
    if (tools.length && plats.length && parseInt(plats[plats.length - 1].slice(8), 10) >= 35) {
      return { sdk, bt: path.join(bt, tools[tools.length - 1]), androidJar: path.join(pf, plats[plats.length - 1], 'android.jar') };
    }
  }
  return null;
}

function listFiles(dir, ext) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, ext));
    else if (!ext || p.endsWith(ext)) out.push(p);
  }
  return out;
}

function ensureKeystore() {
  if (fs.existsSync(KEYSTORE)) return;
  // Created once, then kept in the repository: every later APK must be signed with the SAME key,
  // or Android refuses to install it as an update (the user would have to uninstall and lose local data).
  fs.mkdirSync(path.dirname(KEYSTORE), { recursive: true });
  run('keytool', ['-genkeypair', '-keystore', KEYSTORE, '-storetype', 'PKCS12', '-alias', KS_ALIAS,
    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    '-storepass', KS_PASS, '-keypass', KS_PASS, '-dname', 'CN=RJ Inventory, O=RJ, C=PH']);
  console.log(`[apk] created signing key ${path.relative(ROOT, KEYSTORE)} (keep it: updates need the same key)`);
}

async function buildApk() {
  const t0 = Date.now();
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const version = pkg.version;
  const [maj, min, pat] = verNum(version);
  const versionCode = maj * 10000 + min * 100 + pat;
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/index.html not found — build /dist first (`npm run release`).');

  const sdk = findSdk();
  if (!sdk) throw new Error('Android SDK not found (needs build-tools and platforms;android-35 or newer). Set ANDROID_HOME.');
  const tool = (n) => path.join(sdk.bt, n);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rj-apk-'));
  try {
    // 1. Web app → assets/www (the same minified files as /dist) + the Android bridge script.
    const www = path.join(work, 'assets', 'www');
    fs.cpSync(DIST, www, { recursive: true });
    const esbuild = require('esbuild');
    const bridge = esbuild.transformSync(fs.readFileSync(path.join(ANDROID, 'bridge', 'android-bridge.js'), 'utf8'), { minify: true, target: 'chrome80' }).code;
    fs.writeFileSync(path.join(www, 'android-bridge.js'), bridge);
    const indexFile = path.join(www, 'index.html');
    let html = fs.readFileSync(indexFile, 'utf8');
    const at = html.indexOf('<script');
    if (at < 0) throw new Error('dist/index.html has no <script> tag to put the Android bridge before.');
    html = html.slice(0, at) + '<script src="android-bridge.js"></script>' + html.slice(at);
    fs.writeFileSync(indexFile, html);

    // 2. Resources: strings + launcher icon (the brand logo, D-048).
    const res = path.join(work, 'res');
    fs.cpSync(path.join(ANDROID, 'res'), res, { recursive: true });
    const icon = path.join(res, 'mipmap-xxxhdpi');
    fs.mkdirSync(icon, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'src/assets/brand/favicon-192.png'), path.join(icon, 'ic_launcher.png'));
    const resZip = path.join(work, 'res.zip');
    run(tool('aapt2'), ['compile', '--dir', res, '-o', resZip]);

    // 3. Manifest + link → unsigned APK with resources and assets.
    const manifest = path.join(work, 'AndroidManifest.xml');
    fs.writeFileSync(manifest, fs.readFileSync(path.join(ANDROID, 'AndroidManifest.xml'), 'utf8')
      .replace(/__VERSION_CODE__/g, String(versionCode)).replace(/__VERSION_NAME__/g, version));
    const linked = path.join(work, 'linked.apk');
    run(tool('aapt2'), ['link', '-I', sdk.androidJar, '--manifest', manifest, '-A', path.join(work, 'assets'), '-o', linked, resZip]);

    // 4. Java → classes.dex
    const classes = path.join(work, 'classes');
    const dex = path.join(work, 'dex');
    fs.mkdirSync(classes); fs.mkdirSync(dex);
    run('javac', ['--release', '11', '-nowarn', '-encoding', 'UTF-8', '-classpath', sdk.androidJar, '-d', classes, ...listFiles(path.join(ANDROID, 'src'), '.java')]);
    run(tool('d8'), ['--release', '--min-api', '24', '--lib', sdk.androidJar, '--output', dex, ...listFiles(classes, '.class')]);
    run('jar', ['--update', '--no-manifest', '--file', linked, '-C', dex, 'classes.dex']);

    // 5. Align + sign (APK Signature Scheme v2/v3).
    const aligned = path.join(work, 'aligned.apk');
    run(tool('zipalign'), ['-p', '-f', '4', linked, aligned]);
    ensureKeystore();
    const signed = path.join(work, 'signed.apk');
    run(tool('apksigner'), ['sign', '--ks', KEYSTORE, '--ks-key-alias', KS_ALIAS, '--ks-pass', `pass:${KS_PASS}`,
      '--key-pass', `pass:${KS_PASS}`, '--out', signed, aligned]);
    run(tool('apksigner'), ['verify', signed]);

    // 6. Keep every version: apk/rj-ims-<version>.apk (only the file for THIS version is replaced).
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const dest = path.join(OUT_DIR, `rj-ims-${version}.apk`);
    fs.copyFileSync(signed, dest);
    const kb = (fs.statSync(dest).size / 1024).toFixed(0);
    console.log(`[apk] ${path.relative(ROOT, dest)}  ${kb} KB  versionCode ${versionCode}  (${Date.now() - t0} ms)`);
    return dest;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

module.exports = { buildApk };

if (require.main === module) {
  buildApk().catch((err) => { console.error(`[apk] ${err.message}`); process.exit(1); });
}
