'use strict';
// photo:save IPC handler, run against a minimal in-process stub of the electron module (no real Electron, no user data: temp folder only).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const handlers = {};
let target = '';
const stub = {
  ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; }, on() {} },
  dialog: { showSaveDialog: async () => ({ canceled: false, filePath: target }), showOpenDialog: async () => ({ canceled: true }) },
  protocol: { handle() {}, registerSchemesAsPrivileged() {} },
  net: {},
  app: { getPath: () => os.tmpdir() },
};
const origLoad = Module._load;
Module._load = function (request, ...rest) { return request === 'electron' ? stub : origLoad.call(this, request, ...rest); };
const M = require('../media-main.js');
Module._load = origLoad;

test('photo save writes only the supplied ArrayBuffer view', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-photo-'));
  const senderFrame = { url: 'opsis-ui://app/fixture.html' };
  const sender = { mainFrame: senderFrame };
  M.init({ getMainWin: () => ({ isDestroyed: () => false, webContents: sender }), resolveFfmpegPath: () => null });
  const save = handlers['photo:save'];
  assert.equal(typeof save, 'function');
  const big = new Uint8Array([9, 9, 1, 2, 3, 9]);
  target = path.join(dir, 'a.png');
  assert.equal((await save({ sender, senderFrame }, { format: 'png', name: 'x', bytes: big.subarray(2, 5) })).ok, true);
  assert.deepEqual([...fs.readFileSync(target)], [1, 2, 3]);
  target = path.join(dir, 'b.png');
  assert.equal((await save({ sender, senderFrame }, { format: 'png', name: 'x', bytes: new DataView(big.buffer, 1, 2) })).ok, true);
  assert.deepEqual([...fs.readFileSync(target)], [9, 1]);
  target = path.join(dir, 'c.png');
  assert.equal((await save({ sender, senderFrame }, { format: 'png', name: 'x', bytes: new Uint8Array([7, 8]).buffer })).ok, true);
  assert.deepEqual([...fs.readFileSync(target)], [7, 8]);
  target = path.join(dir, 'd.png');
  assert.equal((await save({ sender: {} }, { format: 'png', name: 'x', bytes: new Uint8Array([1]).buffer })).ok, false);
  assert.equal(fs.existsSync(target), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('photo metadata round-trips only the capture date on JPEG and PNG exports', () => {
  const { captureDate, attachCaptureDate } = require('../photo-metadata.js');
  const date = '2026:11:20 12:34:56';
  const jpg = Buffer.from([255, 216, 255, 217]);
  const png = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(13, 8);
  png.write('IHDR', 12);
  for (const [file, format] of [[jpg, 'jpeg'], [png, 'png']]) {
    assert.equal(captureDate(attachCaptureDate(file, format, date)), date);
    assert.equal(captureDate(attachCaptureDate(file, format, 'invalid')), null);
  }
});
