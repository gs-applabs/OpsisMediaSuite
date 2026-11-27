'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {query,rows,search,coverURL}=require('../music-lookup');
const id='12345678-1234-1234-1234-123456789abc';
test('escaped exact queries and missing input',()=>{assert.equal(query({title:'a"b',artist:'x'}),'recording:"a\\"b" AND artist:"x"');assert.throws(()=>query({title:'x'}));});
test('release choices stay separate, invalid IDs rejected',()=>{const r=rows({recordings:[{id,title:'Τίτλος','artist-credit':[{name:'Artist'}],score:100,releases:[{id,title:'Album',date:'2001-02-01'},{id,title:'Other',date:'2010'}]},{id:'invalid',title:'bad'}]});assert.equal(r.length,2);assert.equal(r[0].year,'2001');assert.equal(r[1].album,'Other');assert.equal(coverURL('bad'),null);});
test('fixed endpoint and explicit network errors',async()=>{let called=false;await assert.rejects(search({title:'Song',artist:'Artist'},async(url,opts)=>{called=true;assert.equal(url.hostname,'musicbrainz.org');assert.equal(opts.redirect,'error');return new Response('busy',{status:429});}),/429/);assert.ok(called);});
