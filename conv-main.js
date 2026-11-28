'use strict';
// IPC glue for the audio converter. Only the main window may call these channels; every payload is validated here
// (options through convlib.validateOptions, files must exist and be regular files). The original files are only read.

const { ipcMain, dialog, shell, app } = require('electron');
const fs = require('fs');
const path = require('path');
const L = require('./renderer/convlib.js');
const E = require('./conv-engine.js');
const EV = require('./conv-video.js');
const V = require('./renderer/vidlib.js');
const { localPath, localDirectory, allowedFile } = require('./local-media-policy.js');
const MEDIA_TYPES = new Set([...E.AUDIO_EXTS, ...E.VIDEO_EXTS]);
const SUB_TYPES = new Set(['srt','ass','ssa','vtt','sub']);

const MAX_READ = 600 * 1024 * 1024; // the renderer decodes the whole file in memory

function init({ getMainWin, resolveFfmpegPath, installFfmpeg, confirmFfmpegDownload, defaultOutDir, defaultVideoOutDir, otherBusy=()=>false }) {
  const trusted = (e) => { const w = getMainWin(); return !closing && !!w && !w.isDestroyed() && e.sender === w.webContents && e.senderFrame === w.webContents.mainFrame; };
  const jobs = new Map(); // id -> { cancel }
  const cancelledEarly = new Set();
  const pending = new Set(); // cancel requests that arrived while the job was still being prepared
  let closing=false,quitAllowed=false;
  const progressGate=require('./resource-diagnostics').createProgressGate();
  let probeBusy=false,thumbBusy=false,onlineDownload=null,youtubePreview=null;
  const busy=()=>!!onlineDownload||!!youtubePreview||pending.size>0||E.activeRunCount()>0||EV.activeAuxCount()>0||probeBusy||thumbBusy||readBusy||decodeBusy||otherBusy();
  app.on('before-quit',event=>{
    if(quitAllowed)return;
    event.preventDefault();
    if(closing)return;
    closing=true;onlineDownload?.abort();youtubePreview?.abort();
    for(const id of pending)cancelledEarly.add(id);
    for(const job of jobs.values())try{job.cancel();}catch{}
    E.beginShutdown();EV.beginShutdown();
    // Bound the wait; normal cancellation must finish its cleanup before exit.
    const deadline=Date.now()+4000;
    const finish=()=>{if(busy()&&Date.now()<deadline){setTimeout(finish,50);return;}quitAllowed=true;app.quit();};
    setTimeout(finish,0);
  });
  const sendProgress = (payload) => { if(closing)return;if(payload.id&&(!pending.has(payload.id)||!progressGate.allow(payload.id,payload.pct)))return;const w = getMainWin(); if (w && !w.isDestroyed()) w.webContents.send('conv:progress', payload); };
  const okFile = p => !!localPath(p);
  const sourceGrants=new Set(),subtitleGrants=new Set(),directoryGrants=new Set(),outputGrants=new Set();
  const boundedAdd=(set,p,limit=4096)=>{if(set.size>=limit)set.delete(set.values().next().value);set.add(p);return p;};
  const approveSource=p=>{const f=allowedFile(p,MEDIA_TYPES);return f?boundedAdd(sourceGrants,f):null;};
  const approveSubtitle=p=>{const f=allowedFile(p,SUB_TYPES);return f?boundedAdd(subtitleGrants,f,128):null;};
  const inputFile=p=>{const f=allowedFile(p,MEDIA_TYPES);return f&&sourceGrants.has(f)?f:null;};
  let consentBusy=false,readBusy=false,decodeBusy=false;
  ipcMain.handle('conv:approve-drop',async(e,paths)=>{
    if(!trusted(e)||consentBusy||!Array.isArray(paths))return [];
    const files=[...new Set(paths.slice(0,200).map(p=>allowedFile(p,MEDIA_TYPES)).filter(Boolean))];
    if(!files.length)return [];
    consentBusy=true;
    try{
      const answer=await dialog.showMessageBox(getMainWin(),{type:'question',buttons:['Cancel / Ακύρωση','Allow / Επιτρέπεται'],defaultId:0,cancelId:0,message:'Allow the converter to read '+files.length+' selected media files?',detail:files.slice(0,10).join('\n')+(files.length>10?'\n…':'')});
      return !closing&&trusted(e)&&answer.response===1?files.map(approveSource).filter(Boolean):[];
    }finally{consentBusy=false;}
  });
  ipcMain.handle('conv:choose-folder',async(e)=>{
    if(!trusted(e))return {canceled:true};
    const r=await dialog.showOpenDialog(getMainWin(),{properties:['openDirectory','createDirectory']});
    const p=!r.canceled&&localDirectory(r.filePaths[0]);return p?{canceled:false,folderPath:boundedAdd(directoryGrants,p,64)}:{canceled:true};
  });
  async function approveOutput(req){
    if(req.outMode!=='custom')return true;
    const p=localDirectory(req.outDir);if(!p)return false;if(directoryGrants.has(p))return true;if(consentBusy)return false;
    consentBusy=true;try{const r=await dialog.showMessageBox(getMainWin(),{type:'question',buttons:['Cancel / Ακύρωση','Allow / Επιτρέπεται'],defaultId:0,cancelId:0,message:'Allow writing converted files in this folder?',detail:p});if(closing||r.response!==1||localDirectory(p)!==p)return false;boundedAdd(directoryGrants,p,64);return true;}finally{consentBusy=false;}
  }
  const okId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(id);
  const errorOf = (e) => ({ ok: false, code: e && e.code || 'failed', error: (e && e.message || String(e)).slice(0, 400) });

  ipcMain.handle('conv:pick', async (e) => {
    if (!trusted(e)) return [];
    const r = await dialog.showOpenDialog(getMainWin(), {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio / Video', extensions: [...E.AUDIO_EXTS, ...E.VIDEO_EXTS] }, { name: 'All files', extensions: ['*'] }],
    });
    return r.canceled ? [] : r.filePaths.slice(0,2000).map(approveSource).filter(Boolean);
  });

  ipcMain.handle('conv:status', async (e) => (trusted(e) ? { ffmpeg: !!(await resolveFfmpegPath()) } : null));

  // Offers the on-demand LGPL ffmpeg download (confirmation dialog with source/size/SHA-256 inside installFfmpeg's confirm callback).
  ipcMain.handle('conv:ensure-ffmpeg', async (e) => {
    if (!trusted(e)) return { ok: false };
    if (await resolveFfmpegPath()) return { ok: true };
    try {
      await installFfmpeg((p) => sendProgress({ phase: 'ffmpeg', pct: p.pct, step: p.phase }), (info) => confirmFfmpegDownload(getMainWin(), info));
      return { ok: !!(await resolveFfmpegPath()) };
    } catch (err) { return { ...errorOf(err), declined: err && err.code === 'cancelled' }; }
  });

  ipcMain.handle('conv:probe', async (e, p) => {
    if (!trusted(e) || !inputFile(p)||probeBusy) return null;
    probeBusy=true;try{const ff=await resolveFfmpegPath(),f=inputFile(p);return !closing&&ff&&f?await E.probe(ff,f):null;}catch{return null;}finally{probeBusy=false;}
  });

  ipcMain.handle('conv:read', async (e, p) => {
    if (!trusted(e) || !inputFile(p)||readBusy) return null;
    const f=inputFile(p);readBusy=true;
    try { const h = await fs.promises.open(f, 'r'); try { const st = await h.stat(); if (!st.isFile()||st.size > MAX_READ) return { tooLarge: true }; const b = Buffer.alloc(st.size); let n=0; while(n < b.length) { const r = await h.read(b,n,b.length-n,n); if (!r.bytesRead) return null; n+=r.bytesRead; } const after=await h.stat();if(after.size!==st.size||after.mtimeMs!==st.mtimeMs)return null;return { bytes: b }; } finally { await h.close(); } } catch (_) { return null; }finally{readBusy=false;}
  });

  ipcMain.handle('conv:predecode', async (e, p, sampleRate) => {
    if (!trusted(e) || !inputFile(p)||decodeBusy) return null;
    decodeBusy=true;try{
      const ff=await resolveFfmpegPath(),f=inputFile(p);if(closing||!ff||!f)return null;
      return { bytes: await E.predecodeToWav({ ffmpegPath: ff, input: f, sampleRate: Number.isFinite(sampleRate) && sampleRate >= 8000 && sampleRate <= 192000 ? sampleRate : 0 }) };
    } catch (_) { return null; }finally{decodeBusy=false;}
  });

  // 'default' = MusicWaveFrame (created on demand), 'custom' = a folder the user picked, 'source' = next to the original (undefined).
  function resolveOutDir(req, hasSource, def = defaultOutDir) {
    if(req.outMode==='custom'){const p=localDirectory(req.outDir);if(!p||!directoryGrants.has(p))throw Object.assign(Error('output folder not approved'),{code:'denied'});return p;}
    if (req.outMode === 'source' && hasSource) return undefined;
    return def();
  }

  ipcMain.handle('conv:default-dir', (e) => (trusted(e) ? defaultOutDir() : null));

  async function track(id, make) {
    if (closing || pending.has(id) || pending.size >= 4) return {ok:false, code:'busy'};
    pending.add(id);
    try {
      const ensureActive=()=>{if(closing||cancelledEarly.has(id))throw Object.assign(Error('cancelled'),{code:'cancelled'});};
      ensureActive();const job = await make(ensureActive);
      jobs.set(id, job);
      if (closing||cancelledEarly.has(id)) job.cancel();
      const r = await job.promise;
      const output=localPath(r.output);if(output)boundedAdd(outputGrants,output);
      return { ok: true, output: r.output, encoder: r.encoder, fellBackFrom: r.fellBackFrom,outputCount:r.outputCount,keyframeCut:r.keyframeCut===true };
    } catch (err) { return errorOf(err); } finally { jobs.delete(id); cancelledEarly.delete(id); pending.delete(id);progressGate.release(id); }
  }

  ipcMain.handle('conv:direct', async (e, req) => {
    if (!trusted(e) || !req || !okId(req.id) || !inputFile(req.path)) return { ok: false, code: 'bad-request' };
    const v = L.validateOptions(req.options);
    if (!v.ok) return { ok: false, code: 'bad-options', error: v.errors.join(',') };
    return track(req.id,async ensureActive=>{
      if(!await approveOutput(req))throw Object.assign(Error('output not approved'),{code:'denied'});ensureActive();
      const ff=await resolveFfmpegPath(),f=inputFile(req.path);if(!ff||!f)throw Object.assign(Error('source or ffmpeg unavailable'),{code:ff?'denied':'no-ffmpeg'});
      ensureActive();return E.convertDirect({ffmpegPath:ff,input:f,options:v.options,ensureActive,onProgress:p=>sendProgress({id:req.id,pct:p}),outDir:resolveOutDir(req,true)});
    });
  });

  ipcMain.handle('conv:encode', async (e, req) => {
    if (!trusted(e)) return {ok:false,code:'bad-request'};
    const hasSource = !!req && !!inputFile(req.path);
    if(req?.path&&!hasSource)return {ok:false,code:'denied'};
    const hasName = !!req && typeof req.name === 'string' && req.name.length > 0 && req.name.length < 200;
    if (!trusted(e) || !req || !okId(req.id) || !(hasSource || hasName) || !(req.wav instanceof Uint8Array || req.wav instanceof ArrayBuffer)) return { ok: false, code: 'bad-request' };
    if (req.wav.byteLength > MAX_READ) return {ok:false,code:'too-large'};
    const v = L.validateOptions(req.options);
    if (!v.ok) return { ok: false, code: 'bad-options', error: v.errors.join(',') };
    return track(req.id,async ensureActive=>{
    if(!await approveOutput(req))throw Object.assign(Error('output not approved'),{code:'denied'});ensureActive();
    const ff = v.options.format === 'wav' ? null : await resolveFfmpegPath();
    if (v.options.format !== 'wav' && !ff) throw Object.assign(Error('ffmpeg unavailable'),{code:'no-ffmpeg'});
    const wavBytes = req.wav instanceof ArrayBuffer ? new Uint8Array(req.wav) : req.wav;
    const outDir = resolveOutDir(req, hasSource);
    // tracks that come from the playlist have no file on disk: name them after the track inside the output folder
    const input = hasSource ? inputFile(req.path) : path.join(outDir, `${req.name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'track'}.src`);
    if(!input)throw Object.assign(Error('source unavailable'),{code:'denied'});
    ensureActive();return E.convertFromWav({ ffmpegPath: ff, input, wavBytes, options: v.options, duration: Number(req.duration) || 0, ensureActive,onProgress: (p) => sendProgress({ id: req.id, pct: p }), outDir });
    });
  });

  /* ---------- video (Opsis Media Suite, 2.1.0): same trust rules as the audio channels ---------- */
  const MEDIA_EXTS = new Set([...E.AUDIO_EXTS, ...E.VIDEO_EXTS].map((x) => '.' + x));
  const okMedia = (p) => !!inputFile(p) && MEDIA_EXTS.has(path.extname(p).toLowerCase());
  const KNOWN_ENCODERS = new Set(Object.values(V.CODECS).flatMap((c) => [...c.hw, ...c.sw]));

  ipcMain.handle('vid:default-dir', (e) => (trusted(e) ? defaultVideoOutDir() : null));

  ipcMain.handle('vid:youtube-preview',async(e,url,key)=>{
    if(!trusted(e)||youtubePreview||consentBusy)return {ok:false,code:'busy-or-denied'};
    const Y=require('./youtube-metadata');if(!Y.identify(url)||typeof key!=='string'||!/^[A-Za-z0-9_-]{20,128}$/.test(key))return {ok:false,code:'invalid-source-or-key'};
    const controller=new AbortController();youtubePreview=controller;
    try{
      const answer=await dialog.showMessageBox(getMainWin(),{type:'question',buttons:['Cancel / Ακύρωση','Preview / Προεπισκόπηση'],defaultId:0,cancelId:0,message:'Fetch YouTube metadata from Google?',detail:'The supplied API key and video or playlist ID will be sent to Google. No media is downloaded. Google privacy policy: https://policies.google.com/privacy'});
      if(!trusted(e)||controller.signal.aborted||answer.response!==1)return {ok:false,code:'cancelled'};
      return {ok:true,...await Y.preview(url,key,{signal:controller.signal})};
    }catch(err){return {ok:false,code:controller.signal.aborted?'cancelled':['api-denied','rate-limit'].includes(err.message)?err.message:'preview-failed'};}
    finally{youtubePreview=null;}
  });
  ipcMain.on('vid:youtube-cancel',e=>{if(trusted(e))youtubePreview?.abort();});
  ipcMain.handle('vid:spotify-preview',async(e,url,token)=>{
    if(!trusted(e)||youtubePreview||consentBusy)return {ok:false,code:'busy-or-denied'};
    const S=require('./spotify-metadata');if(!S.identify(url)||!S.validToken(token))return {ok:false,code:'invalid-source-or-token'};
    const controller=new AbortController();youtubePreview=controller;
    try{
      const answer=await dialog.showMessageBox(getMainWin(),{type:'question',buttons:['Cancel / Ακύρωση','Preview / Προεπισκόπηση'],defaultId:0,cancelId:0,message:'Fetch metadata from Spotify?',detail:'The supplied temporary access token and selected item ID will be sent only to Spotify. No audio is downloaded. https://www.spotify.com/legal/privacy-policy/'});
      if(!trusted(e)||controller.signal.aborted||answer.response!==1)return {ok:false,code:'cancelled'};
      return {ok:true,...await S.preview(url,token,{signal:controller.signal})};
    }catch(err){return {ok:false,code:controller.signal.aborted?'cancelled':['token-expired','access-denied','not-found','rate-limit'].includes(err.message)?err.message:'preview-failed'};}
    finally{youtubePreview=null;}
  });
  ipcMain.handle('vid:provider-preview',async(e,url)=>{
    if(!trusted(e)||youtubePreview||consentBusy)return {ok:false,code:'busy-or-denied'};
    const P=require('./provider-oembed'),source=P.identify(url);if(!source)return {ok:false,code:'unsupported-source'};
    const controller=new AbortController();youtubePreview=controller;
    try{
      const answer=await dialog.showMessageBox(getMainWin(),{type:'question',buttons:['Cancel / Ακύρωση','Preview / Προεπισκόπηση'],defaultId:0,cancelId:0,message:'Fetch public metadata from '+source.provider+'?',detail:source.link+'\nNo media is downloaded.'});
      if(!trusted(e)||controller.signal.aborted||answer.response!==1)return {ok:false,code:'cancelled'};
      return {ok:true,...await P.preview(url,{signal:controller.signal})};
    }catch(err){return {ok:false,code:controller.signal.aborted?'cancelled':['access-denied','not-found','rate-limit'].includes(err.message)?err.message:'preview-failed'};}
    finally{youtubePreview=null;}
  });
  ipcMain.handle('vid:spotify-open',async(e,url)=>{
    if(!trusted(e)||!require('./spotify-metadata').identify(url))return false;
    const source=require('./spotify-metadata').identify(url);await shell.openExternal('https://open.spotify.com/'+source.kind+'/'+source.id);return true;
  });
  ipcMain.handle('vid:online-download',async(e,url)=>{
    if(!trusted(e)||onlineDownload||consentBusy)return {ok:false,code:'busy-or-denied'};
    const D=require('./online-media-download');const candidate=D.candidate(url);
    if(!candidate)return {ok:false,code:'unsupported-url'};
    const controller=new AbortController();onlineDownload=controller;
    try{
      const answer=await dialog.showMessageBox(getMainWin(),{type:'question',buttons:['Cancel / Ακύρωση','Download / Λήψη'],defaultId:0,cancelId:0,message:'Download authorized media from '+candidate.host+'?',detail:'Up to 512 MiB. Saved as a new file in your selected folder. No redirects.'});
      if(!trusted(e)||controller.signal.aborted||answer.response!==1)return {ok:false,code:'cancelled'};
      const picked=await dialog.showOpenDialog(getMainWin(),{properties:['openDirectory','createDirectory']});
      const dir=!picked.canceled&&localDirectory(picked.filePaths[0]);if(!dir||!trusted(e)||controller.signal.aborted)return {ok:false,code:'cancelled'};
      const file=await D.download(url,dir,{signal:controller.signal,onProgress:progress=>{if(trusted(e)&&onlineDownload===controller&&!controller.signal.aborted)e.sender.send('vid:online-progress',progress);}});
      const approved=trusted(e)&&approveSource(file);return approved?{ok:true,path:approved}:{ok:false,code:'not-approved'};
    }catch(err){return {ok:false,code:controller.signal.aborted?'cancelled':'download-failed'};}
    finally{onlineDownload=null;}
  });
  ipcMain.on('vid:online-cancel',e=>{if(trusted(e))onlineDownload?.abort();});
  ipcMain.handle('vid:pick', async (e, kind) => {
    if (!trusted(e)) return [];
    const subs = kind === 'subtitle',oneMedia=kind==='media-one';
    const r = await dialog.showOpenDialog(getMainWin(), {
      properties: subs||oneMedia ? ['openFile'] : ['openFile', 'multiSelections'],
      filters: subs ? [{ name: 'Subtitles', extensions: ['srt', 'ass', 'ssa', 'vtt', 'sub'] }] : [{ name: 'Video', extensions: oneMedia?[...MEDIA_TYPES]:E.VIDEO_EXTS }, { name: 'All files', extensions: ['*'] }],
    });
    if (r.canceled) return [];
    return r.filePaths.slice(0,V.LIMITS.maxFiles).map(p=>subs?(V.validSubtitlePath(p)?approveSubtitle(p):null):approveSource(p)).filter(Boolean);
  });

  // What this ffmpeg can encode (only the encoder names Waveframe knows are reported) and which one is chosen for each codec.
  ipcMain.handle('vid:encoders', async (e) => {
    if (!trusted(e)) return { ffmpeg: false };
    const ff = await resolveFfmpegPath();
    if (closing||!ff) return { ffmpeg: false };
    const d = await EV.detectEncoders(ff);
    if(closing)return {ffmpeg:false};
    const known = new Set([...d.encoders].filter((x) => KNOWN_ENCODERS.has(x)));
    return { ffmpeg: true, hwaccels: d.hwaccels.slice(0, 30), encoders: [...known], summary: V.summarize(known) };
  });

  ipcMain.handle('vid:probe', async (e, p) => {
    if (!trusted(e) || !okMedia(p)||probeBusy) return null;
    probeBusy=true;try{const ff=await resolveFfmpegPath(),f=inputFile(p);return !closing&&ff&&f?await EV.probeVideo(ff,f):null;}catch{return null;}finally{probeBusy=false;}
  });
  ipcMain.handle('vid:thumb', async (e, p, at) => {
    if (!trusted(e) || !okMedia(p)||thumbBusy) return null;
    thumbBusy=true;try{const ff=await resolveFfmpegPath(),f=inputFile(p);return !closing&&ff&&f?await EV.thumbnail(ff,f,Number(at)||1):null;}catch{return null;}finally{thumbBusy=false;}
  });

  ipcMain.handle('vid:encode', async (e, req) => {
    if (!trusted(e) || !req || !okId(req.id) || !okMedia(req.path)) return { ok: false, code: 'bad-request' };
    const v = V.validateOptions(req.options);
    if (!v.ok) return { ok: false, code: 'bad-options', error: v.errors.join(',') };
    if (v.options.subtitleFile && !subtitleGrants.has(allowedFile(v.options.subtitleFile, SUB_TYPES))) return { ok: false, code: 'bad-options', error: 'subtitleFile' };
    return track(req.id,async ensureActive=>{
      if(!await approveOutput(req))throw Object.assign(Error('output not approved'),{code:'denied'});ensureActive();
      const ff=await resolveFfmpegPath(),f=inputFile(req.path);if(!ff||!f)throw Object.assign(Error('source or ffmpeg unavailable'),{code:ff?'denied':'no-ffmpeg'});
      const d=V.needsVideoEncoder(v.options)?await EV.detectEncoders(ff):{encoders:new Set()};
      const outDir=resolveOutDir(req,true,defaultVideoOutDir);
      if(v.options.subtitleFile){const sub=allowedFile(v.options.subtitleFile,SUB_TYPES);if(!sub||!subtitleGrants.has(sub))throw Object.assign(Error('subtitle not approved'),{code:'denied'});v.options.subtitleFile=sub;}
      ensureActive();return EV.encodeVideo({ffmpegPath:ff,input:f,options:v.options,available:d.encoders,outDir,ensureActive,onProgress:p=>sendProgress({id:req.id,pct:Math.max(0,Math.min(1,p))})});
    });
  });

  ipcMain.on('conv:cancel', (e, id) => {
    if (!trusted(e) || !okId(id)) return;
    if(pending.has(id))cancelledEarly.add(id);if (jobs.has(id)) jobs.get(id).cancel();
  });
  ipcMain.on('conv:reveal', (e, p) => { if(trusted(e)){const f=localPath(p);if(f&&outputGrants.has(f))shell.showItemInFolder(f);} });

  // WAVEFRAME_SELFTEST: runs the real renderer converter (lazy load, decode, Enhancer chain, BS.1770 gain, ffmpeg encode) on a generated tone.
  async function selfTest() {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = [];
    const check = (name, ok, extra) => out.push({ name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });
    const os = require('os');
    const audio = require('./renderer/audiolib.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-convself-'));
    try {
      const win = getMainWin();
      const ff = await resolveFfmpegPath();
      check('ffmpeg available for converter tests', !!ff, ff || 'none');
      const n = 44100 * 4, l = new Float32Array(n), r = new Float32Array(n);
      for (let i = 0; i < n; i++) { l[i] = 0.05 * Math.sin(2 * Math.PI * 440 * i / 44100); r[i] = 0.05 * Math.sin(2 * Math.PI * 660 * i / 44100); }
      const src = path.join(dir, 'tone.wav');
      fs.writeFileSync(src, Buffer.from(L.writeWav([l, r], 44100, 16)));
      check('converter denies an unapproved local file',await win.webContents.executeJavaScript(`waveframe.convRead(${JSON.stringify(src)}).then(r=>r===null)`));
      approveSource(src);
      const run = (opts) => win.webContents.executeJavaScript(`(async () => {
        await loadConverter();
        const v = WaveframeConv.validateOptions(${JSON.stringify(opts)});
        if (!v.ok) return { error: v.errors.join() };
        try { const r = await WaveframeConverter.convertFile({ id: 'self1', path: ${JSON.stringify(src)} }, v.options, { ffmpeg: ${!!ff}, outMode: 'source', cancelled: () => false, report() {}, setBase() {} }); return r; }
        catch (e) { return { error: String(e && e.message || e) }; }
      })()`);
      check('converter tab skeleton exists but is empty before first open', (await win.webContents.executeJavaScript("document.getElementById('tab-converter').children.length")) === 0);
      const abChecks=await win.webContents.executeJavaScript(`(async()=>{const out=[],check=(name,ok)=>out.push({name,ok:!!ok});const names=['C:/opsis-ci/a.mp4','C:/opsis-ci/b.mp4'];
    // Exercise converter's actual preparation controls without starting FFmpeg.
    await loadConverter();const videoUi=window.WaveframeVideoUi;
    videoUi.clearItems();
    try{
      check('A-B converter rejects invalid and remote ranges',!videoUi.prepareAB('https://example.invalid/a.mp4',{start:1,end:3})&&!videoUi.prepareAB(names[0],{start:3,end:1}));
      check('A-B prepares one local stream copy job',videoUi.prepareAB(names[0],{start:1.125,end:3.5}));
      const opts=videoUi.collect();
      check('A-B controls receive exact range and no job starts',opts.operation==='remux'&&opts.trimStart===1.125&&opts.trimEnd===3.5&&!videoUi.busy());
      check('A-B refuses to replace other queued file',!videoUi.prepareAB(names[1],{start:2,end:4})&&videoUi.collect().trimStart===1.125);
    }finally{videoUi.clearItems();}
return out;})()`);out.push(...abChecks);
      // 1. processed route: normalise -23.. -> -16 LUFS, FLAC
      const a = await run({ format: 'flac', depth: 16, normalize: true, targetLufs: -16, suffix: '-selftest' });
      check('processed route (normalise to -16 LUFS -> FLAC) runs', a && a.output && !a.error, a && (a.error || path.basename(a.output)));
      if (a && a.output && ff) {
        const pre = L.readWav(new Uint8Array(await E.predecodeToWav({ ffmpegPath: ff, input: a.output })).buffer);
        const lufs = audio.integratedLufs(pre.samples, pre.sampleRate);
        check('normalised output measures the LUFS target', Math.abs(lufs + 16) < 0.5, lufs.toFixed(2) + ' LUFS');
        const v = await E.verifyDecodes(ff, a.output);
        check('FLAC output decodes (44.1 kHz stereo, ~4 s)', v.ok && v.codec === 'flac' && v.sampleRate === 44100 && v.channels === 2 && Math.abs(v.decodedSeconds - 4) < 0.1, JSON.stringify(v));
      }
      // 2. processed route with the Enhancer chain, resample + mono + trim, pure-JS WAV writer (no ffmpeg involved for WAV output)
      const b = await run({ format: 'wav', depth: 24, effects: true, sampleRate: 22050, channels: 1, trimStart: 1, trimEnd: 3, suffix: '-selftest-fx' });
      check('processed route (effects, 22.05 kHz mono, trim 1-3 s -> WAV 24-bit) runs', b && b.output && !b.error, b && (b.error || path.basename(b.output)));
      if (b && b.output) {
        const w = L.readWav(fs.readFileSync(b.output).buffer.slice(0));
        check('WAV output has the requested format', w.sampleRate === 22050 && w.channels === 1 && w.bits === 24 && Math.abs(w.frames / w.sampleRate - 2) < 0.05, JSON.stringify({ r: w.sampleRate, c: w.channels, b: w.bits, s: w.frames / w.sampleRate }));
      }
      // Actual Electron renderer -> trusted IPC -> C++ child -> converter WAV.
      const available=await win.webContents.executeJavaScript('waveframe.nativeDspAvailable()');
      if(available){
        const native=await win.webContents.executeJavaScript(`(async()=>{
          await loadConverter();
          const buffer=new AudioBuffer({length:48000*2,numberOfChannels:1,sampleRate:48000});
          const input=buffer.getChannelData(0);
          for(let i=0;i<input.length;i++)input[i]=.025*Math.sin(2*Math.PI*1000*i/48000);
          const cfg=WaveframeAudio.nativeDspConfigV2({masterEnabled:true,eqBands:[0,0,0,0,0,6]});
          const options={...WaveframeConv.DEFAULTS,effects:true,nativeDsp:true,nativeDspConfig:cfg,sampleRate:48000,trimStart:.25,trimEnd:1.75,channels:2};
          const r=await WaveframeConverter.processBuffer(buffer,options);
          let a=0,b=0,delta=0;
          for(let i=24000;i<r.channels[0].length;i++){a+=input[i+12000]**2;b+=r.channels[0][i]**2;delta=Math.max(delta,Math.abs(r.channels[0][i]-r.channels[1][i]));}
          const bypass=await WaveframeConverter.processBuffer(buffer,{...options,nativeDspConfig:{...cfg,base:{...cfg.base,enabled:0}},sampleRate:44100});
          return {boost:10*Math.log10(b/a),frames:r.channels[0].length,delta,resampled:bypass.channels[0].length,original:input[12001]};
        })()`);
        check('native DSP Electron IPC: one 6 dB EQ pass, trim, mono duplication and resample',native.frames===72000&&Math.abs(native.boost-6)<.2&&native.delta<1e-6&&native.resampled===66150&&Math.abs(native.original-.025*Math.sin(2*Math.PI*1000*12001/48000))<1e-6,JSON.stringify(native));
        const opts={format:'wav',depth:24,effects:true,sampleRate:48000,channels:2,trimStart:1,trimEnd:3,suffix:'-native-selftest'};
        const result=await win.webContents.executeJavaScript(`(async()=>{
          const o=WaveframeConv.validateOptions(${JSON.stringify(opts)}).options;
          o.nativeDsp=true;o.nativeDspConfig=WaveframeAudio.nativeDspConfigV2({masterEnabled:true});
          return WaveframeConverter.convertFile({id:'selfnative',path:${JSON.stringify(src)}},o,{ffmpeg:${!!ff},outMode:'source',cancelled:()=>false,report(){},setBase(){}});
        })()`);
        const bytes=fs.readFileSync(result.output),w=L.readWav(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
        check('native DSP converter saves real trimmed stereo 48 kHz WAV',w.sampleRate===48000&&w.channels===2&&w.bits===24&&w.frames===96000);
      }else if(process.env.GITHUB_ACTIONS==='true'&&!app.isPackaged){
        check('CI native DSP renderer adapter available',false,'missing developer adapter');
      }
      // 3. direct route
      if (ff) {
        const d = await run({ format: 'mp3', bitrate: 128, suffix: '-selftest-direct' });
        check('direct route (ffmpeg -> MP3) runs', d && d.output && !d.error, d && (d.error || path.basename(d.output)));
      }
      // Real muted looping audio and a real conversion on the independent path.
      // No persistent user playlist changes; CI uses an isolated profile.
      if(ff){
        const mixed=await win.webContents.executeJavaScript(`(async()=>{
          const slot=engine.slots[engine.activeSlot],oldMute=slot.el.muted,oldLoop=slot.el.loop;
          const rate=22050,samples=new Float32Array(rate*30);
          for(let i=0;i<samples.length;i++)samples[i]=.02*Math.sin(2*Math.PI*440*i/rate);
          const url=URL.createObjectURL(new Blob([WaveframeConv.writeWav([samples],rate,16)],{type:'audio/wav'}));
          const wait=ms=>new Promise(r=>setTimeout(r,ms));
          try{
            engine.pauseActive();slot.el.src=url;slot.el.muted=true;slot.el.loop=true;await engine.play();
            const until=performance.now()+4000;while(slot.el.currentTime<.05&&performance.now()<until)await wait(50);
            const before=slot.el.currentTime;
            const o=WaveframeConv.validateOptions({format:'mp3',bitrate:128,suffix:'-mixed-test'}).options;
            const conversion=WaveframeConverter.convertFile({id:'mixed-self',path:${JSON.stringify(src)}},o,{ffmpeg:true,outMode:'source',cancelled:()=>false,report(){},setBase(){}});
            showTab('converter');await wait(100);showTab('settings');const result=await conversion;
            const after=slot.el.currentTime;
            return {output:result.output,advanced:after>before,playing:!slot.el.paused};
          }finally{engine.pauseActive();slot.el.removeAttribute('src');slot.el.load();slot.el.muted=oldMute;slot.el.loop=oldLoop;URL.revokeObjectURL(url);}
        })()`);
        check('real audio advances during independent conversion and tab changes',mixed.playing&&mixed.advanced&&!!mixed.output,JSON.stringify(mixed));
        if(mixed.output){const decoded=await E.verifyDecodes(ff,mixed.output);check('concurrent conversion output decodes',decoded.ok);}
      }
      check('original is untouched', fs.statSync(src).size === 44 + n * 4);
      // layout: no two controls of the Export / Convert tab overlap, in every language, at 100 % and 150 %, with files listed and while converting
      const AUDIT = `(() => {
        const pane = document.getElementById('tab-converter');
        const els = [...pane.querySelectorAll('button, select, input, .dest-path, .conv-drop, .conv-name, .conv-state, .vid-chip, .vid-meta, .vid-thumb')].filter((e) => e.offsetParent && !e.closest('.dep-hidden'));
        const R = els.map((e) => ({ e, r: e.getBoundingClientRect() })).filter((o) => o.r.width > 0 && o.r.height > 0);
        const out = [];
        for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
          if (R[i].e.contains(R[j].e) || R[j].e.contains(R[i].e)) continue;
          const a = R[i].r, b = R[j].r;
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 2 && h > 2) out.push((R[i].e.id || R[i].e.className || R[i].e.tagName) + ' x ' + (R[j].e.id || R[j].e.className || R[j].e.tagName));
        }
        return out.slice(0, 5);
      })()`;
      await win.webContents.executeJavaScript("document.querySelector('.tab-btn[data-tab=\"converter\"]').click()");
      const langs = await win.webContents.executeJavaScript('Object.keys(I18N)');
      const bad = [];
      for (const zoom of [1, 1.5]) {
        win.webContents.setZoomFactor(zoom);
        for (const l of langs) {
          await win.webContents.executeJavaScript(`(async () => { setLanguage(${JSON.stringify(l)}); await loadConverter(); WaveframeConverter.clearFiles(); WaveframeConverter.addPaths(['C:\\\\Music\\\\a-very-long-file-name-for-the-layout-test-number-one.mp3', 'C:\\\\Music\\\\b.flac']); WaveframeVideoUi.clearItems(); WaveframeVideoUi.addPaths(['C:\\\\Videos\\\\an-extremely-long-video-file-name-for-the-layout-test-number-one.mp4', 'C:\\\\Videos\\\\b.mkv']); WaveframeVideoUi.showRunning(${l.charCodeAt(0) % 2 === 0}); WaveframeConverter.showRunning(${l.charCodeAt(0) % 2 === 0}); })()`);
          await wait(120);
          const o = await win.webContents.executeJavaScript(AUDIT);
          if (o.length) bad.push(`${l} x${zoom}: ${o.join(', ')}`);
        }
      }
      win.webContents.setZoomFactor(1);
      await win.webContents.executeJavaScript("setLanguage('el'); WaveframeConverter.clearFiles(); WaveframeConverter.showRunning(false)");
      check('Export / Convert layout: no overlapping controls (20 languages x 100 % / 150 %)', bad.length === 0, bad.slice(0, 3).join(' | '));
      // regression: Cancel buttons must be hidden while nothing runs (CSS specificity once kept #convCancel visible), the file-row button sits on the first line
      const idle = await win.webContents.executeJavaScript("(async () => { await loadConverter(); WaveframeConverter.clearFiles(); WaveframeVideoUi.clearItems(); WaveframeConverter.showRunning(false); WaveframeVideoUi.showRunning(false); const vis = (id) => !!document.getElementById(id).offsetParent; return { audioCancel: vis('convCancel'), videoCancel: vis('vidCancel'), start: vis('convStart') && vis('vidStart') }; })()");
      check('Cancel buttons are hidden while idle, Convert buttons visible', !idle.audioCancel && !idle.videoCancel && idle.start, JSON.stringify(idle));
      const rowOk = await win.webContents.executeJavaScript("(() => { WaveframeConverter.addPaths(['C:\\\\Music\\\\a.mp3']); WaveframeVideoUi.addPaths(['C:\\\\Videos\\\\a.mp4']); const r = (sel) => { const row = document.querySelector(sel); const b = row.querySelector('.small-btn'); const n = row.querySelector('.conv-name'); return b.getBoundingClientRect().top < n.getBoundingClientRect().bottom + 2; }; const ok = r('#convList .conv-row') && r('#vidList .conv-row'); WaveframeConverter.clearFiles(); WaveframeVideoUi.clearItems(); return ok; })()");
      check('file rows: the Remove button is on the same line as the name', rowOk === true);
      // the video card: present, accessible, knows this ffmpeg's encoders, and a real encode through the IPC path works
      const vidUi = await win.webContents.executeJavaScript(`(async () => {
        await loadConverter();
        const panel = document.getElementById('vidPanel');
        const enc = await window.waveframe.vidEncoders();
        return { panel: !!panel, presets: document.querySelectorAll('#vidPresets button').length, group: document.getElementById('vidPresets').getAttribute('role'), bar: document.getElementById('vidTrack').getAttribute('role'),
          labelled: [...panel.querySelectorAll('select, input[type=text], input[type=number]')].every((c) => c.id && document.querySelector('label[for="' + c.id + '"]')), ffmpeg: enc.ffmpeg, h264: enc.ffmpeg ? enc.summary.h264.best : null };
      })()`);
      check('video card is built lazily with 8 presets, ARIA group/progressbar and labelled controls', vidUi.panel && vidUi.presets === 8 && vidUi.group === 'group' && vidUi.bar === 'progressbar' && vidUi.labelled, JSON.stringify(vidUi));
      check('encoder detection reports a best H.264 encoder', !ff || !!vidUi.h264, vidUi.h264 || 'no ffmpeg');
      if (ff) {
        const vsrc = path.join(dir, 'clip.mp4');
        await new Promise((res) => require('child_process').execFile(ff, ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'mpeg4', '-c:a', 'aac', vsrc], res));
        approveSource(vsrc);
        const vr = await win.webContents.executeJavaScript(`(async () => { const v = WaveframeVideo.validateOptions({ preset: 'webSmall', suffix: '-selftest' }); return await window.waveframe.vidEncode({ id: 'selfvid', path: ${JSON.stringify(vsrc)}, options: v.options, outMode: 'source' }); })()`);
        check('real video encode through IPC (preset "small web")', vr && vr.ok && vr.output, vr && (vr.error || vr.output));
        if (vr && vr.ok) {
          const dec = await E.verifyDecodes(ff, vr.output);
          const info = await require('./conv-video.js').probeVideo(ff, vr.output);
          check('encoded video decodes (h264, ~2 s, 320x180)', dec.ok && info.video && info.video.codec === 'h264' && info.video.height === 180 && Math.abs(dec.decodedSeconds - 2) < 0.3, JSON.stringify(info.video) + ' ' + dec.decodedSeconds);
        }
        // Use the real queue and verify that changing language does not destroy
        // its controls or allow another start during async preparation.
        const queue=await win.webContents.executeJavaScript(`(async()=>{
          const lang=document.documentElement.lang;
          WaveframeVideoUi.clearItems();WaveframeVideoUi.addPaths([${JSON.stringify(vsrc)}]);WaveframeVideoUi.applyPreset('webSmall');
          document.getElementById('vidOut').value='source';document.getElementById('vidOut').dispatchEvent(new Event('change'));
          document.getElementById('vidSuffix').value='-queue-selftest';
          const panel=document.getElementById('vidPanel'),start=document.getElementById('vidStart');
          start.click();start.dispatchEvent(new Event('click'));const locked=WaveframeVideoUi.busy()&&start.disabled;
          setLanguage(lang==='el'?'en':'el');const retained=panel===document.getElementById('vidPanel');
          const end=performance.now()+60000;while(WaveframeVideoUi.busy()&&performance.now()<end)await new Promise(r=>setTimeout(r,100));
          const done=!WaveframeVideoUi.busy();setLanguage(lang);return {locked,retained,done,panels:document.querySelectorAll('#vidPanel').length};
        })()`);
        check('video queue rejects duplicate start and survives language change',queue.locked&&queue.retained&&queue.done&&queue.panels===1,JSON.stringify(queue));
        const queueOutput=path.join(dir,'clip-queue-selftest.mp4');
        check('video queue produced a decodable output',fs.existsSync(queueOutput)&& (await E.verifyDecodes(ff,queueOutput)).ok);
        // the IPC refuses unvalidated input
        const bad = await win.webContents.executeJavaScript(`window.waveframe.vidEncode({ id: 'x1', path: 'relative.mp4', options: {}, outMode: 'source' })`);
        const bad2 = await win.webContents.executeJavaScript(`window.waveframe.vidEncode({ id: 'x2', path: ${JSON.stringify(vsrc)}, options: { subtitle: 'burn', subtitleFile: "C:\\\\a'b.srt" }, outMode: 'source' })`);
        check('video IPC rejects a relative path and an injected subtitle path', bad.ok === false && bad2.ok === false && bad2.code === 'bad-options', JSON.stringify([bad.code, bad2.code]));
      }
    } catch (e) { check('converter self-test threw', false, e && e.stack || e); }
    finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* temp */ } }
    return out;
  }

  return { selfTest };
}

module.exports = { init };
