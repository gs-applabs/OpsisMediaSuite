'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const guide=require('../renderer/feature-guide');
test('all guide destinations exist in actual markup',()=>{const html=fs.readFileSync(path.join(__dirname,'../renderer/index.html'),'utf8');const rows=guide.list('el');assert.ok(rows.length>=25);for(const r of rows){assert.ok(html.includes('data-tab="'+r.tab+'"'),r.tab);if(r.target)assert.ok(html.includes('id="'+r.target+'"'),r.target);}});
test('Greek accent-insensitive and English cross-language search',()=>{assert.ok(guide.list('el','υποτιτλοι').some(x=>x.target==='vpSubTrack'));assert.ok(guide.list('de','metadata').some(x=>x.target==='metadataAuto'));assert.equal(guide.list('en','not-a-feature-123').length,0);});
test('experimental capability includes prerequisites',()=>{const r=guide.list('en').find(x=>x.target==='metadataFingerprint');assert.match(r.description,/AcoustID key/);assert.match(r.title,/experimental/);});
