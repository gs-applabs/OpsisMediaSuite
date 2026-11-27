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
  assert.ok(M.SUB_EXTS.includes('sub')); // text MicroDVD only; binary is rejected
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

test('stop disposes pending adapter and cancels an opening session',async()=>{
 const {PlaybackSession}=require('../playback-core');let finish,disposed=0;
 const s=new PlaybackSession({chromium:()=>({open:()=>new Promise(r=>{finish=r;}),play:async()=>{},pause:async()=>{},seek:async()=>{},stop:async()=>{},dispose:async()=>{disposed++;finish({ok:false});}})});
 const p=s.open('clip');await new Promise(r=>setImmediate(r));await s.stop();assert.equal((await p).code,'superseded');assert.equal(disposed,1);assert.equal(s.state,'idle');
});

test('subtitle FPS correction scales timestamps before offset and supports Greek language aliases',()=>{
 const r=V.subtitleToVtt('1\n00:00:10,000 --> 00:00:20,000\nGreek','srt',500,.96);
 assert.equal(r.entries[0].start,10.1);assert.equal(r.entries[0].end,19.7);
 assert.equal(V.preferredSubtitle([{name:'film.en.srt'},{name:'film.Greek.srt'}]),1);
 assert.equal(V.preferredSubtitle([],['el']),-1);
});

test('LAV registration classification distinguishes name, architecture and user override; never enables a decoder',()=>{
 const {classifyLav}=require('../codec-inventory');
 const id='{EE30215D-164F-4A92-A4EB-9D4C13390F9F}',p='C:\\Program Files\\LAV\\LAVVideo.ax';
 const base={clsid:id,server:p,hive:'LocalMachine',view:'64'};
 const inspect=()=>({file:p,machine:'x64'});
 assert.equal(classifyLav([base],'x64',inspect)[0].status,'identity-review-required');
 assert.equal(classifyLav([{...base,hive:'CurrentUser'}],'x64',inspect)[0].status,'user-override-review');
 assert.equal(classifyLav([{...base,view:'32'}],'x64',inspect)[0].status,'architecture-mismatch');
 assert.equal(classifyLav([{...base,server:'C:\\bad.dll'}],'x64',inspect)[0].status,'missing-or-invalid-file');
 assert.equal(classifyLav([{...base,clsid:'unknown'}],'x64',inspect).length,0);
});

test('codec inventory recognizes alternate K-Lite product labels and keeps registry provenance',()=>{
 const {normalize}=require('../codec-inventory');
 const r=normalize({packs:[{name:'K-Lite Mega Codec Pack',version:'20.1.0',view:'32'},{name:'K-Lite Codec Pack',version:'20.1.0',view:'64',source:'product-registry'}]});
 assert.equal(r.packs.length,2);assert.ok(r.packs.some(x=>x.source==='product-registry'));
});

test('MicroDVD uses explicit or declared FPS and refuses unknown timing',()=>{
 const r=V.subtitleToVtt('{1}{1}25\n{25}{50}Καλημέρα|κόσμε','sub',0);
 assert.equal(r.cues,1);assert.equal(r.entries[0].start,1);assert.equal(r.entries[0].end,2);assert.equal(r.entries[0].text,'Καλημέρα\nκόσμε');
 assert.equal(V.subtitleToVtt('{24}{48}text','sub',0).needsFps,true);
 assert.equal(V.subtitleToVtt('{24}{48}text','sub',0,1,24).entries[0].end,2);
 assert.equal(V.subtitleToVtt('{24}{12}bad','sub',0,1,24).cues,0);
});

test('native host protocol accepts bounded known events only',()=>{
 const {parseHostEvent}=require('../native-host');
 assert.deepEqual(parseHostEvent('{"event":"ready","positionMs":100,"durationMs":5000}'),{event:'ready',positionMs:100,durationMs:5000});
 assert.equal(parseHostEvent('{"event":"spawn","positionMs":5}'),null);
 assert.equal(parseHostEvent('x'.repeat(1025)),null);
 assert.equal(parseHostEvent('{"event":"position","positionMs":-5}').positionMs,0);
});

test('synchronized subtitle export round trips timing without replacing original',()=>{
 const parsed=V.subtitleToVtt('1\n00:00:10,000 --> 00:00:20,000\nΚαλημέρα','srt',500,.96);
 for(const format of ['srt','vtt']){
  const text=V.exportSubtitles(parsed.entries,format),r=V.subtitleToVtt(text,format,0);
  assert.equal(r.cues,1);assert.equal(r.entries[0].start,10.1);assert.equal(r.entries[0].end,19.7);assert.equal(r.entries[0].text,'Καλημέρα');
 }
 assert.equal(V.exportSubtitles([{start:4,end:2,text:'x'}],'srt'),'');
});

