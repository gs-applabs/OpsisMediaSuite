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
