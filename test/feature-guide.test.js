'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const guide=require('../renderer/feature-guide');
test('all guide destinations exist in actual markup',()=>{const html=fs.readFileSync(path.join(__dirname,'../renderer/index.html'),'utf8');const rows=guide.list('el');assert.ok(rows.length>=25);for(const r of rows){assert.ok(html.includes('data-tab="'+r.tab+'"'),r.tab);if(r.target){const dynamic=['converter.js','video.js'].map(x=>fs.readFileSync(path.join(__dirname,'../renderer',x),'utf8')).join('\n');assert.ok(html.includes('id="'+r.target+'"')||(r.tab==='converter'&&((dynamic.includes("id: '"+r.target+"'")||dynamic.includes("id:'"+r.target+"'"))||dynamic.includes("select('"+r.target+"'")||dynamic.includes("input('"+r.target+"'"))),r.target);}}});
test('Greek accent-insensitive and English cross-language search',()=>{assert.ok(guide.list('el','υποτιτλοι').some(x=>x.target==='vpSubTrack'));assert.ok(guide.list('de','metadata').some(x=>x.target==='metadataAuto'));assert.equal(guide.list('en','not-a-feature-123').length,0);});
test('experimental capability includes prerequisites',()=>{const r=guide.list('en').find(x=>x.target==='metadataFingerprint');assert.match(r.description,/AcoustID key/);assert.match(r.title,/experimental/);});

test('unique destinations and lazy converter routes',()=>{const rows=guide.list('en');assert.equal(rows.length,90);const ids=rows.filter(x=>x.target).map(x=>x.target);assert.equal(ids.length,new Set(ids).size);assert.ok(rows.some(x=>x.target==='vidCodec'));assert.ok(rows.some(x=>x.target==='convFormat'));});
test('reuse translated tab names for search',()=>{assert.ok(guide.list('de','Untertiteltest',{'tab.video':'Untertiteltest'}).every(x=>x.tab==='video'));assert.ok(guide.list('de','Untertiteltest',{'tab.video':'Untertiteltest'}).length>0);});

test('all 20 languages have explicit finder UI labels',()=>{for(const lang of ["el","en","fr","de","es","it","pt","ru","tr","pl","nl","sv","da","no","fi","cs","sk","hu","ro","uk"]){const u=guide.ui(lang);assert.ok(Object.values(u).every(x=>typeof x==='string'&&x.length>0));if(lang!=='en')assert.notEqual(u.title,guide.ui('en').title);}});
test('guide is grouped in tab order',()=>{const rows=guide.list('en'),order=Object.keys(guide.tabs);assert.ok(rows.every((r,i)=>i===0||order.indexOf(rows[i-1].tab)<=order.indexOf(r.tab)));});

test('keyboard ownership never crosses tabs or interactive controls',()=>{const f=guide.shortcutAllowed;assert.equal(f({},'player','player'),true);assert.equal(f({},'video','player'),false);assert.equal(f({},'settings','player'),false);for(const k of ['defaultPrevented','ctrlKey','altKey','metaKey','interactive','modal'])assert.equal(f({[k]:true},'video','video'),false);});