test('OpenSubtitles provider search, download and hostile link guards',async()=>{
 const {createProvider,downloadUrl}=require('../subtitle-provider');
 assert.equal(downloadUrl('https://dl.opensubtitles.com.evil.example/download/a'),null);
 assert.equal(downloadUrl('http://dl.opensubtitles.com/download/a'),null);
 assert.equal(downloadUrl('https://dl.opensubtitles.com/download/a'),'https://dl.opensubtitles.com/download/a');
 const seen=[];const provider=createProvider({fetchImpl:async(url,opts)=>{
  seen.push({url,opts});
  if(url.includes('subtitles?'))return Response.json({data:[{attributes:{language:'el',files:[{file_id:123,file_name:'test.el.srt'}]}}]});
  if(url.endsWith('/download'))return Response.json({link:'https://dl.opensubtitles.com/download/test',remaining:3});
  return new Response('1\n00:00:00,500 --> 00:00:02,000\nΚαλημέρα\n');
 }});
 const r=await provider.search({query:'Example',language:'el',apiKey:'fixture-key'});assert.equal(r.items[0].id,123);
 await new Promise(r=>setTimeout(r,760));
 const out=await provider.download(123);assert.equal(out.ok,true);assert.match(out.subtitle.text,/Καλημέρα/);assert.equal(seen[2].opts.headers['Api-Key'],undefined);assert.equal(seen[2].opts.redirect,'error');
 await new Promise(r=>setTimeout(r,760));assert.equal((await provider.download(456)).code,'not-in-results');
});

test('two point sync corrects both offset and drift',()=>{
 const r=V.twoPointSync({subtitle:10,video:12},{subtitle:110,video:117});
 assert.equal(r.scale,1.05);assert.equal(r.delay,1.5);
 const out=V.subtitleToVtt('1\n00:00:10,000 --> 00:00:11,000\nA\n\n2\n00:01:50,000 --> 00:01:51,000\nB','srt',r.delay*1000,r.scale);
 assert.equal(out.entries[0].start,12);assert.equal(out.entries[1].start,117);
 assert.equal(V.twoPointSync({subtitle:5,video:1},{subtitle:6,video:2}),null);
 assert.equal(V.twoPointSync({subtitle:5,video:8},{subtitle:10,video:2}),null);
});

