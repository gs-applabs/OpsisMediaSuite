'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {query,rows,search,coverURL}=require('../music-lookup');
const id='12345678-1234-1234-1234-123456789abc';
test('escaped exact queries and missing input',()=>{assert.equal(query({title:'a"b',artist:'x'}),'recording:"a\\"b" AND artist:"x"');assert.throws(()=>query({title:'x'}));});
test('release choices stay separate, invalid IDs rejected',()=>{const r=rows({recordings:[{id,title:'Τίτλος','artist-credit':[{name:'Artist'}],score:100,releases:[{id,title:'Album',date:'2001-02-01'},{id:'22345678-1234-1234-1234-123456789abc',title:'Other',date:'2010'}]},{id:'invalid',title:'bad'}]});assert.equal(r.length,2);assert.equal(r[0].year,'2001');assert.equal(r[1].album,'Other');assert.equal(coverURL('bad'),null);});
test('fixed endpoint and explicit network errors',async()=>{let called=false;await assert.rejects(search({title:'Song',artist:'Artist'},async(url,opts)=>{called=true;assert.equal(url.hostname,'musicbrainz.org');assert.equal(opts.redirect,'error');return new Response('busy',{status:429});}),/429/);assert.ok(called);});

test('AcoustID lookup sends fingerprint not file and rejects weak matches',async()=>{
 const {acousticSearch,acousticRows}=require('../music-lookup');
 assert.deepEqual(acousticRows({status:'ok',results:[{score:0.2,recordings:[{id,title:'x',artists:[{name:'a'}]}]}]}),[]);
 const result=await acousticSearch('Abcd1234',120,'testkey',async(url,opts)=>{
  assert.equal(url,'https://api.acoustid.org/v2/lookup');assert.equal(opts.method,'POST');assert.equal(opts.body.get('fingerprint'),'Abcd1234');assert.equal(opts.body.has('path'),false);
  return new Response(JSON.stringify({status:'ok',results:[{score:0.95,recordings:[{id,title:'Song',artists:[{name:'Artist'}]}]}]}));
 });
 assert.equal(result[0].title,'Song');assert.equal(result[0].score,95);
});

test('provider malformed entries and duplicate release identities are ignored',()=>{const r={id,title:'Song','artist-credit':[null,{name:'Artist',joinphrase:' & '},{name:'Other'}],releases:[null,{id,title:'Album'},{id,title:'Album'}]};const out=rows({recordings:[null,r,r]});assert.equal(out.length,1);assert.match(out[0].artist,/Artist.*Other/);assert.deepEqual(require('../music-lookup').acousticRows({status:'ok',results:[null,{score:.9,recordings:[null]}]}),[]);});
