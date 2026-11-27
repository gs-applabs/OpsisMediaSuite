'use strict';
// IPC glue for the video player (file picker, subtitle discovery, a read-only "wfmedia" protocol with range support), the photo editor (open / save)
// and M3U playlist import. Only the main window may call these channels; payloads are validated here.

const { ipcMain, dialog, protocol, app } = require('electron');
const fs = require('fs');
const path = require('path');
const M3U = require('./m3u.js');
const { localPath, allowedFile } = require('./local-media-policy.js');
const { randomBytes } = require('node:crypto');
const { serveFile } = require('./media-stream.js');
const { inventory } = require('./codec-inventory.js');
const { createNativeHost } = require('./native-host.js');
const { createProvider,movieHash }=require('./subtitle-provider.js');
const AutoSync=require('./subtitle-autosync.js');

const VIDEO_EXTS = ['mp4', 'm4v', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', 'm2ts', 'ogv', '3gp'];
const AUDIO_EXTS = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'wma', 'aiff', 'aif'];
const SUB_EXTS = ['srt', 'vtt', 'ass', 'ssa', 'sub'];
const IMG_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'avif'];
const SERVE_EXTS = new Set([...VIDEO_EXTS, ...AUDIO_EXTS, ...SUB_EXTS]);
const MAX_SUB_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 200 * 1024 * 1024;
const MAX_SAVE_BYTES = 256 * 1024 * 1024;
const SAVE_FORMATS = { jpeg: ['jpg', 'jpeg'], png: ['png'], webp: ['webp'] };

const extOf = (p) => path.extname(String(p || '')).slice(1).toLowerCase();
const isFile = (p) => !!localPath(p);
const PLAY_EXTS = new Set([...VIDEO_EXTS, ...AUDIO_EXTS]);

// Must run before the app is ready.
function registerScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: 'wfmedia', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: false } }]);
}

// Subtitle bytes -> text: UTF-8 (with or without BOM), otherwise Windows-1253 (Greek) which is what old .srt files from Greek sites use.
function decodeText(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.slice(3).toString('utf8');
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (_) { /* not UTF-8 */ }
  try { return new TextDecoder('windows-1253').decode(buf); } catch (_) { return buf.toString('latin1'); }
}

function readSubtitle(file){
  const st=fs.statSync(file);if(!st.isFile()||st.size>MAX_SUB_BYTES)return null;
  const text=decodeText(fs.readFileSync(file)),ext=extOf(file);
  if(ext==='sub'&&(!/^\s*\{\d{1,9}\}\{\d{1,9}\}/m.test(text)||text.includes('\0')))return null;
  return {name:path.basename(file),ext,text};
}
function siblingSubtitles(video) {
  const dir = path.dirname(video), base = path.basename(video, path.extname(video)).toLowerCase();
  let names = [];
  try { names = fs.readdirSync(dir).sort((a,b) => a.localeCompare(b)); } catch (_) { return []; }
  const out = [];
  for (const n of names) {
    const e = extOf(n);
    if (!SUB_EXTS.includes(e)) continue;
    const stem = path.basename(n, path.extname(n)).toLowerCase();
    if (stem !== base && !stem.startsWith(base + '.')) continue; // "movie.srt", "movie.el.srt"
    const f = path.join(dir, n);
    try { if(isFile(f)){const sub=readSubtitle(f);if(sub)out.push(sub);} } catch (_) { /* skip */ }
    if (out.length >= 8) break;
  }
  return out;
}