test('OpenSubtitles moviehash reads first and last 64KiB and matches unsigned 64-bit algorithm',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {movieHash}=require('../subtitle-provider');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opsis-hash-'));
 try{
  const p=path.join(dir,'fixture.mkv'),buf=Buffer.alloc(131072);buf.writeBigUInt64LE(0xffffffffffffffffn,0);buf.writeBigUInt64LE(3n,65536);fs.writeFileSync(p,buf);
  assert.equal(await movieHash(p),'0000000000020002');
  fs.writeFileSync(p,Buffer.alloc(12));assert.equal(await movieHash(p),null);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('local audio activity sync detects known offset and rejects constant or ambiguous audio',()=>{
 const A=require('../subtitle-autosync');
 const cues=[{start:2,end:3.1},{start:6,end:7.7},{start:11,end:12.4},{start:18,end:20.3},{start:27,end:28.2},{start:36,end:38.5},{start:46,end:47.5},{start:53,end:55.1}];
 const activity=new Uint8Array(650);
 for(const c of cues)activity.fill(1,Math.round((c.start+1.7)*10),Math.round((c.end+1.7)*10));
 const r=A.estimate(activity,cues);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.scale,1);assert.equal(r.delay,1.7);
 assert.equal(A.estimate(new Uint8Array(650).fill(1),cues).ok,false);
 assert.equal(A.activityFromPcm(Buffer.alloc(16000*15)),null);
});

test('audio activity envelope recognizes intermittent PCM signal and rejects silence',()=>{
 const A=require('../subtitle-autosync'),b=Buffer.alloc(16000*15);
 for(let i=8000;i<24000;i++)b.writeInt16LE(Math.round(10000*Math.sin(i*Math.PI/10)),i*2);
 const a=A.activityFromPcm(b);assert.ok(a);assert.equal(a[0],0);assert.equal(a[15],1);assert.equal(a[50],0);
});

test('native subtitle handoff canonicalizes synchronized SRT and rejects invalid input',()=>{
 const {prepareSubtitle}=require('../native-host');
 assert.match(prepareSubtitle('1\n00:00:01,200 --> 00:00:04,000\nΚαλημέρα'),/00:00:01,200 --> 00:00:04,000/);
 assert.equal(prepareSubtitle('not a subtitle'),null);
 assert.equal(prepareSubtitle('x'.repeat(5*1024*1024+1)),null);
});

test('audio analysis rejects invalid audio stream and pre-aborted request before spawning',async()=>{
 const A=require('../subtitle-autosync'),c=new AbortController();c.abort();
 await assert.rejects(A.extractActivity('not-run','not-run',10,{audioIndex:64}),/bad-audio-index/);
 await assert.rejects(A.extractActivity('not-run','not-run',10,{signal:c.signal}),/cancelled/);
});

test('cue editing preserves original data and WebVTT settings, rejects invalid timing',()=>{
 const original=V.subtitleToVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000 align:start\nOriginal','vtt',0).entries;
 const edited=V.editCue(original,0,{start:1.2,end:2.4,text:'Διορθωμένο'});
 assert.equal(original[0].text,'Original');assert.equal(edited[0].start,1.2);
 const round=V.subtitleToVtt(V.exportSubtitles(edited,'vtt'),'vtt',0).entries;
 assert.equal(round[0].settings,'align:start');assert.equal(round[0].text,'Διορθωμένο');
 assert.equal(V.editCue(original,0,{start:3,end:2,text:'x'}),null);
 assert.equal(V.editCue(original,0,{start:1,end:2,text:'--> injected'}),null);
});

test('native control accepts only bounded fixed commands',()=>{
 const {normalizeCommand}=require('../native-host');
 assert.deepEqual(normalizeCommand('toggle'),{name:'toggle'});
 assert.deepEqual(normalizeCommand('seek',1500.4),{name:'seek',value:1500});
 assert.equal(normalizeCommand('seek',-1),null);assert.equal(normalizeCommand('volume',101),null);assert.equal(normalizeCommand('rate',Infinity),null);assert.equal(normalizeCommand('open','C:\\x'),null);
});

test('TTML simple media times reject unsupported frames and malformed units',()=>{assert.equal(V.ttmlSeconds('00:01:02.500'),62.5);assert.equal(V.ttmlSeconds('250ms'),.25);assert.equal(V.ttmlSeconds('1.5m'),90);assert.equal(V.ttmlSeconds('12f'),null);assert.equal(V.ttmlSeconds('00:00:99'),null);});


test('native stdout framing recovers after oversized lines and preserves subsequent acknowledgments',()=>{
 const {createLineFramer}=require('../native-host'),lines=[];
 const feed=createLineFramer(s=>lines.push(s));
 feed('{"event":"rea');feed('dy"}\r\n'+'x'.repeat(20000)+'\n{"event":"ack","id":1,"ok":true}\n');
 feed('x'.repeat(1025));feed('{"event":"ready"}\n');feed('{"event":"position"}\n');
 assert.deepEqual(lines,['{"event":"ready"}','{"event":"ack","id":1,"ok":true}','{"event":"position"}']);
 const burst='{}\n'.repeat(6000);feed(burst);assert.equal(lines.length,6003);
});


test('native subtitle delay is signed, bounded and rounded to milliseconds',()=>{
 const {normalizeCommand}=require('../native-host');
 assert.deepEqual(normalizeCommand('subtitle-delay',-750.4),{name:'subtitle-delay',value:-750});
 assert.deepEqual(normalizeCommand('subtitle-delay',7200000),{name:'subtitle-delay',value:7200000});
 assert.equal(normalizeCommand('subtitle-delay',-7200001),null);
 assert.equal(normalizeCommand('subtitle-delay',Infinity),null);
 assert.equal(normalizeCommand('subtitle-delay',undefined),null);
});


test('renderer cannot submit arbitrary native subtitle revision paths as commands',()=>{
 const {normalizeCommand,prepareSubtitle}=require('../native-host');
 assert.equal(normalizeCommand('subtitle-replace',1),null);
 assert.equal(normalizeCommand('subtitle-off'),null);
 assert.equal(prepareSubtitle('C:\\untrusted.srt'),null);
 assert.ok(prepareSubtitle('1\n00:00:01,000 --> 00:00:02,000\nΚαλημέρα'));
});


test('native Media Foundation engine still uses fixed bounded transport commands',()=>{
 const {normalizeCommand}=require('../native-host');
 assert.deepEqual(normalizeCommand('seek',1000),{name:'seek',value:1000});
 assert.equal(normalizeCommand('open','https://example.com'),null);
 assert.equal(normalizeCommand('rate',5),null);
});


test('safe subtitle sidecars use approved video stem and never overwrite original',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {saveBesideVideo,website}=require('../subtitle-sidecar');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'opsis-sidecar-'));
 try{
  const video=path.join(dir,'Episode.mkv');await fs.writeFile(video,'fixture');
  const source=require('../local-media-policy').localPath(video);
  const old=path.join(dir,'Episode.el.srt');await fs.writeFile(old,'original');
  const req={video,subtitle:{ext:'srt',text:'1\n00:00:01,000 --> 00:00:02,000\nΚαλημέρα',name:'../../bad.srt'},language:'el',extensions:new Set(['mkv']),approved:p=>p===source};
  const saved=await saveBesideVideo(req);assert.deepEqual(saved,{ok:true,name:'Episode.el.2.srt'});
  assert.equal(await fs.readFile(old,'utf8'),'original');assert.match(await fs.readFile(path.join(dir,saved.name),'utf8'),/Καλημέρα/);
  assert.equal((await saveBesideVideo({...req,approved:()=>false})).code,'video-not-approved');
  assert.equal((await saveBesideVideo({...req,subtitle:{ext:'srt',text:'<html>verify</html>'}})).code,'invalid-subtitle');
  assert.equal(website('subs4series'),'https://www.subs4series.com/');assert.equal(website('https://untrusted.example'),null);assert.equal(website('__proto__'),null);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('provider refuses HTML challenges and respects rate limits without automatic retry',async()=>{
 const {createProvider,retrySeconds}=require('../subtitle-provider');let calls=0;
 const provider=createProvider({fetchImpl:async()=>{calls++;return new Response('<html>Verify</html>',{status:403,headers:{'content-type':'text/html','retry-after':'120'}});}});
 const req={query:'Example',language:'el',apiKey:'fixture'};
 const first=await provider.search(req);assert.equal(first.code,'provider-blocked');assert.equal(first.retryAfter,120);
 const second=await provider.search(req);assert.equal(second.code,'provider-cooldown');assert.equal(calls,1);
 assert.equal(retrySeconds('0'),30);assert.equal(retrySeconds('not-a-date'),60);
 const limited=createProvider({fetchImpl:async()=>new Response('quota',{status:429,headers:{'retry-after':'90'}})});
 assert.equal((await limited.search(req)).code,'quota');assert.equal((await limited.search(req)).code,'provider-cooldown');
});


test('episode and release ranking rejects explicit different episodes',()=>{
 const x=V.releaseInfo('Show.Name.S02E03.1080p.WEB-DL-GROUP.mkv');
 assert.equal(x.title,'Show Name');assert.equal(x.season,2);assert.equal(x.episode,3);assert.equal(x.source,'WEB-DL');
 assert.equal(V.releaseInfo('Show.2x03.HDTV.avi').episode,3);
 assert.equal(V.releaseInfo('Show.S02E03E04.mkv').season,null);
 assert.equal(V.releaseScore('Show.S02E03.mkv','Show.S02E04.srt'),-1000);
 assert.ok(V.releaseScore('Show.S02E03.1080p.WEB-DL-GROUP.mkv','Show.S02E03.1080p.WEB-DL-GROUP.srt')>V.releaseScore('Show.S02E03.1080p.WEB-DL-GROUP.mkv','Show.S02E03.HDTV.srt'));
});

test('ZIP subtitle import bounds decompression, skips traversal and never extracts files',()=>{
 const AdmZip=require('adm-zip'),{zipSubtitles}=require('../subtitle-archive');
 const text='1\n00:00:01,000 --> 00:00:02,000\nΚαλημέρα';
 const zip=new AdmZip();zip.addFile('nested/Show.S01E01.srt',Buffer.from(text));zip.addFile('other.exe',Buffer.from('ignored'));
 const data=zip.toBuffer();const out=zipSubtitles(data,b=>b.toString('utf8'));
 assert.equal(out.length,1);assert.equal(out[0].name,'Show.S01E01.srt');assert.match(out[0].text,/Καλημέρα/);
 const tooLarge=new AdmZip();tooLarge.addFile('large.srt',Buffer.alloc(5*1024*1024+1,65));
 assert.throws(()=>zipSubtitles(tooLarge.toBuffer(),b=>b.toString('utf8')));
 assert.throws(()=>zipSubtitles(Buffer.from('not zip'),b=>b.toString('utf8')));
 const damaged=Buffer.from(data);const central=damaged.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));damaged[central+16]^=1;
 assert.throws(()=>zipSubtitles(damaged,b=>b.toString('utf8')));
});

