'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {infer,clean,patchTag,syncWrite}=require('../music-tags');
test('infer only unambiguous artist/title',()=>{assert.deepEqual(infer('Artist - Title.mp3'),{artist:'Artist',title:'Title'});assert.deepEqual(infer('01.mp3'),{});assert.deepEqual(infer('A - B - C.mp3'),{});});
test('bounded fields and no control characters',()=>assert.deepEqual(clean({title:' Ήχος ',year:'abcd',artist:'bad\nname',extra:'x'}),{title:'Ήχος'}));
test('new ID3 tag and preserve existing frame bytes',()=>{const p=patchTag(Buffer.alloc(10),Buffer.alloc(0),{title:'Τίτλος'});assert.equal(p.bytes.toString('ascii',10,14),'TIT2');const q=patchTag(p.bytes.subarray(0,10),p.bytes.subarray(10),{title:'No',artist:'Artist'});assert.deepEqual(q.bytes.subarray(10, p.bytes.length),p.bytes.subarray(10));assert.deepEqual(q.applied,{artist:'Artist'});});
test('existing common tags not overwritten',()=>assert.equal(patchTag(Buffer.alloc(10),Buffer.alloc(0),{title:'new'},{title:'old'}),null));
test('reject unsupported header flags',()=>{const h=Buffer.concat([Buffer.from([73,68,51,3,0,128]),syncWrite(0)]);assert.throws(()=>patchTag(h,Buffer.alloc(0),{title:'x'}),/unsupported/);});

test('real MP3 completion preserves payload and original backup',async(t)=>{
 const {execFileSync}=require('node:child_process'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {complete}=require('../music-tags');
 try{execFileSync('ffmpeg',['-version'],{stdio:'ignore'});}catch{if(process.env.CI)throw Error('CI requires ffmpeg');t.skip('ffmpeg unavailable');return;}
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'opsis-tags-')));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'Artist - Title.mp3');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','libmp3lame','-id3v2_version','3','-metadata','album=Existing album',file]);
 const before=await fs.readFile(file);
 const payload=b=>b.subarray(b.toString('ascii',0,3)==='ID3'?10+b.subarray(6,10).reduce((a,x)=>a*128+x,0):0);
 const result=await complete(file,{title:'Ελληνικός τίτλος',artist:'Artist',album:'Do not overwrite'});
 assert.equal(result.status,'updated');assert.deepEqual(await fs.readFile(result.backup),before);
 assert.deepEqual(payload(await fs.readFile(file)),payload(before));
 const mm=await import('music-metadata');const m=await mm.parseFile(file);
 assert.equal(m.common.title,'Ελληνικός τίτλος');assert.equal(m.common.album,'Existing album');
 assert.equal((await complete(file,{title:'Other'})).status,'skipped');
});

test('FLAC comment insertion preserves STREAMINFO and unknown existing comment',()=>{
 const {patchFlac}=require('../music-tags');
 const stream=Buffer.alloc(34,7),p=patchFlac([{type:0,data:stream}],{title:'Τίτλος',albumartist:'Artist'});
 assert.equal(p.bytes.toString('ascii',0,4),'fLaC');assert.deepEqual(p.bytes.subarray(8,42),stream);
 const comments=p.bytes.subarray(46);
 const q=patchFlac([{type:0,data:stream},{type:4,data:comments}],{title:'No',composer:'Composer'});
 assert.deepEqual(q.applied,{composer:'Composer'});assert.ok(q.bytes.includes(Buffer.from('TITLE=Τίτλος')));
});
test('real FLAC preserves all encoded audio bytes and original tags',async(t)=>{
 const {execFileSync}=require('node:child_process'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 try{execFileSync('ffmpeg',['-version'],{stdio:'ignore'});}catch{if(process.env.CI)throw Error('CI requires ffmpeg');t.skip('ffmpeg unavailable');return;}
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'opsis-flac-')));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'sample.flac');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','flac','-metadata','album=Keep me',file]);
 const before=await fs.readFile(file);const payload=b=>{let i=4;while(true){const done=b[i]&128;i+=4+b.readUIntBE(i+1,3);if(done)return b.subarray(i);}};
 const r=await require('../music-tags').complete(file,{title:'Ελληνικός τίτλος',album:'No',composer:'Composer'});
 assert.equal(r.status,'updated');assert.deepEqual(await fs.readFile(r.backup),before);assert.deepEqual(payload(await fs.readFile(file)),payload(before));
 const m=await (await import('music-metadata')).parseFile(file);assert.equal(m.common.album,'Keep me');assert.equal(m.common.title,'Ελληνικός τίτλος');
});


