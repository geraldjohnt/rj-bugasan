/*
 * Price poster renderer (D-047). Draws a Facebook-ready "Price update" image on a <canvas>: brand, date,
 * Cash price and Payday option panels, tagline and a "Message us" banner on a wooden strip. Everything is drawn with shapes and
 * the bundled Inter font, so it works offline from file:// and the canvas is never tainted (PNG export works).
 */
import { posterPrice, posterDate, brandLines } from '../../domain/poster.js';

const W = 1200;
export const POSTER_SCALE = 1.5; // 1800 px wide output
const SANS = 'Inter, "Segoe UI", Arial, sans-serif';
const SCRIPT = '"Segoe Script", "Brush Script MT", "Lucida Handwriting", "Apple Chancery", cursive';

const C = {
  paper1: '#fbf5e6', paper2: '#eadcbd', green: '#17652a', greenDark: '#0f4a1d', greenLight: '#e6efcb',
  red: '#e2401b', redDark: '#a82a0e', redLight: '#fde4d6', ink: '#2a2118', muted: '#9a9184',
  sack: '#e8c98c', sackLine: '#b08443', wood1: '#7a4a26', wood2: '#4e2c14',
};

/** Make sure the poster fonts are ready before drawing (fonts are local; this never hits the network). */
export async function loadPosterFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try { await Promise.all(['900 40px Inter', '800 20px Inter', '700 20px Inter'].map((f) => document.fonts.load(f, 'A₱'))); } catch (e) { /* fallback fonts are fine */ }
}

/* ------------------------------------------------------------------ helpers */

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function roundRect(ctx, x, y, w, h, r) {
  const rr = typeof r === 'number' ? [r, r, r, r] : r;
  ctx.beginPath();
  ctx.moveTo(x + rr[0], y);
  ctx.lineTo(x + w - rr[1], y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr[1]);
  ctx.lineTo(x + w, y + h - rr[2]); ctx.quadraticCurveTo(x + w, y + h, x + w - rr[2], y + h);
  ctx.lineTo(x + rr[3], y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr[3]);
  ctx.lineTo(x, y + rr[0]); ctx.quadraticCurveTo(x, y, x + rr[0], y);
  ctx.closePath();
}

/** Largest font size ≤ size at which text fits maxW. */
function fit(ctx, text, style, size, maxW, family = SANS) {
  let s = size;
  for (; s > 8; s -= 1) { ctx.font = `${style} ${s}px ${family}`; if (ctx.measureText(text).width <= maxW) break; }
  return s;
}

function shadow(ctx, color, blur, dx, dy) { ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetX = dx; ctx.shadowOffsetY = dy; }
const noShadow = (ctx) => shadow(ctx, 'transparent', 0, 0, 0);

/* ------------------------------------------------------------------ pieces */

function paper(ctx, H) {
  const g = ctx.createRadialGradient(W / 2, H * 0.35, 100, W / 2, H * 0.45, Math.max(W, H) * 0.8);
  g.addColorStop(0, C.paper1); g.addColorStop(1, C.paper2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const r = rng(7);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(120,90,40,0.06)' : 'rgba(255,255,255,0.35)';
    ctx.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
  }
}

/** Small rice sack used as the row icon. */
function miniSack(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 30, s / 30);
  ctx.fillStyle = C.sack; ctx.strokeStyle = C.sackLine; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(9, 7); ctx.quadraticCurveTo(4, 14, 4, 22); ctx.quadraticCurveTo(4, 29, 15, 29);
  ctx.quadraticCurveTo(26, 29, 26, 22); ctx.quadraticCurveTo(26, 14, 21, 7); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(8, 3); ctx.lineTo(11, 7); ctx.lineTo(19, 7); ctx.lineTo(22, 3); ctx.lineTo(18, 5); ctx.lineTo(15, 2); ctx.lineTo(12, 5); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c0392b'; ctx.fillRect(10, 6.5, 10, 2);
  ctx.fillStyle = C.green; // two-leaf emblem
  ctx.beginPath(); ctx.ellipse(12.5, 19, 2.6, 5.2, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(17.5, 19, 2.6, 5.2, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.greenDark; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(15, 26); ctx.lineTo(15, 15); ctx.stroke();
  ctx.restore();
}





function table(ctx, top, H) {
  const g = ctx.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, C.wood1); g.addColorStop(1, C.wood2);
  ctx.fillStyle = g; ctx.fillRect(0, top, W, H - top);
  const r = rng(5);
  ctx.strokeStyle = 'rgba(30,15,5,0.25)'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 26; i++) {
    const y = top + r() * (H - top);
    ctx.beginPath(); ctx.moveTo(0, y);
    for (let x = 0; x <= W; x += 60) ctx.lineTo(x, y + Math.sin(x / 90 + i) * 3);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, top, W, 4);
}

