'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const guide=require('../renderer/feature-guide');
test('all guide destinations exist in actual markup',()=>{const html=fs.readFileSync(path.join(__dirname,'../renderer/index.html'),'utf8');const rows=guide.list('el');assert.ok(rows.length>=25);for(const r of rows){assert.ok(html.includes('data-tab="'+r.tab+'"'),r.tab);if(r.target){const dynamic=['converter.js','video.js'].map(x=>fs.readFileSync(path.join(__dirname,'../renderer',x),'utf8')).join('\n');assert.ok(html.includes('id="'+r.target+'"')||(r.tab==='converter'&&((dynamic.includes("id: '"+r.target+"'")||dynamic.includes("id:'"+r.target+"'"))||dynamic.includes("select('"+r.target+"'")||dynamic.includes("input('"+r.target+"'"))),r.target);}}});
test('Greek accent-insensitive and English cross-language search',()=>{assert.ok(guide.list('el','υποτιτλοι').some(x=>x.target==='vpSubTrack'));assert.ok(guide.list('de','metadata').some(x=>x.target==='metadataAuto'));assert.equal(guide.list('en','not-a-feature-123').length,0);});
test('experimental capability includes prerequisites',()=>{const r=guide.list('en').find(x=>x.target==='metadataFingerprint');assert.match(r.description,/AcoustID key/);assert.match(r.title,/experimental/);});

test('unique destinations and lazy converter routes',()=>{const rows=guide.list('en');assert.equal(rows.length,128);const ids=rows.filter(x=>x.target).map(x=>x.target);assert.equal(ids.length,new Set(ids).size);assert.ok(rows.some(x=>x.target==='vidCodec'));assert.ok(rows.some(x=>x.target==='convFormat'));});
test('reuse translated tab names for search',()=>{assert.ok(guide.list('de','Untertiteltest',{'tab.video':'Untertiteltest'}).every(x=>x.tab==='video'));assert.ok(guide.list('de','Untertiteltest',{'tab.video':'Untertiteltest'}).length>0);});

test('all 20 languages have explicit finder UI labels',()=>{for(const lang of ["el","en","fr","de","es","it","pt","ru","tr","pl","nl","sv","da","no","fi","cs","sk","hu","ro","uk"]){const u=guide.ui(lang);assert.ok(Object.values(u).every(x=>typeof x==='string'&&x.length>0));if(lang!=='en')assert.notEqual(u.title,guide.ui('en').title);}});
test('guide is grouped in tab order',()=>{const rows=guide.list('en'),order=Object.keys(guide.tabs);assert.ok(rows.every((r,i)=>i===0||order.indexOf(rows[i-1].tab)<=order.indexOf(r.tab)));});

test('keyboard ownership never crosses tabs or interactive controls',()=>{const f=guide.shortcutAllowed;assert.equal(f({},'player','player'),true);assert.equal(f({},'video','player'),false);assert.equal(f({},'settings','player'),false);for(const k of ['defaultPrevented','ctrlKey','altKey','metaKey','interactive','modal'])assert.equal(f({[k]:true},'video','video'),false);});

test('localized existing control labels are searchable without replacing curated meaning',()=>{const r=guide.list('de','Dateien öffnen',{'vp.openFiles':'Dateien öffnen'});assert.equal(r.length,1);assert.equal(r[0].target,'vpOpen');assert.equal(r[0].controlLabel,'Dateien öffnen');});

test('all supported languages have localized finder guidance and welcome route',()=>{for(const lang of ["el","en","fr","de","es","it","pt","ru","tr","pl","nl","sv","da","no","fi","cs","sk","hu","ro","uk"]){const u=guide.ui(lang);for(const k of ['hint','placeholder','results','loadFailed','availability','experimental','clear','welcome'])assert.ok(u[k]);if(lang!=='en')assert.notEqual(u.welcome,guide.ui('en').welcome);}});
test('priority metadata descriptions translated without losing English search or prerequisites',()=>{for(const lang of ['fr','de','es','it']){const r=guide.list(lang,'AcoustID').find(x=>x.target==='metadataFingerprint');assert.equal(r.descriptionLang,lang);assert.match(r.description,/AcoustID/);assert.notEqual(r.title,guide.list('en').find(x=>x.target===r.target).title);}assert.equal(guide.list('sv').find(x=>x.target==='metadataFingerprint').descriptionLang,'en');});

test('loudness analysis rejects streams and oversized files, waits for duration',()=>{const f=guide.loudnessEligibility;assert.equal(f({local:false,duration:30}),'local-only');assert.equal(f({local:true,size:32*1024*1024+1,duration:30}),'size-limit');assert.equal(f({local:true,duration:NaN}),'wait');assert.equal(f({local:true,duration:601}),'duration-limit');assert.equal(f({local:true,size:32*1024*1024,duration:600}),'ok');});