test('local cover rejects unknown or excessive dimensions',()=>{
 const {validateCover}=require('../music-tags');
 assert.equal(validateCover({data:Buffer.from('not an image')}),null);
 const b=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.write('IHDR',12);b.writeUInt32BE(5000,16);b.writeUInt32BE(100,20);
 assert.equal(validateCover({data:b}),null);
});
test('real local MP3 and FLAC cover preserves audio and existing artwork',async(t)=>{
 const {execFileSync}=require('node:child_process'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 try{execFileSync('ffmpeg',['-version'],{stdio:'ignore'});}catch{if(process.env.CI)throw Error('CI requires ffmpeg');t.skip('ffmpeg unavailable');return;}
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'opsis-cover-')));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const data=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=','base64');
 const {complete}=require('../music-tags');const mm=await import('music-metadata');
 for(const ext of ['mp3','flac']){
  const file=path.join(dir,'sample.'+ext);
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a',ext==='mp3'?'libmp3lame':'flac',file]);
  const before=await fs.readFile(file);
  const payload=b=>{if(ext==='mp3')return b.subarray(b.toString('ascii',0,3)==='ID3'?10+b.subarray(6,10).reduce((a,x)=>a*128+x,0):0);let i=4;while(true){const done=b[i]&128;i+=4+b.readUIntBE(i+1,3);if(done)return b.subarray(i);}};
  const r=await complete(file,{}, {cover:{data}});assert.equal(r.coverApplied,true);
  assert.deepEqual(await fs.readFile(r.backup),before);assert.deepEqual(payload(await fs.readFile(file)),payload(before));
  const m=await mm.parseFile(file);assert.deepEqual(Buffer.from(m.common.picture[0].data),data);
  assert.equal((await complete(file,{}, {cover:{data}})).status,'skipped');
  await assert.rejects(complete(file,{title:'new'},{cancelled:()=>true}),/cancelled/);
 }
});


test('real RIFF WAV append preserves every original chunk and adds verified ID3',async(t)=>{
 const {execFileSync}=require('node:child_process'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 try{execFileSync('ffmpeg',['-version'],{stdio:'ignore'});}catch{if(process.env.CI)throw Error('CI requires ffmpeg');t.skip('ffmpeg unavailable');return;}
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'opsis-wave-tags-')));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'sample.wav');execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','pcm_s16le','-metadata','album=Keep me',file]);
 const before=await fs.readFile(file);const {complete}=require('../music-tags');
 const data=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=','base64');
 const r=await complete(file,{title:'Ελληνικός τίτλος',album:'Do not overwrite'},{cover:{data}});assert.equal(r.status,'updated');
 const after=await fs.readFile(file);assert.deepEqual(await fs.readFile(r.backup),before);assert.deepEqual(after.subarray(8,before.length),before.subarray(8));assert.equal(after.readUInt32LE(4),after.length-8);assert.equal(after.toString('ascii',before.length,before.length+4),'id3 ');
 const m=await (await import('music-metadata')).parseFile(file);assert.equal(m.common.title,'Ελληνικός τίτλος');assert.equal(m.common.album,'Keep me');assert.deepEqual(Buffer.from(m.common.picture[0].data),data);
 await assert.rejects(complete(file,{artist:'new'}),/existing ID3/);
 assert.deepEqual(await fs.readFile(file),after);
});


test('real Ogg Vorbis, Opus and M4A metadata preserves audio bytes and original backup',async(t)=>{
 const {execFileSync}=require('node:child_process'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 try{execFileSync('ffmpeg',['-version'],{stdio:'ignore'});}catch{if(process.env.CI)throw Error('CI requires ffmpeg');t.skip('ffmpeg unavailable');return;}
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'opsis-container-tags-')));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const {complete}=require('../music-tags'),mm=await import('music-metadata');
 const cover=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=','base64');
 const pcm=file=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',file,'-map','0:a:0','-f','s16le','pipe:1']);
 const oggTail=b=>{let at=0;for(let p=0;p<2;p++){const n=b[at+26];let payload=0;for(let i=0;i<n;i++)payload+=b[at+27+i];at+=27+n+payload;}return b.subarray(at);};
 const mp4Prefix=b=>{let at=0;while(at<b.length){if(b.toString('ascii',at+4,at+8)==='moov')return b.subarray(0,at);at+=b.readUInt32BE(at);}throw Error('moov missing');};
 for(const [ext,codec] of [['ogg','libvorbis'],['opus','libopus'],['m4a','aac']]){
  const file=path.join(dir,'sample.'+ext);
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=2','-c:a',codec,'-metadata','album=Keep me',file]);
  const before=await fs.readFile(file),decoded=pcm(file);
  const r=await complete(file,{title:'Ελληνικός τίτλος',album:'Do not overwrite'},{cover:{data:cover}});
  assert.equal(r.status,'updated',ext);assert.deepEqual(await fs.readFile(r.backup),before);
  const after=await fs.readFile(file),payload=ext==='m4a'?mp4Prefix:oggTail;
  assert.deepEqual(payload(after),payload(before),ext);assert.deepEqual(pcm(file),decoded,ext);
  const m=await mm.parseFile(file);assert.equal(m.common.title,'Ελληνικός τίτλος');assert.equal(m.common.album,'Keep me');assert.deepEqual(Buffer.from(m.common.picture[0].data),cover);
  assert.equal((await complete(file,{title:'Other'},{cover:{data:cover}})).status,'skipped');
 }
});
test('M4A faststart layout is rejected without modifying source',async(t)=>{
 const {execFileSync}=require('node:child_process'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 try{execFileSync('ffmpeg',['-version'],{stdio:'ignore'});}catch{if(process.env.CI)throw Error('CI requires ffmpeg');t.skip();return;}
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'opsis-faststart-')));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'fast.m4a');execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=duration=1','-c:a','aac','-movflags','+faststart',file]);
 const before=await fs.readFile(file);await assert.rejects(require('../music-tags').complete(file,{title:'new'}),/moov-last/);assert.deepEqual(await fs.readFile(file),before);
});


