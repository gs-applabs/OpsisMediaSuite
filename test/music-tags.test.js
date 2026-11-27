'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {infer,clean,patchTag,syncWrite}=require('../music-tags');
test('infer only unambiguous artist/title',()=>{assert.deepEqual(infer('Artist - Title.mp3'),{artist:'Artist',title:'Title'});assert.deepEqual(infer('01.mp3'),{});assert.deepEqual(infer('A - B - C.mp3'),{});});
test('bounded fields and no control characters',()=>assert.deepEqual(clean({title:' Ήχος ',year:'abcd',artist:'bad\nname',extra:'x'}),{title:'Ήχος'}));
test('new ID3 tag and preserve existing frame bytes',()=>{const p=patchTag(Buffer.alloc(10),Buffer.alloc(0),{title:'Τίτλος'});assert.equal(p.bytes.toString('ascii',10,14),'TIT2');const q=patchTag(p.bytes.subarray(0,10),p.bytes.subarray(10),{title:'No',artist:'Artist'});assert.deepEqual(q.bytes.subarray(10, p.bytes.length),p.bytes.subarray(10));assert.deepEqual(q.applied,{artist:'Artist'});});
test('existing common tags not overwritten',()=>assert.equal(patchTag(Buffer.alloc(10),Buffer.alloc(0),{title:'new'},{title:'old'}),null));
test('reject unsupported header flags',()=>{const h=Buffer.concat([Buffer.from([73,68,51,3,0,128]),syncWrite(0)]);assert.throws(()=>patchTag(h,Buffer.alloc(0),{title:'x'}),/unsupported/);});
