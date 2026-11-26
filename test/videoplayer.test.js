'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../renderer/vplib.js');
const M = require('../media-main.js');

test('srt -> vtt: timestamps, indexes, ASS-style tags, shift and clamping', () => {
  const srt = '\uFEFF1\r\n00:00:01,500 --> 00:00:03,000\r\n{\\an8}Γεια <i>σου</i>\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,250\r\nΔεύτερο\r\nδιπλό\r\n\r\ngarbage\r\n\r\n3\r\n00:00:06,000 --> 00:00:05,000\r\nreverse\r\n';
  const r = V.srtToVtt(srt, 0);
  assert.equal(r.cues, 2);
  assert.ok(r.vtt.startsWith('WEBVTT\n\n00:00:01.500 --> 00:00:03.000\nΓεια <i>σου</i>\n'));
  assert.ok(r.vtt.includes('00:00:04.000 --> 00:00:05.250\nΔεύτερο\nδιπλό'));
  const later = V.srtToVtt(srt, 2000);
  assert.ok(later.vtt.includes('00:00:03.500 --> 00:00:05.000'));
  const earlier = V.srtToVtt(srt, -2000);
  assert.equal(earlier.cues, 2, 'a cue that starts before 0 is kept when it still ends after 0');
  assert.ok(earlier.vtt.includes('00:00:00.000 --> 00:00:01.000'));
  assert.equal(V.srtToVtt(srt, -9000).cues, 0);
  assert.equal(V.srtToVtt('', 0).cues, 0);
});

test('vtt input passes through, ass dialogue is converted', () => {
  const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.000\nshort form\n';
  assert.equal(V.srtToVtt(vtt, 0).cues, 1);
  assert.ok(V.srtToVtt(vtt, 0).vtt.includes('00:00:01.000 --> 00:00:02.000'));
  const ass = '[Script Info]\nTitle: x\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.50,0:00:03.00,Default,,0,0,0,,{\\i1}Hello, world\\Nsecond\nDialogue: 0,bad,0:00:03.00,Default,,0,0,0,,x\n';
  const r = V.subtitleToVtt(ass, 'ass', 0);
  assert.equal(r.cues, 1);
  assert.ok(r.vtt.includes('00:00:01.500 --> 00:00:03.000\nHello, world\nsecond'));
});

test('resume, recent, bookmarks', () => {
  assert.equal(V.resumeAction(2000, 600000), 'clear');
  assert.equal(V.resumeAction(120000, 600000), 'save');
  assert.equal(V.resumeAction(595000, 600000), 'clear');
  assert.equal(V.resumeAction(1000, 0), 'keep');
  assert.deepEqual(V.pushRecent(['a', 'b', 'c'], 'b', 3), ['b', 'a', 'c']);
  assert.equal(V.pushRecent(Array.from({ length: 40 }, (_, i) => 'p' + i), 'new').length, 30);
  let bm = V.addBookmark([], 'x.mp4', 5000); bm = V.addBookmark(bm, 'x.mp4', 5400); bm = V.addBookmark(bm, 'x.mp4', 1000);
  assert.deepEqual(V.sortedBookmarks(bm, 'x.mp4').map((b) => b.ms), [1000, 5000]);
  assert.equal(V.clock(3723000), '1:02:03'); assert.equal(V.clock(65000), '1:05'); assert.equal(V.clock(-5), '0:00');
});

test('file kinds, titles and URLs', () => {
  assert.equal(V.kindOf('C:\\a\\b.MKV'), 'video'); assert.equal(V.kindOf('C:\\a\\b.flac'), 'audio'); assert.equal(V.kindOf('C:\\a\\b.txt'), '');
  assert.equal(V.kindOf('https://x.org/live'), 'video');
  assert.equal(V.titleOf('C:\\Films\\My.Movie.2020.mkv'), 'My.Movie.2020'); assert.equal(V.titleOf('https://x.org/a/b.mp4?token=1'), 'b');
  assert.equal(V.mediaUrl('C:\\Films\\a b.mp4'), null);
  assert.equal(V.mediaUrl('https://x.org/a.mp4'), 'https://x.org/a.mp4');
  assert.equal(V.mediaUrl('C:\\Films\\a b.mp4'), null, 'local media must obtain an opaque ticket from main');
  assert.equal(V.playable('C:\\x\\y.mp4'), true); assert.equal(V.playable('C:\\x\\y.exe'), false); assert.equal(V.playable('..\\y.mp4'), false); assert.equal(V.playable(5), false);
  assert.equal(V.playable('C:\\x\\y.mp4\n'), false); assert.equal(V.playable('C:\\x\\y\0.mp4'), false); assert.equal(V.playable('\\\\srv\\share\\y.mp4'), false);
});