test('transient image cache evicts oldest entries under both limits',()=>{const cache=new Map(),add=(k,v)=>guide.retainImage(cache,k,v,16,2);assert.ok(add('a','1234'));assert.ok(add('b','1234'));assert.ok(add('c','1234'));assert.deepEqual([...cache.keys()],['b','c']);assert.equal(add('huge','123456789'),false);assert.ok(add('b','x'));assert.deepEqual([...cache.keys()],['c','b']);});

test('serial queue coalesces duplicates, bounds pending and removes stale jobs',async()=>{let release,active=0,peak=0;const q=guide.createSerialQueue(async key=>{active++;peak=Math.max(peak,active);if(key==='a')await new Promise(r=>release=r);active--;return key;},2);const a=q.request('a');assert.equal(q.request('a',true),a);const b=q.request('b'),c=q.request('c');assert.equal(await q.request('overflow'),null);const d=q.request('d',true);assert.equal(await b,null);q.remove('c');assert.equal(await c,null);assert.equal(q.diagnostics().pending,1);release();assert.deepEqual(await Promise.all([a,d]),['a','d']);assert.equal(peak,1);assert.deepEqual(q.diagnostics(),{pending:0,active:0,peak:2});});
test('serial queue survives thousands of duplicate requests without pile-up',async()=>{let count=0;const q=guide.createSerialQueue(async key=>{count++;return key;},8);const jobs=Array.from({length:10000},()=>q.request('same'));assert.ok(jobs.every(p=>p===jobs[0]));assert.equal(await jobs[0],'same');assert.equal(count,1);assert.equal(q.diagnostics().pending,0);});

test('unchanged preferences do not trigger repeated storage writes',()=>{let writes=0;const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>{writes++;data.set(k,v);}};for(let i=0;i<10000;i++)guide.setIfChanged(storage,'accent','#123456');assert.equal(writes,1);assert.equal(guide.setIfChanged(storage,'accent','#654321'),true);assert.equal(writes,2);});

test('playlist search is accent-insensitive and does not mutate track order',()=>{const item={name:'Καλημέρα κόσμε',artist:'Artist',album:'Album',path:'C:/Music/track.wav'};assert.equal(guide.trackMatches(item,'καλημερα album'),true);assert.equal(guide.trackMatches(item,'track.wav'),true);assert.equal(guide.trackMatches(item,'missing'),false);assert.equal(guide.trackMatches(item,''),true);});

test('duplicate path review is Windows case insensitive, leaves other paths intact',()=>{const items=[{path:'C:/Music/A.mp3'},{path:'c:/music/a.mp3'},{path:'C:/Music/B.mp3'},{url:'https://example.com/song'}];assert.deepEqual([...guide.duplicateMusicPaths(items)],['c:/music/a.mp3']);assert.equal(items.length,4);assert.notEqual(guide.musicPathKey('/music/A.mp3'),guide.musicPathKey('/music/a.mp3'));});


test('static renderer IDs are unique',()=>{const html=fs.readFileSync(path.join(__dirname,'../renderer/index.html'),'utf8');const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(ids.filter((id,i)=>ids.indexOf(id)!==i),[]);});

test('shared path identity preserves URLs and non-Windows case, normalizes Windows separators',()=>{
 const P=require('../renderer/path-identity');
 assert.equal(guide.musicPathKey,P.key);
 assert.equal(P.key('C:\\Music\\A.mp3'),'c:/music/a.mp3');
 assert.equal(P.key('https://example.test/Track'),'https://example.test/Track');
 assert.notEqual(P.key('/tmp/A.mp3'),P.key('/tmp/a.mp3'));
 assert.equal(P.key(null),'');
});

test('music collection filters are case-insensitive, keep unknowns and do not mutate playback list',()=>{
 const rows=[{artist:'Alpha',genre:'Rock'},{artist:'alpha',genre:'Jazz'},{artist:null}];
 const groups=guide.musicGroups(rows,'artist');
 assert.deepEqual(groups,[{key:'g:alpha',label:'Alpha',count:2},{key:'unknown',label:'',count:1}]);
 assert.equal(guide.musicGroupKey(rows[1],'genre'),'g:jazz');
 assert.equal(guide.trackMatches(rows[1],'jazz'),true);assert.equal(rows[1].artist,'alpha');
 assert.deepEqual(guide.musicGroups(rows,'invalid'),[]);
});


test('forced metadata refresh after a tag write queues a fresh read instead of reusing active stale data',async()=>{
 let release,count=0;
 const q=guide.createSerialQueue(async()=>{const n=++count;if(n===1)await new Promise(r=>release=r);return n;},4);
 const old=q.request('track');await Promise.resolve();
 const fresh=q.request('track',true,true);assert.notEqual(old,fresh);
 assert.equal(q.request('track',true,true),fresh);
 release();assert.deepEqual(await Promise.all([old,fresh]),[1,2]);assert.equal(count,2);assert.equal(q.diagnostics().pending,0);
});
