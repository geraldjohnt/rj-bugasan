#!/usr/bin/env node
/*
 * Build script (developer machine only — the client never runs this).
 *   node tools/build.cjs            → /build  (development: readable code, source maps, spike page)
 *   node tools/build.cjs --release  → /dist   (release: minified, no maps, no dev/spike files) — see D-018
 * Output is a static folder that runs by double-clicking index.html (file://).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const RELEASE = process.argv.includes('--release');
const OUT = path.join(ROOT, RELEASE ? 'dist' : 'build');
const NM = path.join(ROOT, 'node_modules');
const pkg = require(path.join(ROOT, 'package.json'));

const VENDOR = [
  // [source in node_modules, output name]
  [RELEASE ? 'react/umd/react.production.min.js' : 'react/umd/react.development.js', 'react.js'],
  [RELEASE ? 'react-dom/umd/react-dom.production.min.js' : 'react-dom/umd/react-dom.development.js', 'react-dom.js'],
  ['firebase/firebase-app-compat.js', 'firebase-app-compat.js'],
  ['firebase/firebase-auth-compat.js', 'firebase-auth-compat.js'],
  ['firebase/firebase-firestore-compat.js', 'firebase-firestore-compat.js'],
];
const LICENSES = [
  ['react/LICENSE', 'react.LICENSE.txt'],
  ['react-dom/LICENSE', 'react-dom.LICENSE.txt'],
  ['firebase/LICENSE', 'firebase.LICENSE.txt'],
  ['@fontsource/inter/LICENSE', 'inter-font.LICENSE.txt'],
  ['lucide/LICENSE', 'lucide-icons.LICENSE.txt'],
];
const FONTS = [400, 500, 600, 700, 800, 900].map((w) => `inter-latin-${w}-normal.woff2`);

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function copy(src, dest, transform) {
  mkdirp(path.dirname(dest));
  if (transform) fs.writeFileSync(dest, transform(fs.readFileSync(src, 'utf8')));
  else fs.copyFileSync(src, dest);
}
const stripSourceMapRef = (s) => s.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/gm, '');

function minifyHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function main() {
  const t0 = Date.now();
  rmrf(OUT);
  mkdirp(OUT);

  const common = {
    bundle: true,
    target: ['chrome100', 'edge100', 'firefox100', 'safari15'],
    minify: RELEASE,
    sourcemap: RELEASE ? false : 'inline',
    legalComments: RELEASE ? 'none' : 'inline',
    logLevel: 'warning',
  };

  // App JS: one classic script (IIFE). React/ReactDOM/firebase are globals from vendor scripts.
  await esbuild.build({
    ...common,
    entryPoints: [path.join(ROOT, 'src/main.jsx')],
    outfile: path.join(OUT, 'app.js'),
    format: 'iife',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    define: {
      'process.env.NODE_ENV': JSON.stringify(RELEASE ? 'production' : 'development'),
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_MODE__: JSON.stringify(RELEASE ? 'release' : 'development'),
    },
  });

  // CSS: bundled; font URLs stay relative (copied below).
  await esbuild.build({
    ...common,
    entryPoints: [path.join(ROOT, 'src/styles/app.css')],
    outfile: path.join(OUT, 'app.css'),
    external: ['*.woff2'],
    sourcemap: false,
  });

  // HTML
  let html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  html = html.replace(/__APP_VERSION__/g, pkg.version);
  fs.writeFileSync(path.join(OUT, 'index.html'), RELEASE ? minifyHtml(html) : html);

  // User guide (Phase 12): self-contained page opened from the user menu.
  const guide = fs.readFileSync(path.join(ROOT, 'src/guide.html'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'guide.html'), RELEASE ? minifyHtml(guide) : guide);

  // Vendor scripts + licenses
  for (const [src, name] of VENDOR) copy(path.join(NM, src), path.join(OUT, 'vendor', name), RELEASE ? stripSourceMapRef : null);
  for (const [src, name] of LICENSES) {
    const file = path.join(NM, src);
    const dest = path.join(OUT, 'vendor/licenses', name);
    if (fs.existsSync(file)) { copy(file, dest); continue; }
    // Some packages (e.g. firebase) ship no LICENSE file: write a notice from package.json instead.
    const meta = require(path.join(NM, path.dirname(src), 'package.json'));
    mkdirp(path.dirname(dest));
    fs.writeFileSync(dest, `${meta.name} ${meta.version}\nLicense: ${meta.license}\nSource: ${(meta.repository && meta.repository.url) || meta.homepage || ''}\n` +
      (meta.license === 'Apache-2.0' ? 'Full text: https://www.apache.org/licenses/LICENSE-2.0\n' : ''));
  }

  // Fonts
  for (const f of FONTS) copy(path.join(NM, '@fontsource/inter/files', f), path.join(OUT, 'assets/fonts', f));

  // Brand logo + favicons (D-048). The master file stays in src only.
  for (const f of ['logo.png', 'favicon-32.png', 'favicon-192.png', 'apple-touch-icon.png']) {
    copy(path.join(ROOT, 'src/assets/brand', f), path.join(OUT, 'assets/brand', f));
  }

  // Config (not a secret)
  copy(path.join(ROOT, 'config/firebase-config.js'), path.join(OUT, 'config/firebase-config.js'));

  // Development-only: Firebase file:// spike page
  if (!RELEASE) {
    copy(path.join(ROOT, 'src/spike/spike.html'), path.join(OUT, 'spike.html'));
    copy(path.join(ROOT, 'src/spike/spike.js'), path.join(OUT, 'spike.js'));
  }

  const size = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1) + ' KB';
  console.log(`[build] ${RELEASE ? 'release → dist' : 'development → build'}  app.js ${size('app.js')}  app.css ${size('app.css')}  (${Date.now() - t0} ms)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