test('subtitle bytes: UTF-8, UTF-8 BOM and Windows-1253 (Greek) all decode', () => {
  assert.equal(M.decodeText(Buffer.from('Καλημέρα', 'utf8')), 'Καλημέρα');
  assert.equal(M.decodeText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Καλημέρα')])), 'Καλημέρα');
  assert.equal(M.decodeText(Buffer.from([0xca, 0xe1, 0xeb, 0xe7, 0xec, 0xdd, 0xf1, 0xe1])), 'Καλημέρα');
});

test('the main process side only serves media and subtitles, never other file types', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'media-main.js'), 'utf8');
  assert.match(src, /SERVE_EXTS = new Set\(\[\.\.\.VIDEO_EXTS, \.\.\.AUDIO_EXTS, \.\.\.SUB_EXTS\]\)/);
  for (const ch of ['vp:pick', 'vp:subs-for', 'vp:pick-sub', 'vp:exists', 'photo:pick', 'photo:read', 'photo:save', 'vp:pick-m3u']) {
    const i = src.indexOf(`'${ch}'`); assert.ok(i > 0, ch);
    assert.ok(/trusted\(e\)/.test(src.slice(i, i + 220)), ch + ' checks the sender');
  }
  assert.ok(!/\.sub|exe|bat|dll/.test(M.VIDEO_EXTS.join(',') + M.AUDIO_EXTS.join(',')));
  assert.ok(![...M.VIDEO_EXTS, ...M.AUDIO_EXTS].some((e) => ['exe', 'bat', 'cmd', 'dll', 'js', 'ps1', 'json'].includes(e)));
});

test('repeat modes decide what plays next', () => {
  assert.equal(V.nextIndex('off', 0, 3), 1); assert.equal(V.nextIndex('off', 2, 3), -1);
  assert.equal(V.nextIndex('list', 2, 3), 0); assert.equal(V.nextIndex('file', 1, 3), 1);
  assert.equal(V.nextIndex('off', 0, 0), -1);
  for (let i = 0; i < 20; i++) { const n = V.nextIndex('shuffle', 2, 5, i / 20); assert.ok(n >= 0 && n < 5 && n !== 2, 'shuffle never repeats the current one: ' + n); }
  assert.equal(V.nextIndex('shuffle', 0, 1), 0);
});

test('picture controls build a CSS filter and transform, neutral gives empty strings', () => {
  assert.deepEqual(V.pictureCss({ brightness: 100, contrast: 100, saturation: 100, rotate: 0 }, 800, 450), { filter: '', transform: '' });
  const c = V.pictureCss({ brightness: 120, contrast: 90, saturation: 300, rotate: 90, flipH: true }, 800, 450);
  assert.match(c.filter, /brightness\(120%\).*contrast\(90%\).*saturate\(200%\)/);
  assert.match(c.transform, /rotate\(90deg\) scale\(0\.5\d*\) scaleX\(-1\)/);
  assert.equal(V.pictureCss({ rotate: 45 }, 800, 450).transform, '');
});

test('A-B loop goes none -> A -> loop -> none and ignores a B that is not after A', () => {
  let s = V.abStep(undefined, 10); assert.deepEqual(s, { stage: 'a', a: 10, b: 0 });
  assert.equal(V.abStep(s, 10.1).stage, 'a');
  s = V.abStep(s, 25); assert.deepEqual(s, { stage: 'loop', a: 10, b: 25 });
  assert.equal(V.abStep(s, 30).stage, 'off');
});