function init({ getMainWin, resolveFfmpegPath }) {
  const trusted = (e) => { const w = getMainWin(); return !!w && !w.isDestroyed() && e.sender === w.webContents && e.senderFrame === w.webContents.mainFrame; };
  ipcMain.handle('vp:codec-inventory', e => trusted(e) ? inventory() : null);
  const approved = new Set(), tickets = new Map();
  const remember = p => { if (!p) return; if (approved.size >= 4096) approved.delete(approved.values().next().value); approved.add(p); };
  async function authorize(p) {
    if(approved.has(p))return true;
    const r=await dialog.showMessageBox(getMainWin(),{type:'question',buttons:['Cancel / Ακύρωση','Open / Άνοιγμα'],defaultId:0,cancelId:0,message:'Allow this local media file? / Να επιτραπεί η πρόσβαση στο αρχείο;',detail:p});
    if(r.response!==1 || !allowedFile(p,PLAY_EXTS))return false;
    remember(p);return true;
  }
  const nativeHost=createNativeHost({app,extensions:PLAY_EXTS,authorize});
  ipcMain.handle('vp:native-status',e=>trusted(e)?nativeHost.status():null);
  ipcMain.handle('vp:native-open',async(e,p,engine,positionMs,subtitleText)=>trusted(e)?nativeHost.open(p,engine,positionMs,subtitleText):{ok:false,code:'denied'});
  ipcMain.handle('vp:native-stop',e=>{if(trusted(e)){nativeHost.stop();return true;}return false;});
  const bk = { dir: '' };
  const backupRoot = () => path.join(app.getPath('userData'), 'backups');

  protocol.handle('wfmedia', async (req) => {
    try {
      const u = new URL(req.url), key = u.pathname.slice(1);
      const ticket = u.hostname === 'f' && /^[a-f0-9]{64}$/.test(key) ? tickets.get(key) : null;
      const origin = req.headers.get('origin');
      if (!ticket || (origin && origin !== 'null') || !['GET','HEAD'].includes(req.method)) return new Response('not found', { status: 404 });
      const p = allowedFile(ticket, PLAY_EXTS);
      if (!p) return new Response('not found', { status: 404 });
      return await serveFile(p,extOf(p),req);
    } catch (_) { return new Response('bad request', { status: 400 }); }
  });
  ipcMain.handle('vp:open-source', async (e, value) => {
    if (!trusted(e)) return null;
    const p = allowedFile(value, PLAY_EXTS); if (!p) return null;
    if (!approved.has(p)) {
      const r = await dialog.showMessageBox(getMainWin(), {type:'question', buttons:['Cancel / Ακύρωση','Open / Άνοιγμα'], defaultId:0, cancelId:0, message:'Allow this local media file? / Να επιτραπεί η πρόσβαση στο αρχείο;', detail:p});
      if (r.response !== 1 || !trusted(e) || !allowedFile(p, PLAY_EXTS)) return null;
      remember(p);
    }
    const key = randomBytes(32).toString('hex');
    if (tickets.size >= 64) tickets.delete(tickets.keys().next().value);
    tickets.set(key,p);
    return 'wfmedia://f/' + key;
  });

  ipcMain.handle('vp:release-source', (e, value) => {
    if (!trusted(e) || typeof value !== 'string') return false;
    const m = /^wfmedia:\/\/f\/([a-f0-9]{64})$/.exec(value);
    return !!m && tickets.delete(m[1]);
  });

  /* ---------------- video player ---------------- */
  ipcMain.handle('vp:pick', async (e, kind) => {
    if (!trusted(e)) return [];
    const r = await dialog.showOpenDialog(getMainWin(), kind === 'folder'
      ? { properties: ['openDirectory'] }
      : { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Media', extensions: [...VIDEO_EXTS, ...AUDIO_EXTS] }, { name: 'All files', extensions: ['*'] }] });
    if (r.canceled) return [];
    if (kind === 'folder') {
      const out = [];
      (function walk(d, depth) {
        let list = []; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
        for (const it of list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
          const f = path.join(d, it.name);
          if (it.isFile() && [...VIDEO_EXTS, ...AUDIO_EXTS].includes(extOf(it.name))) out.push(f);
          else if (it.isDirectory() && depth < 3) walk(f, depth + 1);
          if (out.length >= 2000) return;
        }
      })(r.filePaths[0], 0);
      const files = out.map(p => allowedFile(p, PLAY_EXTS)).filter(Boolean); files.forEach(remember); return files;
    }
    const files = r.filePaths.map(p => allowedFile(p, PLAY_EXTS)).filter(Boolean).slice(0, 2000); files.forEach(remember); return files;
  });
  ipcMain.handle('vp:subs-for', (e, p) => (trusted(e) && approved.has(allowedFile(p, PLAY_EXTS)) ? siblingSubtitles(p) : []));
  ipcMain.handle('vp:pick-sub', async (e) => {
    if (!trusted(e)) return null;
    const r = await dialog.showOpenDialog(getMainWin(), { properties: ['openFile'], filters: [{ name: 'Subtitles', extensions: SUB_EXTS }] });
    if (r.canceled || !allowedFile(r.filePaths[0], new Set(SUB_EXTS))) return null;
    const f = r.filePaths[0];
    try { return readSubtitle(f); } catch (_) { return null; }
  });
  let subtitleProvider=createProvider({decode:decodeText});
  let hashBusy=false;
  ipcMain.handle('vp:sub-search',async(e,req)=>{
    if(!trusted(e)||!req||typeof req!=='object')return {ok:false,code:'denied'};
    // Do not accept renderer-supplied hash/path as a general read primitive.
    let hash=null;
    if(req.hashPath){
      if(hashBusy)return {ok:false,code:'busy'};
      const p=allowedFile(req.hashPath,PLAY_EXTS);
      if(!p||!approved.has(p))return {ok:false,code:'denied'};
      hashBusy=true;try{hash=await movieHash(p);}catch{}finally{hashBusy=false;}
      if(!trusted(e))return {ok:false,code:'denied'};
    }
    return subtitleProvider.search({query:req.query,language:req.language,apiKey:req.apiKey,username:req.username,password:req.password,moviehash:hash});
  });
  ipcMain.handle('vp:sub-download',async(e,id)=>trusted(e)?subtitleProvider.download(id):{ok:false,code:'denied'});
  ipcMain.handle('vp:sub-disconnect',e=>trusted(e)?subtitleProvider.clear():false);
  let autoSyncBusy=false,autoSyncWorker=null,autoSyncCancelled=false;
  ipcMain.handle('vp:sub-autosync-cancel',e=>{if(!trusted(e)||!autoSyncBusy)return false;autoSyncCancelled=true;autoSyncWorker?.postMessage('cancel');return true;});
  ipcMain.handle('vp:sub-autosync',async(e,req)=>{
    if(!trusted(e)||autoSyncBusy||!req||!Array.isArray(req.cues)||req.cues.length>20000)return {ok:false,code:'denied-or-busy'};
    const p=allowedFile(req.path,PLAY_EXTS);
    if(!p||!approved.has(p))return {ok:false,code:'denied'};
    const audioIndex=req.audioIndex??0;if(!Number.isInteger(audioIndex)||audioIndex<0||audioIndex>63)return {ok:false,code:'bad-audio-index'};
    autoSyncBusy=true;autoSyncCancelled=false;
    try{
      const ff=await resolveFfmpegPath();
      if(!ff||!trusted(e))return {ok:false,code:'no-ffmpeg'};
      if(autoSyncCancelled)return {ok:false,code:'cancelled'};
      const cues=req.cues.map(c=>({start:c?.start,end:c?.end})).filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end));
      const {Worker}=require('node:worker_threads');
      return await new Promise(resolve=>{
        const worker=new Worker(path.join(__dirname,'subtitle-sync-worker.js'),{workerData:{ffmpeg:ff,file:p,cues,audioIndex,seconds:1800}});autoSyncWorker=worker;
        let result=null,finished=false;
        const finish=r=>{if(finished)return;finished=true;clearTimeout(timer);autoSyncWorker=null;resolve(autoSyncCancelled?{ok:false,code:'cancelled'}:r);};
        const timer=setTimeout(()=>{worker.postMessage('cancel');},125000);
        worker.once('message',r=>{result=r;});worker.once('error',()=>finish({ok:false,code:'worker-error'}));worker.once('exit',()=>finish(result||{ok:false,code:'worker-exited'}));
      });
    }catch{return {ok:false,code:'audio-analysis-failed'};}finally{autoSyncBusy=false;autoSyncWorker=null;}
  });
  let subtitleSaveBusy=false;
  ipcMain.handle('vp:save-sub',async(e,req)=>{
    if(!trusted(e)||subtitleSaveBusy||!req||!['srt','vtt'].includes(req.format)||typeof req.text!=='string'||!req.text.trim()||Buffer.byteLength(req.text,'utf8')>MAX_SUB_BYTES)return {ok:false};
    const name=typeof req.name==='string'?req.name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/\.[^.]+$/,'').slice(0,100):'subtitle';
    subtitleSaveBusy=true;
    try{
      const r=await dialog.showSaveDialog(getMainWin(),{defaultPath:(name||'subtitle')+'-synced.'+req.format,filters:[{name:req.format.toUpperCase(),extensions:[req.format]}]});
      if(r.canceled||!r.filePath)return {ok:false,canceled:true};
      const parent=require('./local-media-policy').localDirectory(path.dirname(r.filePath));
      if(!parent||path.extname(r.filePath).toLowerCase()!=='.'+req.format)return {ok:false};
      const target=path.join(parent,path.basename(r.filePath));
      // Never overwrite an original subtitle, even after the OS save prompt.
      await fs.promises.writeFile(target,req.text,{encoding:'utf8',flag:'wx'});
      return {ok:true};
    }catch(_){return {ok:false};}finally{subtitleSaveBusy=false;}
  });
  ipcMain.handle('vp:exists', (e, list) => (trusted(e) && Array.isArray(list) ? list.slice(0, 500).map((p) => isFile(p)) : []));

  /* ---------------- photo editor ---------------- */
  const imageGrants=new Set();
  const imageTypes=new Set(IMG_EXTS);
  function approveImage(p){const f=allowedFile(p,imageTypes);if(!f)return null;if(imageGrants.size>=128)imageGrants.delete(imageGrants.values().next().value);imageGrants.add(f);return f;}
  let imageReadBusy=false;
  ipcMain.handle('photo:pick', async (e) => {
    if (!trusted(e)) return null;
    const r = await dialog.showOpenDialog(getMainWin(), { properties: ['openFile'], filters: [{ name: 'Images', extensions: IMG_EXTS }] });
    return r.canceled ? null : approveImage(r.filePaths[0]);
  });
  ipcMain.handle('photo:read', async (e, p) => {
    if (!trusted(e) || imageReadBusy) return null;
    const f=allowedFile(p,imageTypes);
    if(!f||!imageGrants.has(f))return null;
    imageReadBusy=true;let handle;
    try{
      handle=await fs.promises.open(f,'r');
      const st=await handle.stat();
      if(!st.isFile()||st.size>MAX_IMAGE_BYTES)return {error:'too-large'};
      const bytes=new ArrayBuffer(st.size),b=new Uint8Array(bytes);
      let offset=0;
      while(offset<b.length){const r=await handle.read(b,offset,b.length-offset,offset);if(!r.bytesRead)return null;offset+=r.bytesRead;}
      const after=await handle.stat();if(after.size!==st.size||after.mtimeMs!==st.mtimeMs)return null;
      return {name:path.basename(f),bytes};
    }catch(_){return null;}finally{try{if(handle)await handle.close();}catch{}imageReadBusy=false;}
  });
  ipcMain.handle('photo:save', async (e, req) => {
    if (!trusted(e) || !req || !SAVE_FORMATS[req.format] || !(req.bytes instanceof ArrayBuffer || ArrayBuffer.isView(req.bytes)) || req.bytes.byteLength > MAX_SAVE_BYTES) return { ok: false };
    const base = String(req.name || 'photo').replace(/[\\/:*?"<>|\0]/g, '_').replace(/\.[A-Za-z0-9]{1,5}$/, '').slice(0, 120) || 'photo';
    const ext = SAVE_FORMATS[req.format][0];
    const r = await dialog.showSaveDialog(getMainWin(), { defaultPath: path.join(app.getPath('pictures'), `${base}-edited.${ext}`), filters: [{ name: ext.toUpperCase(), extensions: SAVE_FORMATS[req.format] }] });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    if (!SAVE_FORMATS[req.format].includes(extOf(r.filePath))) return { ok: false };
    try {
      // A view can cover only part of its backing buffer (including pooled Buffers).
      const bytes = req.bytes instanceof ArrayBuffer ? Buffer.from(req.bytes)
        : Buffer.from(req.bytes.buffer, req.bytes.byteOffset, req.bytes.byteLength);
      fs.writeFileSync(r.filePath, bytes);
      return { ok: true, file: r.filePath };
    } catch (_) { return { ok: false }; }
  });

  // WAVEFRAME_SELFTEST: the real renderer plays a generated clip through wfmedia: with its subtitle, edits a generated photo, and audits the layout.
  // generated clip (APPDATA is not touched).
  async function selfTest() {
    const out = []; const check = (name, ok, extra) => out.push({ name, ok: !!ok, extra: ok ? extra : (extra || 'failed') });
    const win = getMainWin(); const os = require('os'); const crypto = require('crypto');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-media-self-'));
    const js = (code) => win.webContents.executeJavaScript(code);
    const until = async (code, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(code)) return true; await new Promise((r) => setTimeout(r, 150)); } return false; };
    try {
      /* video player */
      const ff = await resolveFfmpegPath();
      if (ff) {
        const file = path.join(dir,'clip.webm');
        const make = await new Promise(res => require('child_process').execFile(ff,['-hide_banner','-v','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=25:duration=5','-f','lavfi','-i','sine=frequency=440:duration=5','-c:v','libvpx','-c:a','libvorbis','-shortest',file],{timeout:60000},err=>res(!err)));
        check('WebM test fixture generated',make && fs.existsSync(file),'VP8/Vorbis');
        if (fs.existsSync(file)) {
          remember(allowedFile(file, PLAY_EXTS));
          fs.writeFileSync(path.join(dir, path.basename(file, path.extname(file)) + '.srt'), '1\r\n00:00:00,200 --> 00:00:01,500\r\nΚαλημέρα\r\n\r\n');
          await js("document.querySelector('.tab-btn[data-tab=\"video\"]').click(); loadVideoPlayer().then(() => 1)");
          await until("!!window.WaveframeVideoPlayer", 8000);
          await js(`window.WaveframeVideoPlayer.open(${JSON.stringify(file)}); 1`);
          const ok = await until("(() => { const v = document.getElementById('vpVideo'); return v && v.readyState >= 2 && v.videoWidth === 320; })()", 15000);
          const info = await js("(() => { const v = document.getElementById('vpVideo'); return JSON.stringify({ w: v.videoWidth, h: v.videoHeight, dur: Math.round(v.duration * 10) / 10, err: v.error && v.error.code, media: document.getElementById('vpFrame').classList.contains('has-media'), tracks: v.textTracks.length }); })()");
          check('video player plays a local WebM clip through wfmedia (320x180)', ok, info);
          const hasCues = await until("(() => {const v=document.getElementById('vpVideo');return Array.from(v.textTracks).some(tr=>tr.mode==='showing' && tr.cues && tr.cues.length===1);})()",6000);
          await js("(() => { const v=document.getElementById('vpVideo'); v.pause(); if(Number.isFinite(v.duration)) v.currentTime=0.8; return 1; })()");
          const subOk = await until("(() => { const v=document.getElementById('vpVideo'); return !v.seeking && Math.abs(v.currentTime-0.8)<0.2 && Array.from(v.textTracks).some(tr=>tr.mode==='showing' && Array.from(tr.activeCues || []).some(c=>c.text==='Καλημέρα')); })()",6000);
          check('video player activates the correct Greek subtitle cue at 0.8 s', hasCues && subOk, await js("(() => {const v=document.getElementById('vpVideo');return JSON.stringify({time:v.currentTime,ready:v.readyState,seeking:v.seeking,tracks:Array.from(v.textTracks).map(tr=>({mode:tr.mode,cues:tr.cues?.length,active:Array.from(tr.activeCues||[]).map(c=>c.text)}))});})()"));
          await js("document.getElementById('vpSubTrack').value='-1';document.getElementById('vpSubTrack').dispatchEvent(new Event('change'));1");
          check('subtitle off clears active cues',await js("Array.from(document.getElementById('vpVideo').textTracks).every(tr=>tr.mode==='disabled')"),'off');
          await js("document.getElementById('vpSubTrack').value='0';document.getElementById('vpSubTrack').dispatchEvent(new Event('change'));1");
          check('subtitle selection restores one track and cue',await until("Array.from(document.getElementById('vpVideo').textTracks).filter(tr=>tr.mode==='showing' && tr.cues?.length===1).length===1",3000),'on');
          // Real HTTP transfer through the same provider client and real IPC/UI.
          // Only the self-test injects a fixture transport; production uses fixed HTTPS origins.
          const http=require('node:http'),requests=[];
          const server=http.createServer((req,res)=>{
            requests.push(req.url);
            if(req.url.startsWith('/subtitles?')){res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{attributes:{language:'el',files:[{file_id:123,file_name:'fixture.el.srt'}],release:'OPSIS generated test'}}]}));}
            else if(req.url==='/download'){res.setHeader('content-type','application/json');res.end(JSON.stringify({link:'https://dl.opensubtitles.com/download/fixture',remaining:1}));}
            else if(req.url==='/download/fixture'){res.setHeader('content-type','text/plain; charset=utf-8');res.end('1\n00:00:01,000 --> 00:00:02,000\nΔοκιμή υποτίτλων\n\n2\n00:00:03,000 --> 00:00:04,000\nΔεύτερη φράση\n');}
            else{res.statusCode=404;res.end();}
          });
          await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
          const savedProvider=subtitleProvider;
          try{
            subtitleProvider=createProvider({decode:decodeText,fetchImpl:(url,opts)=>{const u=new URL(url);const route=u.hostname==='api.opensubtitles.com'?u.pathname.replace('/api/v1','')+u.search:u.pathname;return fetch('http://127.0.0.1:'+server.address().port+route,opts);}});
            await js("document.getElementById('vpSubOnlineToggle').click();document.getElementById('vpSubKey').value='fixture-key';document.getElementById('vpSubQuery').value='OPSIS generated test';document.getElementById('vpSubLanguage').value='el';document.getElementById('vpSubSearch').click();1");
            const found=await until("document.getElementById('vpSubResults').options.length===1&&!document.getElementById('vpSubDownload').disabled",5000);
            await new Promise(r=>setTimeout(r,800));
            await js("document.getElementById('vpSubDownload').click();1");
            const loaded=await until("Array.from(document.getElementById('vpVideo').textTracks).some(t=>t.mode==='showing'&&t.cues?.length===2)",5000);
            check('online subtitle real HTTP fixture search and download attaches two Greek cues',found&&loaded&&requests.length===3,JSON.stringify(requests));
            const seek=async t=>{await js("(()=>{const v=document.getElementById('vpVideo');v.pause();v.currentTime="+t+";return 1})()");return until("!document.getElementById('vpVideo').seeking&&Math.abs(document.getElementById('vpVideo').currentTime-"+t+")<.15",4000);};
            const active=()=>js("Array.from(document.getElementById('vpVideo').textTracks).flatMap(t=>t.mode==='showing'?Array.from(t.activeCues||[]).map(c=>c.text):[])");
            await seek(0.5);check('downloaded subtitle not active before start',(await active()).length===0);
            await seek(1.3);check('downloaded Greek subtitle active at 1.3s',await until("Array.from(document.getElementById('vpVideo').textTracks).some(t=>Array.from(t.activeCues||[]).some(c=>c.text==='Δοκιμή υποτίτλων'))",3000));
            // Compare the same paused video frame with captions on/off in the compositor.
            // Report difference independently from timing; a cue event alone does not prove pixels.
            const rect=await js("(()=>{const r=document.getElementById('vpVideo').getBoundingClientRect();return {x:Math.max(0,Math.floor(r.x)),y:Math.max(0,Math.floor(r.y)),width:Math.floor(Math.min(r.right,innerWidth)-Math.max(0,r.left)),height:Math.floor(Math.min(r.bottom,innerHeight)-Math.max(0,r.top))}})()");
            if(rect.width>0&&rect.height>0){
              await new Promise(r=>setTimeout(r,250));const on=(await win.webContents.capturePage(rect)).toBitmap();
              const selected=await js("document.getElementById('vpSubTrack').value");
              await js("document.getElementById('vpSubTrack').value='-1';document.getElementById('vpSubTrack').dispatchEvent(new Event('change'));1");
              await new Promise(r=>setTimeout(r,250));const off=(await win.webContents.capturePage(rect)).toBitmap();
              let changed=0;if(on.length===off.length)for(let k=0;k<on.length;k+=4)if(Math.abs(on[k]-off[k])+Math.abs(on[k+1]-off[k+1])+Math.abs(on[k+2]-off[k+2])>30)changed++;
              check('downloaded subtitle changes actual captured video pixels',changed>20,'changed pixels='+changed);
              await js("document.getElementById('vpSubTrack').value="+JSON.stringify(selected)+";document.getElementById('vpSubTrack').dispatchEvent(new Event('change'));1");
            }else check('downloaded subtitle changes actual captured video pixels',false,'video outside viewport');
            await js("document.getElementById('vpSubDelayExact').value='1';document.getElementById('vpSubDelayExact').dispatchEvent(new Event('change'));1");
            await seek(1.3);check('positive delay removes old active cue',(await active()).length===0);
            await seek(2.3);check('positive 1s delay activates downloaded Greek cue at 2.3s',await until("Array.from(document.getElementById('vpVideo').textTracks).some(t=>Array.from(t.activeCues||[]).some(c=>c.text==='Δοκιμή υποτίτλων'))",3000));
            await seek(0.7);
            await js("document.getElementById('vpSubCue').selectedIndex=0;document.getElementById('vpSubSyncHere').click();1");
            check('align selected cue computes exact negative offset',await js("Math.abs(Number(document.getElementById('vpSubDelayExact').value)+0.3)<.15"));
            await seek(0.9);check('aligned cue active at corrected time',await until("Array.from(document.getElementById('vpVideo').textTracks).some(t=>Array.from(t.activeCues||[]).some(c=>c.text==='Δοκιμή υποτίτλων'))",3000));
            await seek(0.7);
            await js("document.getElementById('vpSubCue').selectedIndex=0;document.getElementById('vpSubAnchorA').click();1");
            await seek(3.1);
            await js("document.getElementById('vpSubCue').selectedIndex=1;document.getElementById('vpSubAnchorB').click();1");
            check('two-point subtitle correction adjusts drift and offset',await js("(()=>{const t=Array.from(document.getElementById('vpVideo').textTracks).find(t=>t.mode==='showing');return t?.cues?.length===2&&Math.abs(t.cues[0].startTime-.7)<.18&&Math.abs(t.cues[1].startTime-3.1)<.18;})()"));
            await js("document.getElementById('vpSubAnchorReset').click();document.getElementById('vpSubOnlineToggle').click();1");
          }finally{subtitleProvider=savedProvider;server.closeAllConnections();await new Promise(r=>server.close(r));}
          await js("document.getElementById('vpFx').click(); 1");
          await new Promise((r) => setTimeout(r, 400));
          check('equalizer on the video sound turns on (CORS-enabled wfmedia: source)', await js("document.getElementById('vpFx').getAttribute('aria-pressed') === 'true' && !/./.test(document.getElementById('vpStatus').textContent.match(/equalizer|ισοσταθμιστ/i) || '')"), await js("document.getElementById('vpStatus').textContent"));
          const unapproved = path.join(dir,'unapproved.mp4'); fs.copyFileSync(file, unapproved);
          const unauthorized = await js(`fetch('wfmedia://f/' + encodeURIComponent(${JSON.stringify(unapproved)})).then(r => r.status).catch(() => 'blocked')`);
          check('wfmedia rejects an unapproved media path', unauthorized === 404 || unauthorized === 'blocked', String(unauthorized));
          const guard = await js("fetch('wfmedia://f/' + encodeURIComponent('C:\\Windows\\System32\\drivers\\etc\\hosts')).then((r) => r.status).catch(() => 'blocked')");
          check('wfmedia: refuses files that are not media / subtitles', guard === 404 || guard === 'blocked', String(guard));
          // MP4 is a separate required capability; a successful WebM fixture is not proof of H.264 playback.
          const mp4 = path.join(dir,'h264.mp4');
          const mp4Built = await new Promise(res => require('child_process').execFile(ff,['-hide_banner','-v','error','-y','-f','lavfi','-i','testsrc2=size=352x192:rate=25:duration=3','-f','lavfi','-i','sine=frequency=440:duration=3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-shortest',mp4],{timeout:60000},err=>res(!err)));
          check('H.264/AAC MP4 test fixture generated',mp4Built && fs.existsSync(mp4),'MP4');
          if(mp4Built && fs.existsSync(mp4)) {
            remember(allowedFile(mp4,PLAY_EXTS));
            await js(`window.WaveframeVideoPlayer.open(${JSON.stringify(mp4)});1`);
            const mp4Ok=await until("(() => {const v=document.getElementById('vpVideo');return v.readyState>=2 && v.videoWidth===352;})()",15000);
            check('H.264/AAC MP4 playback',mp4Ok,await js("(() => {const v=document.getElementById('vpVideo');return JSON.stringify({w:v.videoWidth,error:v.error?.code,message:v.error?.message,mp4:v.canPlayType('video/mp4'),ready:v.readyState});})()"));
            check('no stale subtitle track after source change',await js("document.getElementById('vpVideo').textTracks.length===0"),'new media');
          }
        }
      }
      if(process.env.WAVEFRAME_SELFTEST==='1'&&process.env.OPSIS_PUBLIC_SUBTITLE_FIXTURE==='1'){
        const source=path.join(__dirname,'public-subtitle-fixture'),file=path.join(source,'sintel.mp4'),sub=path.join(source,'sintel.en.vtt');
        const approvedFile=allowedFile(file,PLAY_EXTS);
        const expected=require('./renderer/vplib').subtitleToVtt(readSubtitle(sub).text,'vtt',0).entries;
        remember(approvedFile);
        await js("document.querySelector('.tab-btn[data-tab=\"video\"]').click();loadVideoPlayer().then(()=>1)");
        await js("WaveframeVideoPlayer.open("+JSON.stringify(file)+");1");
        const ready=await until("document.getElementById('vpVideo').readyState>=2&&document.getElementById('vpVideo').videoWidth>0&&Array.from(document.getElementById('vpVideo').textTracks).some(t=>t.mode==='showing'&&t.cues?.length>=2)",15000);
        check('public MDN Sintel video and downloaded WebVTT loaded',ready,expected.length+' parsed cues');
        const cue=expected[1],mid=(cue.start+cue.end)/2;
        await js("(()=>{const v=document.getElementById('vpVideo');v.pause();v.currentTime="+mid+";return 1})()");
        const matches=await until("!document.getElementById('vpVideo').seeking&&Array.from(document.getElementById('vpVideo').textTracks).some(t=>Array.from(t.activeCues||[]).some(c=>c.text==="+JSON.stringify(cue.text)+"))",6000);
        check('downloaded public subtitle active at matching source time',matches,mid+' s');
        await new Promise(r=>setTimeout(r,250));
        fs.writeFileSync(path.join(source,'sintel-caption.png'),(await win.webContents.capturePage()).toPNG());
        await js("document.getElementById('vpSubDelayExact').value='2';document.getElementById('vpSubDelayExact').dispatchEvent(new Event('change'));1");
        const target=cue.start+2+.25;
        await js("document.getElementById('vpVideo').currentTime="+target+";1");
        const shifted=await until("!document.getElementById('vpVideo').seeking&&Array.from(document.getElementById('vpVideo').textTracks).some(t=>Array.from(t.activeCues||[]).some(c=>c.text==="+JSON.stringify(cue.text)+"&&Math.abs(c.startTime-"+(cue.start+2)+")<.001))",6000);
        check('downloaded public subtitle follows 2s timing correction',shifted,target+' s');
        fs.writeFileSync(path.join(source,'sintel-caption-synced.png'),(await win.webContents.capturePage()).toPNG());
      }
      // Real file decode + authorized IPC + timing estimator. The waveform
      // is synthetic and has known irregular audio activity, not spoken words.
      if(ff){
        const cues=[{start:2,end:3.1},{start:6,end:7.7},{start:11,end:12.4},{start:18,end:20.3},{start:27,end:28.2},{start:36,end:38.5},{start:46,end:47.5},{start:53,end:55.1}];
        const rate=8000,seconds=65,samples=rate*seconds;
        const wav=Buffer.alloc(44+samples*2);
        wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
        for(const c of cues){const a=Math.round((c.start+1.7)*rate),b=Math.round((c.end+1.7)*rate);for(let i=a;i<b;i++)wav.writeInt16LE(Math.round(10000*Math.sin(i*2*Math.PI*440/rate)),44+i*2);}
        const file=path.join(dir,'audio-sync.wav');fs.writeFileSync(file,wav);
        const req={path:file,cues};
        const denied=await js("waveframe.vpSubAutoSync("+JSON.stringify(req)+")");
        check('audio sync refuses unapproved source',denied?.code==='denied');
        remember(allowedFile(file,PLAY_EXTS));
        const result=await js("waveframe.vpSubAutoSync("+JSON.stringify(req)+")");
        check('real FFmpeg audio activity sync recovers 1.7s offset',result?.ok&&Math.abs(result.delay-1.7)<=.15&&result.scale===1,JSON.stringify(result));
        const silent=path.join(dir,'audio-sync-silence.wav');wav.fill(0,44);fs.writeFileSync(silent,wav);remember(allowedFile(silent,PLAY_EXTS));
        const silence=await js("waveframe.vpSubAutoSync("+JSON.stringify({path:silent,cues})+")");
        check('real FFmpeg silent audio gives no sync suggestion',silence?.ok===false,JSON.stringify(silence));
      }
      const codecReport = await inventory();
      check('Windows codec inventory returns bounded registry metadata', process.platform !== 'win32' || (codecReport.status==='ok' && Array.isArray(codecReport.packs) && Array.isArray(codecReport.filters) && Array.isArray(codecReport.transforms)), JSON.stringify({status:codecReport.status,arch:codecReport.arch,packs:codecReport.packs.length,filters:codecReport.filters.length,transforms:codecReport.transforms.length}));
      /* photo editor */
      const { nativeImage } = require('electron');
      const W = 64, H = 48, buf = Buffer.alloc(W * H * 4);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; buf[i] = 40 + x * 2; buf[i + 1] = 90; buf[i + 2] = 160 - y; buf[i + 3] = 255; } // BGRA
      const png = path.join(dir, 'photo.png'); fs.writeFileSync(png, nativeImage.createFromBitmap(buf, { width: W, height: H }).toPNG());
      const deniedPhoto=await js(`waveframe.photoRead(${JSON.stringify(png)}).then(r=>r===null)`);
      check('photo IPC denies unapproved image path',deniedPhoto);
      approveImage(png);
      await js("document.querySelector('.tab-btn[data-tab=\"photo\"]').click(); loadPhoto().then(() => 1)");
      await until("!!window.WaveframePhotoUi", 8000);
      await js(`WaveframePhotoUi.open(${JSON.stringify(png)}); 1`);
      const loaded = await until("document.getElementById('phCanvas').width === 64", 8000);
      const before = await js("(() => { const c = document.getElementById('phCanvas'); const d = c.getContext('2d').getImageData(10, 10, 1, 1).data; return [d[0], d[1], d[2]].join(','); })()");
      await js("(() => { const s = document.getElementById('ph_exposure'); s.value = '1'; s.dispatchEvent(new Event('input')); return 1; })()");
      await new Promise((r) => setTimeout(r, 300));
      const after = await js("(() => { const c = document.getElementById('phCanvas'); const d = c.getContext('2d').getImageData(10, 10, 1, 1).data; return [d[0], d[1], d[2]].join(','); })()");
      check('photo editor opens a PNG and the exposure slider changes the preview', loaded && before !== after && Number(after.split(',')[1]) > Number(before.split(',')[1]), before + ' -> ' + after);
      await js("(() => { document.getElementById('phRotR').click(); return 1; })()");
      await new Promise((r) => setTimeout(r, 200));
      check('photo editor rotates 90 degrees (64x48 -> 48x64)', await js("document.getElementById('phCanvas').width === 48 && document.getElementById('phCanvas').height === 64"));
      const workerOk=await js("(async()=>{const data=new Uint8ClampedArray([10,20,30,255,40,50,60,255]);const r=await WaveframePhotoUi.processExport({width:2,height:1,data},{rotate:90},0);return r.width===1&&r.height===2&&r.data[3]===255&&data.byteLength===0;})()");
      check('photo export worker transfers pixels and rotates',workerOk);
      await js("document.getElementById('phUndo').click();1");
      check('photo undo restores original orientation',await until("document.getElementById('phCanvas').width===64",3000));
      await js("document.getElementById('phRedo').click();1");
      check('photo redo restores rotation',await until("document.getElementById('phCanvas').width===48",3000));
    } catch (e) { check('media self-test threw', false, e && e.stack || e); }
    try {
      /* layout of the three new areas in all 20 languages, at 100 % and 150 % zoom: no overlapping controls, no clipped button text, no sideways scroll */
    try {
      const audit = `(async () => {
        const tabs = ['video', 'photo', 'settings'], bad = [];
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
        for (const l of LANGUAGES.map((x) => x.code)) {
          setLanguage(l);
          for (const z of [1, 1.5]) {
            window.waveframe.setZoomForTest && window.waveframe.setZoomForTest(z);
            document.documentElement.style.setProperty('zoom', String(z));
            for (const tab of tabs) {
              document.querySelector('.tab-btn[data-tab="' + tab + '"]').click();
              await new Promise((r) => setTimeout(r, 30));
              const root = document.getElementById('tab-' + tab);
              const els = [...root.querySelectorAll('button, select, input[type=range], input[type=color], label.vp-inline, .ph-slider')].filter((e) => vis(e) && !e.closest('.dep-hidden') && !e.closest('#mppResult'));
              for (const e of els) { if ((e.tagName === 'BUTTON' || e.tagName === 'LABEL') && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible') bad.push(l + '/' + z + '/' + tab + ': clipped ' + (e.id || e.textContent.slice(0, 20))); }
              const bars = [...root.querySelectorAll('.vp-bar')];
              for (const bar of bars) {
                const kids = [...bar.children].filter(vis);
                for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                  const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                  const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                  if (ox > 2 && oy > 2) bad.push(l + '/' + z + '/' + tab + ': overlap ' + (kids[i].id || kids[i].textContent.slice(0, 15)) + ' x ' + (kids[j].id || kids[j].textContent.slice(0, 15)));
                }
              }
              if (document.documentElement.scrollWidth > window.innerWidth + 4) bad.push(l + '/' + z + '/' + tab + ': page scrolls sideways');
            }
          }
        }
        document.documentElement.style.removeProperty('zoom'); setLanguage('el');
        document.querySelector('.tab-btn[data-tab="player"]').click();
        return JSON.stringify(bad.slice(0, 12));
      })()`;
      const bad = JSON.parse(await js(audit));
      check('video / photo / import areas: no overlapping or clipped controls (20 languages x 100 % / 150 %)', bad.length === 0, bad.join(' ; '));
    } catch (e) { check('media layout audit threw', false, e && e.stack || e); }
    } catch (e) { check('media self-test threw', false, e && e.stack || e); }
    finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* temp */ } }
    return out;
  }

  ipcMain.handle('vp:pick-m3u', async (e) => {
    if (!trusted(e)) return [];
    const r = await dialog.showOpenDialog(getMainWin(), { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Playlists', extensions: ['m3u', 'm3u8'] }] });
    if (r.canceled) return [];
    return r.filePaths.slice(0, 20).map(M3U.readM3uFile).filter(Boolean);
  });

  return { selfTest };
}

module.exports = { init, registerScheme, decodeText, siblingSubtitles, VIDEO_EXTS, AUDIO_EXTS, SUB_EXTS, IMG_EXTS };
