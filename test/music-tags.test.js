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
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'opsis-tags-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
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