test('OpenSubtitles sends explicit episode parameters and ranks matching releases',async()=>{
 const {createProvider}=require('../subtitle-provider');let params;
 const provider=createProvider({fetchImpl:async(url)=>{params=new URL(url).searchParams;return new Response(JSON.stringify({data:[
 {attributes:{language:'el',files:[{file_id:11,file_name:'Show.S02E04.srt'}]}},
 {attributes:{language:'el',files:[{file_id:12,file_name:'Show.S02E03.HDTV.srt'}],download_count:999}},
 {attributes:{language:'el',files:[{file_id:13,file_name:'Show.S02E03.WEB-DL-GROUP.srt'}],download_count:1}}
 ]}),{headers:{'content-type':'application/json'}});}});
 const result=await provider.search({query:'Show.S02E03.WEB-DL-GROUP',language:'el',apiKey:'fixture'});
 assert.equal(params.get('query'),'Show');assert.equal(params.get('season_number'),'2');assert.equal(params.get('episode_number'),'3');
 assert.deepEqual(result.items.map(x=>x.id),[13,12]);
});


test('duplicate sidecars are reused and synced variants do not overwrite originals',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {saveBesideVideo}=require('../subtitle-sidecar'),{localPath}=require('../local-media-policy');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'opsis-dedup-'));
 try{
  const video=path.join(dir,'Episode.mkv');await fs.writeFile(video,'fixture');const real=localPath(video);
  const req={video,subtitle:{ext:'srt',text:'1\n00:00:01,000 --> 00:00:02,000\nΓεια'},language:'el',extensions:new Set(['mkv']),approved:p=>p===real};
  const first=await saveBesideVideo(req);assert.equal(first.name,'Episode.el.srt');
  const again=await saveBesideVideo(req);assert.equal(again.reused,true);assert.equal(again.name,first.name);
  const synced=await saveBesideVideo({...req,synced:true});assert.equal(synced.name,'Episode.el.synced.srt');
  assert.equal((await saveBesideVideo({...req,synced:true})).reused,true);
  assert.equal((await fs.readdir(dir)).length,3);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('playlist subtitle audit distinguishes Greek filename tags, unknown, missing and unapproved',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {auditSubtitles}=require('../subtitle-sidecar'),{localPath}=require('../local-media-policy');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'opsis-audit-'));
 try{
  const videos=['A','B','C','D','E'].map(n=>path.join(dir,n+'.mkv'));
  for(const file of videos)await fs.writeFile(file,'fixture');
  for(const n of ['A.el.srt','B.srt','C.en.srt','D.el.srt'])await fs.writeFile(path.join(dir,n),n.startsWith('D')?'':'fixture');
  const result=await auditSubtitles({videos,extensions:new Set(['mkv']),approved:p=>p!==localPath(videos[4])});
  assert.deepEqual(result.rows.map(r=>r.status),['greek','unknown','other-language','missing','not-approved']);
  assert.equal(result.truncated,false);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});


