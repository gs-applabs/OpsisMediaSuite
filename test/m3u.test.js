'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const M = require('../m3u.js');

test('validRef: only absolute paths and http(s) URLs', () => {
  for (const ok of ['C:\\a\\b.mp4', 'c:/a/b.mp4','https://x.org/a.mp4', 'http://x.org/a']) assert.equal(M.validRef(ok), true, ok);
  for (const bad of ['', 'a.mp4', '..\\a.mp4', 'file:///C:/a', 'dvd:///D:', 'javascript:alert(1)', 'C:\\a\n.mp4', 'x'.repeat(3000)]) assert.equal(M.validRef(bad), false, bad);
});

test('m3u: relative entries resolve against the playlist folder, comments and bad schemes are dropped', () => {
  const r = M.parseM3u('#EXTM3U\n#EXTINF:1,x\nsub\\a.mp4\nC:\\abs\\b.mp4\ndvd:///x\nhttps://h.org/s.mp4\n', 'D:\\Lists');
  assert.deepEqual(r.items, ['D:\\Lists\\sub\\a.mp4', 'C:\\abs\\b.mp4', 'https://h.org/s.mp4']);
  assert.equal(r.skipped, 1);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wf-m3u-')), 'My List.m3u');
  fs.writeFileSync(f, '#EXTM3U\nC:\\x\\y.mp4\n');
  assert.deepEqual(M.readM3uFile(f), { name: 'My List', items: ['C:\\x\\y.mp4'], skipped: 0 });
  assert.equal(M.readM3uFile('relative.m3u'), null);
  assert.equal(M.readM3uFile(path.join(os.tmpdir(), 'x.txt')), null);
});

test('validRef: UNC paths and control characters are refused (NTLM leak risk)', () => {
  for (const bad of ['\\\\srv\\share\\x.mkv', '\\\\10.0.0.1\\s\\a.mp4', 'C:\\a\0b.mp4', 'C:\\a\rb.mp4']) assert.equal(M.validRef(bad), false, JSON.stringify(bad));
  assert.deepEqual(M.parseM3u('\\\\srv\\share\\x.mkv\nC:\\ok.mp4\n', 'D:\\L'), { items: ['C:\\ok.mp4'], skipped: 1 });
});

test('EXTINF metadata does not consume the 5000-track limit', () => {
  let t = '#EXTM3U\n';
  for (let i = 0; i < 5001; i++) t += '#EXTINF:1,t' + i + '\nC:\\m\\' + i + '.mp4\n';
  const r = M.parseM3u(t, 'D:\\L');
  assert.equal(r.items.length, 5000);
  assert.equal(r.items[4999], 'C:\\m\\4999.mp4');
});

test('legacy Greek playlists decode Windows-1253 while M3U8 requires UTF-8', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-m3u-greek-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const line = Buffer.concat([Buffer.from('C:\\Music\\'), Buffer.from([0xc5, 0xeb, 0xeb, 0xdc, 0xe4, 0xe1]), Buffer.from('.mp3\n')]);
  const legacy = path.join(dir, 'Greek.m3u');
  const utf8 = legacy + '8';
  fs.writeFileSync(legacy, line);
  fs.writeFileSync(utf8, line);
  assert.deepEqual(M.readM3uFile(legacy)?.items, ['C:\\Music\\Ελλάδα.mp3']);
  assert.equal(M.readM3uFile(utf8), null);
});
