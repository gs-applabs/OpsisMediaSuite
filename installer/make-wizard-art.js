'use strict';
// Draws the installer wizard pictures with Electron's own canvas (no extra dependency): light and dark tall pictures (BMP) and small PNGs with a
// transparent background (they read on a white and on a dark wizard page). Run:  node_modules\.bin\electron.cmd installer\make-wizard-art.js
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'images');

function bmp24(img) {
  const { width: w, height: h } = img.getSize(), bgra = img.toBitmap(), row = Math.ceil((w * 3) / 4) * 4, buf = Buffer.alloc(54 + row * h);
  buf.write('BM', 0); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14); buf.writeInt32LE(w, 18); buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(row * h, 34); buf.writeInt32LE(2835, 38); buf.writeInt32LE(2835, 42);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = (y * w + x) * 4, d = 54 + (h - 1 - y) * row + x * 3; buf[d] = bgra[s]; buf[d + 1] = bgra[s + 1]; buf[d + 2] = bgra[s + 2]; }
  return buf;
}

const DRAW = `((W, H, kind) => {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const icon = (cx, cy, size) => {
    const x = cx - size / 2, y = cy - size / 2, gr = g.createLinearGradient(x, y, x + size, y + size); gr.addColorStop(0, '#6366f1'); gr.addColorStop(1, '#7c3aed');
    g.save(); g.shadowColor = 'rgba(99,102,241,0.55)'; g.shadowBlur = size * 0.25; g.shadowOffsetY = size * 0.06; rr(x, y, size, size, size * 0.3); g.fillStyle = gr; g.fill(); g.restore();
    const bars = [[2, 10, 13], [6, 6, 17], [10, 3, 21], [14, 8, 15], [18, 5, 18], [22, 10, 13]];
    g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineWidth = size * 0.07;
    const s = size * 0.58 / 24, ox = cx - 12 * s, oy = cy - 12 * s;
    for (const [bx, y1, y2] of bars) { g.beginPath(); g.moveTo(ox + bx * s, oy + y1 * s); g.lineTo(ox + bx * s, oy + y2 * s); g.stroke(); }
  };
  if (kind === 'large' || kind === 'large-dark') {
    const bg = g.createLinearGradient(0, 0, 0, H);
    if (kind === 'large-dark') { bg.addColorStop(0, '#15123a'); bg.addColorStop(1, '#07060f'); } else { bg.addColorStop(0, '#3b2f9e'); bg.addColorStop(1, '#14112e'); }
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.07)'; const n = 9, bw = W / n;
    for (let i = 0; i < n; i++) { const hh = H * (0.12 + 0.1 * Math.abs(Math.sin(i * 1.3 + 0.7))); rr(i * bw + bw * 0.18, H - hh, bw * 0.64, hh + 8, 6); g.fill(); }
    icon(W / 2, H * 0.30, W * 0.52);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '600 ' + Math.round(W * 0.098) + 'px "Segoe UI", sans-serif';
    g.fillText('Opsis Media Suite', W / 2, H * 0.30 + W * 0.26 + W * 0.2);
    g.fillStyle = 'rgba(255,255,255,0.65)'; g.font = Math.round(W * 0.075) + 'px "Segoe UI", sans-serif';
    g.fillText('audio \\u00b7 video \\u00b7 photos', W / 2, H * 0.30 + W * 0.26 + W * 0.31);
  } else {
    icon(W / 2, H / 2, W * 0.86); // transparent background
  }
  return c.toDataURL('image/png');
})`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  for (const [name, W, H, kind] of [['wizard-164x314', 164, 314, 'large'], ['wizard-246x471', 246, 471, 'large'], ['dark-wizard-164x314', 164, 314, 'large-dark'], ['dark-wizard-246x471', 246, 471, 'large-dark'], ['small-55x55', 55, 55, 'small'], ['small-110x110', 110, 110, 'small']]) {
    const img = nativeImage.createFromDataURL(await win.webContents.executeJavaScript(`${DRAW}(${W}, ${H}, '${kind}')`));
    if (kind === 'small') fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); else fs.writeFileSync(path.join(OUT, name + '.bmp'), bmp24(img));
    console.log('wrote', name);
  }
  app.exit(0);
});