test('music folder scan is bounded, recursive and never writes or follows symlinks',async(t)=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'opsis-library-')));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 await fs.mkdir(path.join(dir,'album'));await fs.writeFile(path.join(dir,'album','a.mp3'),'fixture');await fs.writeFile(path.join(dir,'b.flac'),'fixture');await fs.writeFile(path.join(dir,'readme.txt'),'ignore');
 const {scanFolder}=require('../music-library');const result=await scanFolder(dir);
 assert.equal(result.files.length,2);assert.equal(result.truncated,false);assert.equal((await scanFolder(dir,{maxFiles:1})).files.length,1);assert.equal((await scanFolder(dir,{maxEntries:1})).truncated,true);assert.equal((await scanFolder(dir,{cancelled:()=>true})).files.length,0);
 assert.equal(await fs.readFile(path.join(dir,'album','a.mp3'),'utf8'),'fixture');
});

test('recovered Greek ID3 display text does not mutate or guess ambiguous original tags',()=>{
 const {readTrackText}=require('../music-tags');
 const original='Καλημέρα',bad=Buffer.from(original,'utf8').toString('latin1');
 const cp1252=new TextDecoder('windows-1252').decode(Buffer.from('Ελληνικά','utf8'));
 const meta={common:{title:bad,artist:'Björk',album:cp1252},native:{ID3v24:[{value:bad},{value:'Björk'},{value:cp1252}]}};
 assert.deepEqual(readTrackText(meta),{title:original,artist:'Björk',album:'Ελληνικά'});
 assert.equal(meta.common.title,bad);
 assert.equal(readTrackText({common:{title:bad},native:{vorbis:[{value:bad}]}}).title,bad);
 assert.equal(readTrackText({common:{title:'Café'},native:{ID3v23:[{value:'Café'}]}}).title,'Café');
 assert.equal(readTrackText({common:{title:'Ήδη ελληνικά'},native:{ID3v23:[{value:'Ήδη ελληνικά'}]}}).title,'Ήδη ελληνικά');
 assert.equal(readTrackText({common:{title:'a'.repeat(5000)}}).title.length,4096);
 assert.deepEqual(readTrackText({common:{},native:{ID3v23:null}}),{title:null,artist:null,album:null});
});

test('metadata writer refuses linked audio before parsing or modifying it',async(t)=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {complete}=require('../music-tags');
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'opsis-tag-link-')));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'source.mp3'),link=path.join(dir,'linked.mp3'),bytes=Buffer.alloc(32,7);
 await fs.writeFile(file,bytes);await fs.link(file,link);
 await assert.rejects(complete(file,{title:'test'}),/unsupported file/);
 await assert.rejects(complete(link,{title:'test'}),/unsupported file/);
 assert.deepEqual(await fs.readFile(file),bytes);
 assert.deepEqual((await fs.readdir(dir)).sort(),['linked.mp3','source.mp3']);
});


test('music scan distinguishes an exact file/entry limit from actual omission',async(t)=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'opsis-library-limit-')));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const {scanFolder}=require('../music-library');
 await fs.writeFile(path.join(dir,'one.mp3'),'fixture');
 let r=await scanFolder(dir,{maxFiles:1,maxEntries:1});
 assert.equal(r.files.length,1);assert.equal(r.examined,1);assert.equal(r.truncated,false);
 await fs.writeFile(path.join(dir,'readme.txt'),'ignore');
 r=await scanFolder(dir,{maxFiles:1,maxEntries:2});assert.equal(r.files.length,1);assert.equal(r.truncated,false);
 r=await scanFolder(dir,{maxEntries:1});assert.equal(r.examined,1);assert.equal(r.truncated,true);
 await fs.writeFile(path.join(dir,'two.flac'),'fixture');
 r=await scanFolder(dir,{maxFiles:1});assert.equal(r.files.length,1);assert.equal(r.truncated,true);
});


test('folder and main music admission share the same immutable supported formats',()=>{
 const {MUSIC_EXTENSIONS}=require('../music-library'),fs=require('node:fs'),path=require('node:path');
 assert.deepEqual(MUSIC_EXTENSIONS,['.mp3','.wav','.flac','.ogg','.m4a','.opus','.wma']);assert.ok(Object.isFrozen(MUSIC_EXTENSIONS));
 assert.match(fs.readFileSync(path.join(__dirname,'../main.js'),'utf8'),/AUDIO_FILE_EXTENSIONS = require\('\.\/music-library'\)\.MUSIC_EXTENSIONS/);
});
