'use strict';
// Static security checks (run with `npm test`): window hardening, CSP, IPC guards, no markup injection from user data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('every BrowserWindow keeps contextIsolation on, nodeIntegration off and the sandbox on', () => {
  for (const f of ['main.js', 'suite-main.js']) {
    const src = read(f);
    const wins = [...src.matchAll(/new BrowserWindow\(\{[\s\S]*?\n\s*\}\);/g)].map((m) => m[0]);
    assert.ok(wins.length >= 1, `${f}: no BrowserWindow found`);
    for (const w of wins) {
      assert.match(w, /contextIsolation:\s*true/, `${f}: contextIsolation`);
      assert.match(w, /nodeIntegration:\s*false/, `${f}: nodeIntegration`);
      assert.match(w, /sandbox:\s*true/, `${f}: sandbox`);
    }
  }
});

test('every page has a strict CSP (no inline script/style, no eval, no plugins, no base/form hijack) and no inline style attributes', () => {
  for (const f of ['index.html', 'help.html', 'splash.html']) {
    const html = read(path.join('renderer', f));
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html);
    assert.ok(csp, `${f}: no CSP`);
    assert.match(csp[1], /script-src 'self'/);
    assert.match(csp[1], /style-src 'self'/);
    assert.match(csp[1], /object-src 'none'/);
    assert.match(csp[1], /base-uri 'none'/);
    assert.match(csp[1], /form-action 'none'/);
    assert.ok(!/unsafe-inline|unsafe-eval/.test(csp[1]), `${f}: unsafe CSP`);
    assert.ok(!/\sstyle="/.test(html), `${f}: inline style attribute`);
    assert.ok(!/\son[a-z]+="/i.test(html), `${f}: inline event handler`);
  }
});

test('every ipcMain channel of main.js, conv-main.js and suite-main.js checks who is asking', () => {
  const cases = [['main.js', /fromMain\(|fromApp\(/], ['conv-main.js', /trusted\(/], ['suite-main.js', /fromSplash\(|isTrusted\(/]];
  for (const [file, guard] of cases) {
    const src = read(file);
    const parts = src.split(/\n\s*ipcMain\.(?:on|handle)\(/).slice(1);
    assert.ok(parts.length > 3, `${file}: channels not found`);
    for (const part of parts) {
      const chan = /^'([^']+)'/.exec(part)[1];
      const body = part.split(/\n\s*(?:ipcMain\.|\/\*|function |async function )/)[0];
      // the three read-only constants / dialogs delegate to the guard on the first line of their body as well
      assert.match(body, guard, `${file}: channel ${chan} has no sender check`);
    }
  }
});

test('IPC arguments are validated in main.js (types, sizes, patterns)', () => {
  const m = read('main.js');
  assert.match(m, /typeof enabled === 'boolean'/);
  assert.match(m, /PNG_DATA_URL/);
  assert.match(m, /slice\(0,\s*4000\)/, 'crash log entries are bounded');
  assert.match(m, /appendBoundedLog\(logPath,/, 'crash log uses bounded writer');
  assert.match(read('resource-diagnostics.js'), /max=512\*1024/, 'crash log is rotated');
  assert.match(m, /path\.isAbsolute\(filePath\)/);
  assert.match(m, /AUDIO_FILE_EXTENSIONS\.includes/);
  assert.match(m, /\^\[a-z0-9-\]\{1,30\}\$/, 'theme names are a strict pattern');
});

test('names of tracks and presets never reach innerHTML', () => {
  const app = read(path.join('renderer', 'app.js'));
  for (const bad of ['${item.name}', '${p.name}', '${track.name}', '${f.name}', '${item.picture}']) {
    assert.ok(!app.includes(bad), `app.js interpolates ${bad} into markup`);
  }
  const conv = read(path.join('renderer', 'converter.js'));
  assert.ok(!/innerHTML/.test(conv), 'converter.js must not use innerHTML');
  const splash = read(path.join('renderer', 'splash.js'));
  assert.ok(!/innerHTML/.test(splash), 'splash.js (catalogue text from the network) must not use innerHTML');
});

test('the update never runs a download that was not verified: hash is required and re-checked by the helper', () => {
  const sm = read('suite-main.js');
  assert.match(sm, /isTrustedReleaseDownload\(asset\.url/);
  assert.match(sm, /expectedSha256: sha/);
  assert.match(sm, /buildUpdateScript/);
  assert.ok(!/execFile\([^)]*setupPath|spawn\([^)]*asset\.url/.test(sm));
});

test('media ticket and converter read are bounded and main-frame checked', () => {
  const media=read('media-main.js'), conv=read('conv-main.js');
  assert.match(media,/randomBytes\(32\)/);
  assert.match(media,/tickets\.get\(key\)/);
  assert.match(media,/senderFrame === w\.webContents\.mainFrame/);
  assert.match(conv,/senderFrame === w\.webContents\.mainFrame/);
  assert.match(conv,/!inputFile\(p\)/);
  assert.match(conv,/req\.wav\.byteLength > MAX_READ/);
});

test('explicit executable paths and media ticket revocation', () => {
  const main=read('main.js'), video=read('renderer/videoplayer.js'), media=read('media-main.js');
  assert.match(main,/localPath\(path\.join\(dir,name\)\)/);
  assert.doesNotMatch(main,/execFile\('ffmpeg'/);
  assert.match(media,/tickets\.delete\(m\[1\]\)/);
  assert.match(video,/vpReleaseSource/);
});


test('experimental WASM page and artifact are excluded from release and require explicit developer opt-in',()=>{
 const m=read('main.js'),p=JSON.parse(read('package.json')),html=read('renderer/index.html');
 assert.match(m,/!app\.isPackaged&&process\.env\.OPSIS_EXPERIMENTAL_DSP==='1'/);
 assert.ok(p.build.files.includes('!renderer/index-dsp-dev.html'));
 assert.ok(p.build.files.includes('!renderer/dsp-dev/**/*'));
 assert.ok(!html.includes('wasm-unsafe-eval'));
});

test('local media policy rejects control characters and network paths before filesystem access',()=>{
 const {localPath,localDirectory}=require('../local-media-policy');
 const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'opsis-local-'));
 try{
  const file=path.join(dir,'sample.mp3');fs.writeFileSync(file,'fixture');assert.equal(localPath(file),fs.realpathSync.native(file));
  for(const bad of [file+'\t',file+'\x01',file+'\x7f','//server/share/file','\\\\server\\share\\file']){assert.equal(localPath(bad),null);assert.equal(localDirectory(bad),null);}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('settings backup uses one allowlist, validates before restore, and rolls back on quota failure',()=>{
 const B=require('../renderer/backup');
 const initial=new Map([['waveframe.lang','el'],['waveframe.skin','midnight'],['waveframe.unrecognized','do not export']]);
 let failed=false;
 const storage={getItem:k=>initial.has(k)?initial.get(k):null,setItem:(k,v)=>{if(k==='waveframe.skin'&&v==='light'&&!failed){failed=true;throw Error('quota');}initial.set(k,v);},removeItem:k=>initial.delete(k)};
 assert.deepEqual(B.collect(storage),{'waveframe.lang':'el','waveframe.skin':'midnight'});
 assert.equal(B.restore(storage,{'waveframe.lang':'en','waveframe.playlist':'{"bad":1}'}),false);assert.equal(initial.get('waveframe.lang'),'el');
 assert.equal(B.restore(storage,{'waveframe.lang':'en','waveframe.skin':'light'}),false);assert.equal(initial.get('waveframe.lang'),'el');assert.equal(initial.get('waveframe.skin'),'midnight');
 assert.equal(B.restore(storage,{'waveframe.lang':'en','waveframe.metadata.inferDisplay':'true','waveframe.video.remainingTime':'true','waveframe.unrecognized':'new'}),true);
 assert.equal(initial.get('waveframe.unrecognized'),'do not export');assert.equal(initial.get('waveframe.lang'),'en');
 assert.equal(B.sanitize({'waveframe.destFolder':'\\\\server\\share'}),null);
 assert.equal(B.sanitize({'waveframe.video.resume':'{"a":"bad"}'}),null);
});

test('all guide renderers load shared path identity before feature-guide',()=>{
 for(const page of ['renderer/index.html','renderer/help.html','renderer/splash.html']){
  const html=read(page);assert.ok(html.indexOf('src="path-identity.js"')>=0,page);
  assert.ok(html.indexOf('src="path-identity.js"')<html.indexOf('src="feature-guide.js"'),page);
 }
});

test('backup covers all persisted current video and converter keys and validates their actual encodings',()=>{
 const B=require('../renderer/backup');
 const current=['renderer/videoplayer.js','renderer/video.js','renderer/converter.js'];
 for(const file of current){
  const code=read(file);
  const keys=new Set(code.match(/waveframe\.(?:video\.[\w]+|vid\.opts|vidDestFolder|vidDestMode|conv\.opts|destFolder|destMode)\b/g)||[]);
  for(const key of keys)assert.ok(B.keys.includes(key),key);
 }
 const valid={'waveframe.video.nativeDecoder':'"d3d11va"','waveframe.video.repeat':'"shuffle"','waveframe.video.remainingTime':'true','waveframe.video.subSaveBeside':'false','waveframe.fxSoundMode':'external','waveframe.vidDestMode':'custom'};
 assert.deepEqual(B.sanitize(valid),valid);
 for(const [key,value] of [['waveframe.video.nativeDecoder','"arbitrary"'],['waveframe.video.repeat','"unknown"'],['waveframe.video.remainingTime','"false"'],['waveframe.video.subSaveBeside','null'],['waveframe.fxSoundMode','invalid'],['waveframe.vidDestMode','invalid']])assert.equal(B.sanitize({[key]:value}),null,key);
});


test('backup preserves normal Windows output folders without treating them as filesystem grants',()=>{
 const B=require('../renderer/backup');
 const valid={'waveframe.destFolder':'C:\\Users\\User\\Music','waveframe.vidDestFolder':'D:/Video output'};
 assert.deepEqual(B.sanitize(valid),valid);
 const m=new Map(Object.entries(valid));
 assert.deepEqual(B.collect({getItem:k=>m.get(k)??null}),valid);
 for(const value of ['C:relative','\\\\server\\share','\\\\?\\C:\\Music','C:\\Music:stream','C:\\Music\x7f','C:\\Music\n','C:\\'+'a'.repeat(32765)]) {
  for(const key of ['waveframe.destFolder','waveframe.vidDestFolder']) assert.equal(B.sanitize({[key]:value}),null,value.slice(0,40));
 }
});


test('backup restore avoids unchanged writes and rolls back only changed keys',()=>{
 const B=require('../renderer/backup'),m=new Map([['waveframe.lang','el'],['waveframe.skin','midnight']]),writes=[];
 const storage={getItem:k=>m.get(k)??null,setItem:(k,v)=>{writes.push([k,v]);if(k==='waveframe.skin'&&v==='light')throw Error('quota');m.set(k,v);},removeItem:k=>m.delete(k)};
 assert.equal(B.restore(storage,{'waveframe.lang':'el','waveframe.skin':'midnight'}),true);
 assert.deepEqual(writes,[]);
 assert.equal(B.restore(storage,{'waveframe.lang':'en','waveframe.skin':'light'}),false);
 assert.deepEqual(writes,[['waveframe.lang','en'],['waveframe.skin','light'],['waveframe.lang','el']]);assert.equal(m.get('waveframe.lang'),'el');
});


test('backup import locks only restored keys against stale renderer saves until reload',()=>{
 const B=require('../renderer/backup'),m=new Map([['waveframe.lang','el']]);
 const storage={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};
 assert.equal(B.restoreForReload(storage,{'waveframe.video.speed':'"bad"'}),false);
 assert.equal(B.canPersist('waveframe.video.speed'),true);
 assert.equal(B.restoreForReload(storage,{'waveframe.playlist':'[]','waveframe.video.resume':'{}','waveframe.lang':'en'}),true);
 for(const key of ['waveframe.playlist','waveframe.video.resume','waveframe.lang'])assert.equal(B.canPersist(key),false);
 assert.equal(B.canPersist('waveframe.accentColor'),true);
 assert.equal(m.get('waveframe.lang'),'en');
});