function ribbon(ctx, cx, y, w, h, lines) {
  const x = cx - w / 2;
  ctx.save();
  ctx.fillStyle = C.greenDark; // tails
  for (const side of [-1, 1]) {
    const ex = side < 0 ? x - 46 : x + w + 46; const ix = side < 0 ? x + 10 : x + w - 10;
    ctx.beginPath(); ctx.moveTo(ix, y + 18); ctx.lineTo(ex, y + 18); ctx.lineTo(ex + side * -24, y + 18 + (h - 10) / 2); ctx.lineTo(ex, y + h + 8); ctx.lineTo(ix, y + h + 8); ctx.closePath(); ctx.fill();
  }
  shadow(ctx, 'rgba(0,0,0,0.4)', 16, 0, 8);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#22803a'); g.addColorStop(1, C.green);
  ctx.fillStyle = g; roundRect(ctx, x, y, w, h, 10); ctx.fill();
  noShadow(ctx);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
  roundRect(ctx, x + 8, y + 8, w - 16, h - 16, 6); ctx.stroke(); ctx.setLineDash([]);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  let ty = y + 26;
  for (const l of lines) {
    const s = fit(ctx, l.text, l.style, l.size, w - 60);
    ctx.font = `${l.style} ${s}px ${SANS}`; ctx.fillStyle = l.color || '#fff';
    ty += s + (l.gap || 6);
    ctx.fillText(l.text, cx, ty - 6);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ panels */

function panel(ctx, x, y, w, rows, rowH, kind, opts) {
  const cash = kind === 'cash';
  const main = cash ? C.green : C.red;
  const dark = cash ? C.greenDark : C.redDark;
  const light = cash ? C.greenLight : C.redLight;
  const headH = 84, subH = 36, colH = 34, padB = 16;
  const bodyH = Math.max(rows.length, 1) * rowH + 14;
  const h = headH + subH + colH + bodyH + padB;

  ctx.save();
  shadow(ctx, 'rgba(60,40,10,0.28)', 22, 0, 10);
  ctx.fillStyle = 'rgba(255,252,244,0.92)'; roundRect(ctx, x, y, w, h, 26); ctx.fill();
  noShadow(ctx);
  ctx.lineWidth = 5; ctx.strokeStyle = main; roundRect(ctx, x, y, w, h, 26); ctx.stroke();

  // header band
  const hg = ctx.createLinearGradient(0, y, 0, y + headH);
  hg.addColorStop(0, cash ? '#1f7a35' : '#ef5a2c'); hg.addColorStop(1, main);
  ctx.fillStyle = hg; roundRect(ctx, x, y, w, headH, [26, 26, 0, 0]); ctx.fill();
  const title = cash ? opts.cashTitle : opts.paydayTitle;
  const tagW = !cash && opts.paydayTag ? 120 : 0;
  const ts = fit(ctx, title, '900', 52, w - 48 - (tagW ? tagW + 14 : 0));
  ctx.font = `900 ${ts}px ${SANS}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  shadow(ctx, 'rgba(0,0,0,0.3)', 0, 2, 3);
  ctx.fillText(title, tagW ? x + (w - tagW - 14) / 2 + 6 : x + w / 2, y + headH / 2 + 2);
  noShadow(ctx);

  if (tagW) { // "MAX 1 MONTH" pinned card
    const tx = x + w - tagW - 14, ty = y + 12;
    ctx.save(); ctx.translate(tx + tagW / 2, ty + 30); ctx.rotate(0.04);
    shadow(ctx, 'rgba(0,0,0,0.3)', 6, 1, 3);
    ctx.fillStyle = '#fff'; ctx.fillRect(-tagW / 2, -28, tagW, 56);
    noShadow(ctx);
    const words = opts.paydayTag.toUpperCase().split(/\s+/);
    const half = Math.ceil(words.length / 2);
    const tl = words.length > 2 ? [words.slice(0, half).join(' '), words.slice(half).join(' ')] : words.length === 2 ? words : [words[0]];
    ctx.fillStyle = dark; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    tl.forEach((t, i) => { const s = fit(ctx, t, '800', 18, tagW - 14); ctx.font = `800 ${s}px ${SANS}`; ctx.fillText(t, 0, tl.length === 1 ? 2 : -10 + i * 22); });
    for (const px of [-tagW / 2 + 10, tagW / 2 - 10]) { ctx.fillStyle = '#c62828'; ctx.beginPath(); ctx.arc(px, -20, 4.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  // sub band
  let cy = y + headH;
  ctx.fillStyle = light; ctx.fillRect(x + 2.5, cy, w - 5, subH);
  const sub = cash ? opts.cashSubtitle : opts.paydaySubtitle;
  const ss = fit(ctx, sub, '700', 19, w - 40);
  ctx.font = `700 ${ss}px ${SANS}`; ctx.fillStyle = dark; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(sub, x + w / 2, cy + subH / 2 + 1);
  cy += subH;

  // column headings
  ctx.fillStyle = dark; ctx.fillRect(x + 2.5, cy, w - 5, colH);
  ctx.font = `800 17px ${SANS}`; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; ctx.fillText('RICE NAME', x + 56, cy + colH / 2 + 1);
  ctx.textAlign = 'right'; ctx.fillText('PRICE', x + w - 26, cy + colH / 2 + 1);
  cy += colH + 7;

  // rows
  const nameX = x + 56, priceR = x + w - 24;
  const nameSize = Math.min(23, Math.round(rowH * 0.56));
  if (!rows.length) {
    ctx.font = `600 18px ${SANS}`; ctx.fillStyle = C.muted; ctx.textAlign = 'center';
    ctx.fillText('No items selected', x + w / 2, cy + rowH / 2);
  }
  rows.forEach((r, i) => {
    const my = cy + i * rowH + rowH / 2;
    if (i % 2 === 1) { ctx.fillStyle = cash ? 'rgba(23,101,42,0.05)' : 'rgba(226,64,27,0.05)'; ctx.fillRect(x + 8, my - rowH / 2, w - 16, rowH); }
    miniSack(ctx, x + 16, my - rowH * 0.36, rowH * 0.72);
    const price = posterPrice(cash ? r.cashC : r.paydayC) + (r.perKg ? '/kg' : '');
    ctx.font = `800 ${nameSize}px ${SANS}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const pw = ctx.measureText(price).width;
    const maxName = priceR - pw - 30 - nameX;
    const ns = fit(ctx, r.name, '700', nameSize, maxName);
    ctx.font = `700 ${ns}px ${SANS}`; ctx.textAlign = 'left';
    const nw = ctx.measureText(r.name).width;
    const col = r.soldOut ? C.muted : C.ink;
    ctx.fillStyle = col; ctx.fillText(r.name, nameX, my + 1);
    // dotted leader
    ctx.fillStyle = r.soldOut ? 'rgba(154,145,132,0.6)' : 'rgba(42,33,24,0.55)';
    for (let dx = nameX + nw + 8; dx < priceR - pw - 10; dx += 7) { ctx.beginPath(); ctx.arc(dx, my + 6, 1.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = `800 ${nameSize}px ${SANS}`; ctx.textAlign = 'right';
    ctx.fillStyle = r.soldOut ? C.muted : dark; ctx.fillText(price, priceR, my + 1);
    if (r.soldOut) { // crossed out: no stock
      ctx.strokeStyle = 'rgba(42,33,24,0.75)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(nameX - 2, my + 1); ctx.lineTo(nameX + nw + 2, my + 1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(priceR - pw - 2, my + 1); ctx.lineTo(priceR + 2, my + 1); ctx.stroke();
    }
  });
  ctx.restore();
  return h;
}

/* ------------------------------------------------------------------ poster */

/** Height the poster needs for n rows. */
export const rowHeightFor = (n) => (n <= 14 ? 42 : n <= 20 ? 36 : n <= 28 ? 30 : 26);

/**
 * Draw the poster. rows: posterRows(); opts: { businessName, date (ISO), tagline, paydayTag, cta, ctaSub, contact,
 * cashTitle, cashSubtitle, paydayTitle, paydaySubtitle }. Returns the canvas.
 */
export function drawPoster(canvas, rows, opts) {
  const o = {
    cashTitle: 'CASH PRICE', cashSubtitle: 'Pay now and get the best price.',
    paydayTitle: 'PAYDAY OPTION', paydaySubtitle: 'Take the rice today and pay on payday.',
    cta: 'MESSAGE US NOW!!', ctaSub: 'For Order and Inquiries', ...opts,
  };
  const rowH = rowHeightFor(rows.length);
  const panelTop = 300;
  const panelH = 84 + 36 + 34 + Math.max(rows.length, 1) * rowH + 14 + 16;
  const taglineY = panelTop + panelH + 66;
  const footerTop = taglineY - 24;
  const H = footerTop + 230;

  canvas.width = Math.round(W * POSTER_SCALE); canvas.height = Math.round(H * POSTER_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(POSTER_SCALE, 0, 0, POSTER_SCALE, 0, 0);
  paper(ctx, H);

  // brand (top-left)
  const lines = brandLines(o.businessName);
  ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  const brand = (text, size, y) => {
    const s = fit(ctx, text, '900', size, 320);
    ctx.font = `900 ${s}px ${SANS}`;
    shadow(ctx, 'rgba(0,0,0,0.25)', 6, 3, 5);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 12; ctx.strokeText(text, 46, y);
    noShadow(ctx);
    ctx.fillStyle = C.green; ctx.fillText(text, 46, y);
    return s;
  };
  if (lines.length === 2) { brand(lines[0], 118, 150); brand(lines[1], 66, 232); } else brand(lines[0], 90, 190);
  ctx.restore();

  // date (top-right)
  ctx.save();
  ctx.font = `900 28px ${SANS}`; ctx.fillStyle = C.greenDark; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(posterDate(o.date), W - 42, 58);
  ctx.restore();

  // PRICE UPDATE
  ctx.save();
  const headline = 'PRICE UPDATE';
  const hx = 395, hw = W - hx - 40;
  const hs = fit(ctx, headline, 'italic 900', 122, hw);
  ctx.font = `italic 900 ${hs}px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  const hy = 195;
  shadow(ctx, 'rgba(0,0,0,0.3)', 10, 4, 6);
  ctx.strokeStyle = C.redDark; ctx.lineWidth = 14; ctx.strokeText(headline, hx, hy);
  noShadow(ctx);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.strokeText(headline, hx, hy);
  const hg = ctx.createLinearGradient(0, hy - hs, 0, hy);
  hg.addColorStop(0, '#ff7a2f'); hg.addColorStop(1, '#de3414');
  ctx.fillStyle = hg; ctx.fillText(headline, hx, hy);
  // green swoosh
  const tw = Math.min(ctx.measureText(headline).width, hw);
  ctx.fillStyle = C.green;
  ctx.beginPath(); ctx.moveTo(hx + 10, hy + 40); ctx.quadraticCurveTo(hx + tw / 2, hy + 4, hx + tw - 10, hy + 26);
  ctx.quadraticCurveTo(hx + tw / 2, hy + 30, hx + 10, hy + 40); ctx.closePath(); ctx.fill();
  ctx.restore();

  // panels
  const gap = 30, pw = (W - 2 * 36 - gap) / 2;
  panel(ctx, 36, panelTop, pw, rows, rowH, 'cash', o);
  panel(ctx, 36 + pw + gap, panelTop, pw, rows, rowH, 'payday', o);

  // tagline
  if (o.tagline) {
    ctx.save();
    const s = fit(ctx, o.tagline, 'italic 700', 52, W - 460, SCRIPT);
    ctx.font = `italic 700 ${s}px ${SCRIPT}`; ctx.fillStyle = C.greenDark; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    shadow(ctx, 'rgba(255,255,255,0.9)', 0, 2, 2);
    ctx.fillText(o.tagline, W / 2, taglineY);
    ctx.restore();
  }

  // footer: wooden strip and banner (no illustrations — owner request 2026-11-26)
  table(ctx, footerTop + 70, H);
  const ctaLines = [
    { text: o.cta, style: '900', size: 46 },
    { text: o.ctaSub, style: '700', size: 25 },
  ];
  if (o.contact) ctaLines.push({ text: o.contact, style: '800', size: 24, color: '#ffe27a' });
  ribbon(ctx, W / 2, footerTop + 70, 560, o.contact ? 150 : 120, ctaLines);
  return canvas;
}

/** Canvas → PNG Blob. */
export const posterBlob = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png');
});

/** Save a Blob as a file (works from file:// — no server needed). */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