test('Greek script detection uses parsed dialogue and abstains on short or mixed text',()=>{
 const {detectGreekScript}=require('../subtitle-sidecar');
 const sub=text=>({ext:'srt',text:'1\n00:00:01,000 --> 00:00:03,000\n'+text});
 assert.equal(detectGreekScript(sub('Καλημέρα σας, σήμερα θα πάμε όλοι μαζί στην όμορφη πόλη.')),'greek');
 assert.equal(detectGreekScript(sub('This is a sufficiently long sentence with many letters and no Greek dialogue at all.')),'non-greek');
 assert.equal(detectGreekScript(sub('Γεια')),'unknown');
 assert.equal(detectGreekScript({ext:'srt',text:'<html>Καλημέρα σας</html>'}),'invalid');
});

test('MKV probe parses subtitle stream language metadata conservatively',()=>{
 const {parseTracks}=require('../subtitle-probe');
 assert.deepEqual(parseTracks(JSON.stringify({streams:[{index:2,codec_name:'subrip',tags:{language:'gre'}},{index:3,codec_name:'hdmv_pgs_subtitle',tags:{language:'eng'}},{index:4,codec_name:'ass'}]})),[{index:2,codec:'subrip',language:'el'},{index:3,codec:'hdmv_pgs_subtitle',language:'eng'},{index:4,codec:'ass',language:''}]);
 assert.deepEqual(parseTracks('{"streams":[]}'),[]);
 assert.equal(parseTracks('not json'),null);
 assert.equal(parseTracks('{"streams":[{"index":-1}]}'),null);
});

test('audit recognizes Greek text in unlabeled file and preserves embedded uncertainty',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {auditSubtitles}=require('../subtitle-sidecar');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'opsis-greek-audit-'));
 try{
  const videos=['A','B','C','D'].map(n=>path.join(dir,n+'.mkv'));
  for(const p of videos)await fs.writeFile(p,'fixture');
  await fs.writeFile(path.join(dir,'A.srt'),'1\n00:00:01,000 --> 00:00:02,000\nΚαλημέρα σας, σήμερα θα πάμε όλοι μαζί στην όμορφη πόλη.');
  await fs.writeFile(path.join(dir,'D.el.srt'),'1\n00:00:01,000 --> 00:00:02,000\nThis is a sufficiently long sentence with many letters and no Greek dialogue at all.');
  const result=await auditSubtitles({videos,extensions:new Set(['mkv']),approved:()=>true,decode:b=>b.toString('utf8'),embeddedProbe:async p=>path.basename(p)==='B.mkv'?[{language:'el'}]:path.basename(p)==='C.mkv'?null:[]});
  assert.deepEqual(result.rows.map(x=>x.status),['greek','embedded-greek','incomplete','unknown']);
  assert.equal(result.rows[0].evidence,'text-script');assert.equal(result.rows[3].evidence,'tag-text-conflict');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});


