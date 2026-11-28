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


test('legacy Greek playlists and UTF-16BE reuse the current subtitle decoder',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wf-m3u-encoding-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'Greek.m3u'),strict=path.join(dir,'Greek.m3u8');
 const legacy=Buffer.concat([Buffer.from('#EXTM3U\nC:\\Music\\'),Buffer.from([0xca,0xe1,0xeb,0xe7,0xec,0xdd,0xf1,0xe1]),Buffer.from('.mp3\n')]);
 fs.writeFileSync(file,legacy);assert.deepEqual(M.readM3uFile(file).items,['C:\\Music\\Καλημέρα.mp3']);
 fs.writeFileSync(strict,legacy);assert.equal(M.readM3uFile(strict),null);
 const utf16=Buffer.from('#EXTM3U\nC:\\Music\\Καλημέρα.mp3\n','utf16le');utf16.swap16();
 fs.writeFileSync(file,Buffer.concat([Buffer.from([0xfe,0xff]),utf16]));
 assert.deepEqual(M.readM3uFile(file).items,['C:\\Music\\Καλημέρα.mp3']);
 fs.writeFileSync(strict,'\ufeff#EXTM3U\nC:\\Music\\Καλημέρα.mp3\n');assert.deepEqual(M.readM3uFile(strict).items,['C:\\Music\\Καλημέρα.mp3']);
});
test('playlist admission refuses embedded controls and both UNC separator styles',()=>{
 const unsafe=['C:\\a\tb.mp4','C:\\a\x7fb.mp4','//server/share/a.mp4','\\\\server\\share\\a.mp4','C:\\a.mp4:stream'];
 for(const p of unsafe)assert.equal(M.validRef(p),false);
 assert.deepEqual(M.parseM3u(unsafe.join('\n')+'\nrelative.mp4','D:\\Lists'),{items:['D:\\Lists\\relative.mp4'],skipped:5});
});