test('live duration and invalid clock are safe', () => {
  assert.equal(V.resumeAction(10000, Infinity),'keep');
  assert.equal(V.clock(Infinity),'0:00');
});
test('UTF-16 big endian Greek subtitles decode and SSA is recognized', () => {
  const b = Buffer.from('Καλημέρα','utf16le').swap16();
  assert.equal(M.decodeText(Buffer.concat([Buffer.from([0xfe,0xff]),b])), 'Καλημέρα');
  assert.ok(M.SUB_EXTS.includes('ssa'));
  assert.ok(!M.SUB_EXTS.includes('sub'));
});
test('subtitle blank-line whitespace and VTT NOTE blocks', () => {
  const r = V.srtToVtt('WEBVTT\n\nNOTE ignore\n00:00:01.000 --> 00:00:02.000\nno\n\n00:00:01.000 --> 00:00:02.000\nyes\n \n00:00:02.000 --> 00:00:03.000\nnext',0);
  assert.equal(r.cues,2); assert.ok(!r.vtt.includes('\nno\n'));
});
test('local file policy rejects nonmedia and symlink aliases', () => {
  const fs=require('node:fs'), os=require('node:os'), path=require('node:path'), P=require('../local-media-policy.js');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wf-policy-'));
  try {
    const file=path.join(dir,'a.mp4'), other=path.join(dir,'a.txt');
    fs.writeFileSync(file,'x'); fs.writeFileSync(other,'x');
    assert.ok(P.allowedFile(file,new Set(['mp4'])));
    assert.equal(P.allowedFile(other,new Set(['mp4'])),null);
    assert.equal(P.localPath('relative.mp4'),null);
    const link=path.join(dir,'alias.mp4');
    try { fs.symlinkSync(file,link,'file'); } catch(e) { if (!['EPERM','EACCES'].includes(e.code)) throw e; }
    if(fs.existsSync(link)) assert.equal(P.localPath(link),null);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('invalid subtitle seconds are not accepted as a shorter timestamp; VTT settings survive', () => {
  const r=V.srtToVtt('WEBVTT\n\n00:00:99.000 --> 00:01:00.000\ninvalid\n\n00:01.000 --> 00:02.000 line:10% align:start\nvalid',0);
  assert.equal(r.cues,1); assert.ok(r.vtt.includes('line:10% align:start'));
  assert.equal(V.playable('C:\\movie.mp4:stream.mp4'),false);
});

test('parsed subtitle entries provide explicit timing and Greek text',()=>{
 const r=V.srtToVtt('1\n00:00:00,200 --> 00:00:01,500\nΚαλημέρα',0);
 assert.deepEqual(r.entries,[{start:.2,end:1.5,text:'Καλημέρα',settings:''}]);
});
test('byte ranges reject invalid and multi ranges and clamp valid ends',()=>{
 const {parseRange}=require('../media-stream');
 assert.deepEqual(parseRange('bytes=2-99',10),{start:2,end:9,partial:true});
 assert.deepEqual(parseRange('bytes=-3',10),{start:7,end:9,partial:true});
 assert.deepEqual(parseRange('bytes=0-',10),{start:0,end:9,partial:true});
 for(const r of ['bytes=10-','bytes=4-2','bytes=-0','bytes=0-1,4-5','bytes=999999999999999999999-'])assert.equal(parseRange(r,10),null);
});
test('media responses stream exact requested bytes with explicit MIME',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {serveFile}=require('../media-stream');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wf-range-'));
 try{const p=path.join(dir,'sample.webm');fs.writeFileSync(p,Buffer.from([1,2,3,4,5]));
 const r=await serveFile(p,'webm',new Request('https://localhost/',{headers:{range:'bytes=1-3'}}));
 assert.equal(r.status,206);assert.equal(r.headers.get('content-type'),'video/webm');assert.equal(r.headers.get('content-range'),'bytes 1-3/5');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[2,3,4]);
 const h=await serveFile(p,'webm',new Request('https://localhost/',{method:'HEAD'}));assert.equal(h.headers.get('content-length'),'5');assert.equal(h.body,null);
 const invalid=await serveFile(p,'webm',new Request('https://localhost/',{headers:{range:'bytes=9-'}}));assert.equal(invalid.status,416);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('engine candidates are ordered, deduplicated and exclude DirectShow for remote sources',()=>{
 const {candidates}=require('../playback-core');assert.deepEqual(candidates({available:['chromium','directshow','libvlc'],preferred:'directshow',local:false}),['libvlc','chromium']);
 assert.deepEqual(candidates({available:['chromium','directshow','libvlc'],preferred:'directshow'}),['directshow','libvlc','chromium']);
});
test('playback session falls back only once per adapter and disposes failures',async()=>{
 const {PlaybackSession}=require('../playback-core');let closed=0;
 const adapter=ok=>({open:async()=>({ok}),play:async()=>{},pause:async()=>{},seek:async()=>{},stop:async()=>{},dispose:async()=>{closed++;}});
 const s=new PlaybackSession({libvlc:()=>adapter(false),chromium:()=>adapter(true)});
 const r=await s.open('clip',{local:true});assert.equal(r.engine,'chromium');assert.equal(closed,1);assert.equal(await s.seek(Infinity),false);assert.equal(await s.play(),true);await s.stop();assert.equal(closed,2);
});
test('superseded engine opening cannot replace a newer session',async()=>{
 const {PlaybackSession}=require('../playback-core');let release,closed=0,calls=0;
 const s=new PlaybackSession({chromium:()=>{const first=++calls===1;return {open:()=>first?new Promise(r=>{release=r;}):Promise.resolve({ok:true}),play:async()=>{},pause:async()=>{},seek:async()=>{},stop:async()=>{},dispose:async()=>{closed++;}};}});
 const old=s.open('first');await new Promise(r=>setImmediate(r));const newer=await s.open('second');release({ok:true});assert.equal((await old).code,'superseded');assert.equal(newer.ok,true);assert.equal(s.state,'ready');assert.equal(closed,1);await s.stop();
});

test('codec inventory accepts only bounded known metadata and deduplicates registry views',()=>{
 const {normalize}=require('../codec-inventory');const report=normalize({packs:[{name:'K-Lite Codec Pack Mega',version:'19',view:'64'},{name:'K-Lite Codec Pack Mega',view:'64'},{name:'Unrelated tool',view:'64'}],filters:[{name:'LAV Video Decoder',view:'32'},{name:'arbitrary',view:'64'}],transforms:[{name:'AV1 Decoder',view:'64'}]},'x64');
 assert.equal(report.packs.length,1);assert.equal(report.filters[0].name,'LAV Video Decoder');assert.equal(report.transforms.length,1);assert.equal(report.arch,'x64');
});