test('SubDL individual subtitle links, episode and language checks, separate download credentials',async()=>{
 const {createSubdl,subdlLink}=require('../subtitle-subdl');
 assert.equal(subdlLink('//evil.example/subtitle/a/b'),null);assert.equal(subdlLink('/subtitle/a/../b'),null);
 const seen=[],file={name:'Show.S01E02.srt',format:'srt',size:100,season:1,episode:2,language:'EL',url:'/subtitle/abc/file123'};
 const client=createSubdl({fetchImpl:async(url,options)=>{seen.push({url,options});if(url.startsWith('https://api.subdl.com/'))return new Response(JSON.stringify({status:true,subtitles:[{unpack_files:[file,{...file,episode:3},{...file,language:'EN'},{...file,url:'https://evil.example/'}]}]}),{headers:{'content-type':'application/json'}});return new Response('1\n00:00:01,000 --> 00:00:02,000\nΚαλημέρα',{headers:{'content-type':'text/plain'}});}});
 const result=await client.search({query:'Show.S01E02',language:'el',apiKey:'fixture'});
 assert.equal(result.items.length,1);assert.equal(new URL(seen[0].url).searchParams.get('episode_number'),'2');
 await new Promise(r=>setTimeout(r,760));
 const out=await client.download(result.items[0].id);assert.equal(out.ok,true);assert.match(out.subtitle.text,/Καλημέρα/);
 assert.equal(seen[1].url,'https://dl.subdl.com/subtitle/abc/file123');assert.equal(seen[1].options.redirect,'error');
});

test('MKV extraction permits only explicit text subtitle codecs',()=>{
 const {canExtract}=require('../subtitle-probe');
 assert.equal(canExtract({index:2,codec:'subrip'}),true);
 assert.equal(canExtract({index:3,codec:'hdmv_pgs_subtitle'}),false);
 assert.equal(canExtract({index:3,codec:'dvd_subtitle'}),false);
 assert.equal(canExtract({index:-1,codec:'ass'}),false);
});


test('season plan selects same show and season and excludes multi-episode files',()=>{
 const {seasonPlan}=require('../subtitle-batch');
 const files=['Show.S01E03.mkv','Show.S01E01.mkv','Other.S01E01.mkv','Show.S02E01.mkv','Show.S01E02E03.mkv','Show.S01E01.mkv'];
 assert.deepEqual(seasonPlan(files,'Show.S01E03.mkv'),['Show.S01E01.mkv','Show.S01E03.mkv']);
 assert.deepEqual(seasonPlan(files,'Movie.mkv'),[]);
});
test('season batch skips existing and uncertain files, saves one exact hash only, stops at quota',async()=>{
 const {runSeasonBatch}=require('../subtitle-batch');
 const calls=[],files=['a','b','c','d','e','f'];
 const result=await runSeasonBatch({files,providerId:'opensubtitles',credentials:{apiKey:'fixture'},autoSave:true,hashEnabled:true,approved:()=>true,audit:async p=>p==='a'?'greek':p==='b'?'unknown':'missing',hash:async()=> '0123456789abcdef',sleep:async()=>{},
 provider:{search:async req=>{calls.push(['search',req.apiKey]);return {ok:true,items:[{id:1,language:'el',hashMatch:calls.length!==1,name:'candidate.srt'}]};},download:async()=>{calls.push(['download']);return {ok:true,subtitle:{ext:'srt',text:'fixture'},remaining:0};}},
 save:async()=>({ok:true,name:'saved.el.srt'})});
 assert.deepEqual(result.rows.map(r=>r.status),['already-present','local-review','review','saved']);
 assert.equal(result.stopped,'quota');assert.deepEqual(calls,[['search','fixture'],['search',undefined],['download']]);
});
test('season batch respects cancellation and never auto-downloads SubDL or ambiguous hash results',async()=>{
 const {runSeasonBatch}=require('../subtitle-batch');
 let cancelled=false,downloads=0;
 const base={files:['a','b'],providerId:'subdl',autoSave:true,hashEnabled:true,approved:()=>true,audit:async()=> 'missing',hash:async()=> '0123456789abcdef',sleep:async()=>{},provider:{search:async()=>({ok:true,items:[{id:1,language:'el',hashMatch:true,name:'a.srt'}]}),download:async()=>{downloads++;return {ok:true};}},save:async()=>({ok:true})};
 const first=await runSeasonBatch({...base,cancelled:()=>cancelled,progress:()=>{cancelled=true;}});
 assert.equal(first.rows[0].status,'review');assert.equal(first.stopped,'cancelled');assert.equal(downloads,0);
 const second=await runSeasonBatch({...base,providerId:'opensubtitles',provider:{...base.provider,search:async()=>({ok:true,items:[{id:1,language:'el',hashMatch:true},{id:2,language:'el',hashMatch:true}]})}});
 assert.deepEqual(second.rows.map(r=>r.status),['review','review']);assert.equal(downloads,0);
});


test('combined provider results preserve provider identity, independent keys and partial failures',async()=>{
 const {searchProviders}=require('../subtitle-multi');
 const calls=[];
 const reply=await searchProviders({query:'Show.S01E01',language:'el',moviehash:'abcd',credentials:{openKey:'open',subdlKey:'sub',username:'u',password:'p'},providers:{
  opensubtitles:{search:async req=>{calls.push(req);return {ok:true,items:[{id:1,language:'el',hashMatch:true,name:'open.srt'}]};}},
  subdl:{search:async req=>{calls.push(req);return {ok:true,items:[{id:1,language:'el',name:'sub.srt'}]};}}
 }});
 assert.deepEqual(reply.items.map(x=>[x.provider,x.id]),[['opensubtitles',1],['subdl',1]]);
 assert.equal(calls[0].apiKey,'open');assert.equal(calls[1].apiKey,'sub');assert.equal(calls[1].moviehash,undefined);assert.equal(calls[1].password,undefined);
 const partial=await searchProviders({query:'Show',language:'el',providers:{opensubtitles:{search:async()=>({ok:false,code:'quota'})},subdl:{search:async()=>({ok:true,items:[]})}}});
 assert.equal(partial.ok,true);assert.equal(partial.statuses[0].code,'quota');
});
test('season pages cover later episodes without repeating the first ten',()=>{
 const {seasonPage}=require('../subtitle-batch');const files=Array.from({length:23},(_,i)=>'episode-'+i);
 assert.equal(seasonPage(files,0).next,10);
 assert.deepEqual(seasonPage(files,20),{files:files.slice(20),offset:20,total:23,next:null});
 assert.equal(seasonPage(files,23),null);assert.equal(seasonPage(files,-1),null);
});
test('OpenSubtitles fallback title search cannot confer an exact hash match',async()=>{
 const {createProvider}=require('../subtitle-provider');let calls=0;
 const provider=createProvider({fetchImpl:async()=>new Response(JSON.stringify({data:++calls===1?[]:[{attributes:{language:'el',moviehash_match:true,files:[{file_id:123,file_name:'Show.S01E01.srt'}]}}]}),{headers:{'content-type':'application/json'}})});
 const result=await provider.search({query:'Show.S01E01',language:'el',moviehash:'0123456789abcdef',apiKey:'fixture'});
 assert.equal(result.items[0].hashMatch,false);assert.equal(calls,2);
});


test('RAR listing accepts only bounded literal subtitle members and rejects encrypted, duplicate and oversized entries',()=>{
 const {parseListing,signature}=require('../subtitle-rar');
 const block=(name,size=80,extra='')=>'Path = '+name+'\nSize = '+size+'\nEncrypted = -\nCRC = 1234ABCD\nAttributes = A'+extra;
 const good=parseListing(block('nested\\Show.S01E01.srt')+'\n\n'+block('ignored.exe'));
 assert.equal(good.length,1);assert.equal(good[0].name,'Show.S01E01.srt');
 assert.deepEqual(parseListing(block('../bad.srt')+'\n\n'+block('@list.srt')),[]);
 assert.equal(parseListing(block('a.srt')+'\n\n'+block('A.srt')),null);
 assert.equal(parseListing(block('a.srt',5*1024*1024+1)),null);
 assert.equal(parseListing(block('a.srt').replace('Encrypted = -','Encrypted = +')),null);
 assert.deepEqual(parseListing(block('a.srt',80,'\nSymbolic Link = target')),[]);
 assert.equal(signature(Buffer.from('526172211a0700','hex')),true);
 assert.equal(signature(Buffer.from('526172211a070100','hex')),true);
 assert.equal(signature(Buffer.from('504b0304','hex')),false);
});


test('embedded viewport accepts only bounded normalized rectangles and dedicated IPC',()=>{
 const {normalizeViewport,normalizeCommand}=require('../native-host');
 assert.equal(normalizeViewport(null),0);
 assert.equal(normalizeViewport({x:100,y:100,w:500,h:500}),((100*1024+100)*1024+500)*1024+500);
 for(const rect of [{x:-1,y:0,w:1,h:1},{x:900,y:0,w:101,h:1},{x:0,y:0,w:0,h:1},{x:0,y:0,w:1.5,h:1},{x:0,y:0,w:1000,h:1001},{}])assert.equal(normalizeViewport(rect),null);
 assert.equal(normalizeCommand('viewport',1),null);
});


test('decoder policy accepts only named LibVLC modes, never arbitrary arguments',()=>{
 const {decoderMode,gpuSummary}=require('../gpu-diagnostics');
 for(const mode of ['auto','d3d11va','dxva2','none'])assert.equal(decoderMode(mode),mode);
 assert.equal(decoderMode('--sout=file'),null);assert.equal(decoderMode(null),null);
 const summary=gpuSummary({video_decode:'enabled',arbitrary:'secret'},{gpuDevice:[{active:true,deviceId:123,deviceString:'Adapter',driverVersion:'1.2',extra:'private'}]});
 assert.deepEqual(summary,{features:{video_decode:'enabled'},devices:[{active:true,deviceId:123,deviceString:'Adapter',driverVersion:'1.2'}]});
 assert.equal(Object.hasOwn(summary,'hardwareActive'),false);
});


test('resume checkpoints suppress small periodic changes and save explicit pause/close',()=>{
 const {resumeUpdate}=V;
 assert.equal(resumeUpdate({clip:20000},'clip',25000,100000),null);
 assert.deepEqual(resumeUpdate({clip:20000},'clip',25000,100000,true),{clip:25000});
 assert.deepEqual(resumeUpdate({clip:20000},'clip',35000,100000),{clip:35000});
 assert.deepEqual(resumeUpdate({clip:20000},'clip',95000,100000),{});
 assert.equal(resumeUpdate({},'clip',0,100000),null);
});
test('long subtitle stems no longer alias distinct videos',()=>{
 const {sidecarStem,classifyName}=require('../subtitle-sidecar');
 const a='x'.repeat(220)+'a.mkv',b='x'.repeat(220)+'b.mkv';
 const sa=sidecarStem(a),sb=sidecarStem(b);
 assert.notEqual(sa,sb);assert.ok(Buffer.byteLength(sa)<=200);
 assert.equal(classifyName(a,sa+'.el.srt'),'greek');
 assert.equal(classifyName(b,sa+'.el.srt'),null);
});
test('resource snapshot excludes extra fields and distinguishes missing measurements',()=>{
 const {summarizeMetrics}=require('../resource-diagnostics');
 const out=summarizeMetrics([{pid:12,type:'Browser',cpu:{percentCPUUsage:2.345},memory:{workingSetSize:1024,peakWorkingSetSize:2048},extra:'private'},{pid:0}]);
 assert.deepEqual(out,{rows:[{pid:12,type:'Browser',cpuPercent:2.35,workingSetKiB:1024,peakWorkingSetKiB:2048}],workingSetKiB:1024});
 assert.equal(summarizeMetrics([{pid:1}]).workingSetKiB,null);
});


test('audio endpoint report is read-only, bounded and excludes raw device IDs',()=>{
 const {parseAudioEndpoints}=require('../native-host');
 const row={name:'Speakers',state:1,console:true,multimedia:true,communications:false,id:'secret'};
 const r=parseAudioEndpoints(JSON.stringify({ok:true,rows:[row],partial:false,rolesKnown:[true,true,true]}));
 assert.deepEqual(r,{rows:[{name:'Speakers',state:1,console:true,multimedia:true,communications:false}],partial:false,rolesKnown:[true,true,true]});
 assert.equal(parseAudioEndpoints(JSON.stringify({ok:true,rows:[{...row,state:99}],rolesKnown:[true,true,true]})),null);
 assert.equal(parseAudioEndpoints(JSON.stringify({ok:true,rows:Array(65).fill(row),rolesKnown:[true,true,true]})),null);
 assert.equal(parseAudioEndpoints('invalid'),null);
});


test('underscore-separated releases are scored by resolution and source',()=>{
 const r=V.releaseInfo('Show_S02E03_1080p_WEB_DL-GROUP.mkv');
 assert.equal(r.source,'WEB-DL');assert.equal(r.resolution,'1080p');
 assert.equal(r.season,2);assert.equal(r.episode,3);
});
test('resume map preserves a literal prototype-named key without altering prototype',()=>{
 const r=V.resumeUpdate({},'__proto__',20000,100000,true);
 assert.equal(Object.getPrototypeOf(r),Object.prototype);
 assert.equal(Object.hasOwn(r,'__proto__'),true);assert.equal(r.__proto__,20000);
});
test('concurrent sidecar saves never overwrite or leave staging files',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {saveBesideVideo}=require('../subtitle-sidecar');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'opsis-sidecar-race-'));
 try{
  const video=path.join(dir,'Episode.mkv');await fs.writeFile(video,'fixture');
  const req={video,subtitle:{ext:'srt',text:'1\n00:00:01,000 --> 00:00:02,000\nΚαλημέρα'},language:'el',extensions:new Set(['mkv']),approved:()=>true};
  const results=await Promise.all([saveBesideVideo(req),saveBesideVideo(req)]);
  assert.ok(results.every(x=>x.ok),JSON.stringify(results));assert.equal(results[0].name,results[1].name);
  assert.deepEqual((await fs.readdir(dir)).sort(),['Episode.el.srt','Episode.mkv']);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});


test('generated RAR fixture has CRC-protected headers and expected member data',()=>{
 const {storedRar}=require('./rar-fixture'),{signature}=require('../subtitle-rar'),{crc32}=require('../subtitle-archive');
 const data=Buffer.from('hello'),archive=storedRar([{name:'a.srt',data}]);
 assert.ok(signature(archive));
 let offset=7;
 for(const type of [0x73,0x74,0x7b]){
  const size=archive.readUInt16LE(offset+5);
  assert.equal(archive[offset+2],type);
  assert.equal(archive.readUInt16LE(offset),crc32(archive.subarray(offset+2,offset+size))&65535);
  offset+=size;if(type===0x74){assert.deepEqual(archive.subarray(offset,offset+data.length),data);offset+=data.length;}
 }
 assert.equal(offset,archive.length);
});
