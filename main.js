const { app, BrowserWindow, ipcMain, dialog, globalShortcut, nativeImage, Notification, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execFile, spawn } = require('child_process');
const { localPath } = require('./local-media-policy.js');
// The archive library is loaded only during a user-authorized FFmpeg install.
const suite = require('./suite-main.js');
const suiteLib = require('./suite.js');
const converter = require('./conv-main.js');
const media = require('./media-main.js');
media.registerScheme(); // the read-only wfmedia: protocol of the video player must be declared before the app is ready

// Isolated profile for tests/self-test (never touches the real settings).
if (process.env.WAVEFRAME_USER_DATA) app.setPath('userData', process.env.WAVEFRAME_USER_DATA);

const FALLBACK_DIR = () => path.join(app.getPath('userData'), 'bin');
const FALLBACK_FFMPEG = () => path.join(FALLBACK_DIR(), 'ffmpeg.exe');
// LGPL build (not GPL): Waveframe only needs audio codecs (mp3/vorbis/opus/aac/wma/flac),
// none of which require GPL-only components — this avoids GPL source-distribution
// obligations entirely. See CLAUDE.md rule 11.
const FFMPEG_RELEASE_API = 'https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/tags/latest';
const FFMPEG_ASSET_NAME = 'ffmpeg-master-latest-win64-lgpl.zip';

const WINDOW_WIDTH = 1180;
const WINDOW_HEIGHT = 760;

const FORMATS = {
  wav: { ext: 'wav', name: 'WAV', filters: [{ name: 'WAV Audio', extensions: ['wav'] }] },
  mp3: { ext: 'mp3', codec: 'libmp3lame', name: 'MP3', filters: [{ name: 'MP3 Audio', extensions: ['mp3'] }] },
  flac: { ext: 'flac', codec: 'flac', lossless: true, name: 'FLAC', filters: [{ name: 'FLAC Audio', extensions: ['flac'] }] },
  ogg: { ext: 'ogg', codec: 'libvorbis', name: 'OGG Vorbis', filters: [{ name: 'OGG Audio', extensions: ['ogg'] }] },
  m4a: { ext: 'm4a', codec: 'aac', name: 'AAC (M4A)', filters: [{ name: 'AAC Audio', extensions: ['m4a'] }] },
  opus: { ext: 'opus', codec: 'libopus', name: 'Opus', filters: [{ name: 'Opus Audio', extensions: ['opus'] }] },
  wma: { ext: 'wma', codec: 'wmav2', name: 'WMA', filters: [{ name: 'WMA Audio', extensions: ['wma'] }] },
};

function testFfmpeg(ffmpegPath) {
  return new Promise((resolve) => {
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) return resolve(false);
    execFile(ffmpegPath, ['-version'], { timeout: 5000, windowsHide: true, maxBuffer: 256 * 1024, cwd: path.dirname(ffmpegPath) }, (error, stdout) => resolve(!error && /^ffmpeg version /i.test(stdout)));
  });
}

// Search only explicit absolute PATH entries, never implicit working-directory
// lookup. Return the exact executable validated, not a bare command name.
async function resolveFfmpegPath() {
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  for (const raw of String(process.env.PATH || '').split(path.delimiter).slice(0,256)) {
    const dir = raw.trim().replace(/^"|"$/g,'');
    if (!path.isAbsolute(dir)) continue;
    const candidate = localPath(path.join(dir,name));
    if (candidate && await testFfmpeg(candidate)) return candidate;
  }
  const fallback = localPath(FALLBACK_FFMPEG());
  return fallback && await testFfmpeg(fallback) ? fallback : null;
}

// Source, size and SHA-256 of the LGPL ffmpeg build, straight from the GitHub release (asset digest, or the release's checksums.sha256).
async function getFfmpegAsset() {
  const r = await suiteLib.httpGet(FFMPEG_RELEASE_API, { timeout: 8000, maxBytes: 4 * 1024 * 1024, hostOpts: { hosts: suiteLib.API_HOSTS } });
  const rel = JSON.parse(r.body.toString('utf8'));
  const assets = Array.isArray(rel.assets) ? rel.assets : [];
  const asset = assets.find((a) => a && a.name === FFMPEG_ASSET_NAME);
  if (!asset || !suiteLib.isAllowedUrl(asset.browser_download_url, suiteLib.DOWNLOAD_OPTS) || !new URL(asset.browser_download_url).pathname.startsWith('/BtbN/FFmpeg-Builds/')) throw new Error('ffmpeg asset not found');
  let sha = suiteLib.digestSha256(asset);
  if (!sha) {
    const sums = assets.find((a) => a && a.name === 'checksums.sha256');
    if (sums && suiteLib.isAllowedUrl(sums.browser_download_url, suiteLib.DOWNLOAD_OPTS)) {
      const t = (await suiteLib.httpGet(sums.browser_download_url, { timeout: 8000, maxBytes: 256 * 1024 })).body.toString('utf8');
      sha = suiteLib.parseChecksumText(t, FFMPEG_ASSET_NAME);
    }
  }
  if (!sha) throw new Error('no checksum published');
  return { url: asset.browser_download_url, size: Number(asset.size) || 0, sha256: sha, name: asset.name };
}

// confirm(info) -> Promise<boolean> shows the source/size/SHA-256 to the user first; nothing is downloaded without a yes.
async function installFfmpeg(onProgress, confirm) {
  const info = await getFfmpegAsset();
  if (confirm && !(await confirm(info))) { const e = new Error('cancelled'); e.code = 'cancelled'; throw e; }
  const dir = FALLBACK_DIR();
  fs.mkdirSync(dir, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'waveframe-ffmpeg-'));
  const zipPath = path.join(scratch,'download.zip');
  try {

  onProgress({ phase: 'download', pct: 0 });
  try {
    await suiteLib.downloadVerified(info.url, zipPath, { expectedSha256: info.sha256, expectedSize: info.size, maxBytes: 400 * 1024 * 1024, onProgress: (pct) => onProgress({ phase: 'download', pct }) });
  } catch (e) {
    if (e.code === 'sha-mismatch' || e.code === 'size-mismatch') throw new Error('Το αρχείο που κατέβηκε δεν ταιριάζει με το δημοσιευμένο SHA-256 και διαγράφηκε.');
    throw e;
  }

  onProgress({ phase: 'extract', pct: 0 });
  const zip = new (require('adm-zip'))(zipPath);
  const entry = zip.getEntries().find((e) => /(^|\/)bin\/ffmpeg\.exe$/i.test(e.entryName));
  if (!entry || entry.header.size > 256 * 1024 * 1024) throw new Error('Invalid FFmpeg archive entry');
  const tempExe = path.join(dir, 'ffmpeg-' + require('node:crypto').randomBytes(8).toString('hex') + '.exe');
  try { fs.writeFileSync(tempExe, entry.getData(), { flag: 'wx' });
    if (!(await testFfmpeg(tempExe))) throw new Error('Invalid FFmpeg executable');
    fs.renameSync(tempExe, FALLBACK_FFMPEG());
  } finally { try { fs.unlinkSync(tempExe); } catch (_) {} }
  onProgress({ phase: 'done', pct: 1 });

  const ok = await testFfmpeg(FALLBACK_FFMPEG());
  if (!ok) throw new Error('Η εγκατάσταση ολοκληρώθηκε αλλά το ffmpeg δεν εκτελείται σωστά.');
  return FALLBACK_FFMPEG();
  } finally { try { fs.rmSync(scratch, {recursive:true,force:true}); } catch (_) {} }
}

async function confirmFfmpegDownload(win, info) {
  const tx = (k, v) => suiteApi.tx(k, v);
  const r = await dialog.showMessageBox(win, {
    type: 'question', title: 'Opsis Media Suite', message: tx('ff.title'),
    detail: tx('ff.detail', { name: info.name, mb: (info.size / 1048576).toFixed(0), sha: info.sha256.slice(0, 16) }),
    buttons: [tx('ff.go'), tx('ff.no')], defaultId: 0, cancelId: 1, noLink: true,
  });
  return r.response === 0;
}

let helpWindow = null;
// 2.2.0 rename: the installer removes the old "Waveframe" autostart entry (it pointed to the old exe) and leaves this flag;
// the new exe registers itself again, once, so a user who had autostart on keeps it.
function reapplyAutostartAfterRename() {
  try {
    const flag = path.join(app.getPath('userData'), 'reenable-autostart.flag');
    if (!fs.existsSync(flag)) return;
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
    fs.unlinkSync(flag);
  } catch { /* best effort */ }
}
let helpLang = 'el'; // the app language, forwarded to the Help window for its changelog
let currentTheme = 'midnight';

function createHelpWindow(parent) {
  if (helpWindow && !helpWindow.isDestroyed()) { helpWindow.focus(); return; }
  helpWindow = new BrowserWindow({
    width: 720, height: 620, minWidth: 560, minHeight: 420,
    parent,
    title: 'Opsis Media Suite — Βοήθεια',
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#0b0b14',
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  helpWindow.setMenuBarVisibility(false);
  helpWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  helpWindow.webContents.on('will-navigate', e => e.preventDefault());
  helpWindow.loadFile(path.join(__dirname, 'renderer', 'help.html'), { search: `theme=${encodeURIComponent(currentTheme)}&lang=${encodeURIComponent(helpLang)}` });
  helpWindow.on('closed', () => { helpWindow = null; });
}

const WINDOW_STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json');
let lastWindowState=null;
function loadWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(WINDOW_STATE_FILE(), 'utf-8'));
    const onScreen = screen.getAllDisplays().some((d) => {
      const b = d.bounds;
      return state.x >= b.x - 50 && state.y >= b.y - 50 && state.x < b.x + b.width && state.y < b.y + b.height;
    });
    if(onScreen)lastWindowState=JSON.stringify(state);
    return onScreen ? state : null;
  } catch { return null; }
}
function saveWindowState(win) {
  if (win.isDestroyed() || win.isMinimized() || win.isMaximized()) return;
  try {
    const next=JSON.stringify(win.getBounds());
    if(next===lastWindowState)return;
    fs.writeFileSync(WINDOW_STATE_FILE(),next);lastWindowState=next;
  } catch { /* best-effort */ }
}

const AUDIO_FILE_EXTENSIONS = require('./music-library').MUSIC_EXTENSIONS;
const VIDEO_FILE_EXTENSIONS = ['.mp4', '.m4v', '.mkv', '.webm', '.mov', '.avi', '.wmv', '.mpg', '.mpeg', '.ts', '.ogv'];
function extractAudioFileArg(argv) {
  return argv.find((a) => AUDIO_FILE_EXTENSIONS.includes(path.extname(a).toLowerCase()) && fs.existsSync(a)) || null;
}
function extractVideoFileArg(argv) {
  return argv.find((a) => VIDEO_FILE_EXTENSIONS.includes(path.extname(a).toLowerCase()) && fs.existsSync(a)) || null;
}
function forwardOpenFile(argv) {
  const filePath = extractAudioFileArg(argv);
  if (filePath && mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('open-file', filePath);
    return;
  }
  const video = extractVideoFileArg(argv);
  if (video && mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('open-video', video);
}

function updateJumpList() {
  if (process.platform !== 'win32') return;
  app.setJumpList([
    {
      type: 'tasks',
      items: [
        { type: 'task', title: 'Play / Pause', program: process.execPath, args: '--jumplist-action=playpause', iconPath: process.execPath, iconIndex: 0 },
        { type: 'task', title: 'Επόμενο', program: process.execPath, args: '--jumplist-action=next', iconPath: process.execPath, iconIndex: 0 },
        { type: 'task', title: 'Προηγούμενο', program: process.execPath, args: '--jumplist-action=prev', iconPath: process.execPath, iconIndex: 0 },
      ],
    },
  ]);
}

let mainWin = null;
let suiteApi = null;
let converterApi = null;
let mediaApi = null;

function createWindow() {
  const savedState = loadWindowState();
  const win = new BrowserWindow({
    width: savedState?.width || WINDOW_WIDTH,
    height: savedState?.height || WINDOW_HEIGHT,
    x: savedState?.x,
    y: savedState?.y,
    resizable: true,
    maximizable: true,
    fullscreenable: false,
    minWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    frame: false,
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#0b0b14',
    title: 'Opsis Media Suite',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWin = win;
  // Hardening + stability: the app only ever shows its own local pages.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  // Only the microphone input (getUserMedia) is a legitimate permission here; everything else is denied.
  win.webContents.session.setPermissionRequestHandler((wc, permission, cb, details) => cb(wc === win.webContents && permission === 'media' && details.isMainFrame === true && Array.isArray(details.mediaTypes) && details.mediaTypes.length === 1 && details.mediaTypes[0] === 'audio'));
  // A crashed/killed renderer (GPU driver reset, out of memory on low-RAM PCs) used to leave a blank window until restart.
  win.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit' || win.isDestroyed()) return;
    try { win.reload(); } catch (_) { /* window is closing */ }
  });
  win.on('unresponsive', () => { /* keep the window: the audio engine may just be busy decoding a large file */ });
  // Explicit developer opt-in only. Never load the generated page in a packaged app.
  const experimentalDsp=!app.isPackaged&&process.env.OPSIS_EXPERIMENTAL_DSP==='1'
    &&!!localPath(path.join(__dirname,'renderer','index-dsp-dev.html'))
    &&!!localPath(path.join(__dirname,'renderer','dsp-dev','opsis-dsp.wasm'));
  win.loadFile(path.join(__dirname,'renderer',experimentalDsp?'index-dsp-dev.html':'index.html'));
  if(experimentalDsp&&process.env.OPSIS_WORKLET_PLAYER_TEST==='1'){
    win.webContents.once('did-finish-load',async()=>{
      try{
        const result=await win.webContents.executeJavaScript('window.__workletPlayerTest()');
        console.log('PASS experimental Player '+JSON.stringify(result));app.exit(0);
      }catch(e){console.error('FAIL experimental Player '+e);app.exit(1);}
    });
  }
  if (process.env.WAVEFRAME_SELFTEST === '1') {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        let code = 1;
        try {
          const profile=process.env.OPSIS_RESOURCE_PROFILE==='1';
          const sample=async phase=>{if(!profile)return;const {summarizeMetrics,aggregateSamples}=require('./resource-diagnostics.js');const rows=[];app.getAppMetrics();for(let i=0;i<5;i++){await new Promise(r=>setTimeout(r,1000));rows.push(summarizeMetrics(app.getAppMetrics()));}console.log('RESOURCE_PROFILE '+JSON.stringify({phase,...aggregateSamples(rows),scope:'Electron processes only; summed working sets may double-count shared pages'}));};
          await sample('startup-idle');
          const results = await win.webContents.executeJavaScript('window.__selfTest()');
          results.push(...await suiteApi.selfTest());
          results.push(...await converterApi.selfTest());
          results.push(...await mediaApi.selfTest());
          const flyoutCheck=(name,ok)=>results.push({name,ok:!!ok});
          flyoutCheck('local flyout is not created at startup',!flyout?.window());
          await win.webContents.executeJavaScript("waveframe.openFlyout()");
          const fw=flyout?.window();
          flyoutCheck('explicit local flyout opens isolated renderer',!!fw&&!fw.isDestroyed()&&fw.isVisible());
          if(fw&&!fw.isDestroyed()){
            flyoutCheck('flyout only exposes restricted playback bridge',await fw.webContents.executeJavaScript("!!window.mediaFlyout&&!window.waveframe&&!window.require"));
            flyoutCheck('flyout rejects owner invoking restricted command',await win.webContents.executeJavaScript("typeof waveframe.flyoutCommand==='undefined'"));
            await fw.webContents.executeJavaScript("document.getElementById('dismiss').click();true").catch(()=>false);
            for(let i=0;i<20&&flyout?.window();i++)await new Promise(r=>setTimeout(r,25));
            flyoutCheck('closing flyout destroys its renderer',!flyout?.window());
          }
          await sample('post-selftest');
          if(profile&&process.env.OPSIS_RESOURCE_SOAK==='1'){
            const cycles=Math.max(20,Math.min(1200,Number.parseInt(process.env.OPSIS_SOAK_CYCLES,10)||20));
            const {summarizeMetrics,privateBytesKiB,resourceTrend}=require('./resource-diagnostics.js');
            const history=[];const capture=()=>{try{const metrics=app.getAppMetrics(),summary=summarizeMetrics(metrics);if(history.length<300)history.push({elapsedMs:Date.now()-started,workingSetKiB:summary.workingSetKiB,privateBytesKiB:privateBytesKiB(metrics),processCount:summary.rows.length});}catch{}};
            const started=Date.now();capture();
            const ticker=setInterval(capture,15000);
            try{results.push(...await win.webContents.executeJavaScript('window.__resourceSoak('+cycles+')'));}
            finally{clearInterval(ticker);capture();console.log('RESOURCE_TREND '+JSON.stringify({elapsedMs:Date.now()-started,samples:history.length,workingSetKiB:resourceTrend(history,'workingSetKiB'),privateBytesKiB:resourceTrend(history,'privateBytesKiB'),processCount:resourceTrend(history,'processCount'),scope:'Electron only; diagnostic, not leak certification'}));}
            await sample('post-soak');
          }
          for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.extra ? ' — ' + r.extra : ''}`);
          code = results.every((r) => r.ok) ? 0 : 1;
        } catch (e) { console.log('FAIL self-test could not run: ' + e); }
        app.exit(code);
      }, 1500);
    });
  }
  win.on('closed', () => { if (mainWin === win) mainWin = null; });
  updateJumpList();

  let isMiniMode = false;
  let saveStateTimeout = null;
  const scheduleSaveState = () => {
    if (isMiniMode) return;
    clearTimeout(saveStateTimeout);
    saveStateTimeout = setTimeout(() => saveWindowState(win), 500);
  };
  win.on('resize', scheduleSaveState);
  win.on('move', scheduleSaveState);
  win.on('close', () => { clearTimeout(saveStateTimeout); if (!isMiniMode) saveWindowState(win); });

  const bindMediaKey = (accelerator, action) => {
    globalShortcut.register(accelerator, () => {
      if (!win.isDestroyed()) win.webContents.send('media-key', action);
    });
  };
  bindMediaKey('MediaPlayPause', 'playpause');
  bindMediaKey('MediaNextTrack', 'next');
  bindMediaKey('MediaPreviousTrack', 'prev');
  bindMediaKey('MediaStop', 'stop');
  win.on('closed', () => globalShortcut.unregisterAll());

  let thumbbarIcons = null;
  let isPlaying = false;
  function updateThumbbar() {
    if (!thumbbarIcons || win.isDestroyed()) return;
    win.setThumbarButtons([
      { icon: thumbbarIcons.prev, tooltip: 'Προηγούμενο', click: () => win.webContents.send('media-key', 'prev') },
      {
        icon: isPlaying ? thumbbarIcons.pause : thumbbarIcons.play,
        tooltip: isPlaying ? 'Παύση' : 'Αναπαραγωγή',
        click: () => win.webContents.send('media-key', 'playpause'),
      },
      { icon: thumbbarIcons.next, tooltip: 'Επόμενο', click: () => win.webContents.send('media-key', 'next') },
    ]);
  }

  // IPC hardening: every channel is answered only to the main window (or, for the two read-only constants, the Help window)
  // and every argument is type-checked and size-limited here - the renderer is not trusted.
  const fromMain = (e) => e.sender === win.webContents && e.senderFrame === win.webContents.mainFrame;
  ipcMain.handle('audio:worklet-dev',async e=>{
    if(!fromMain(e)||!experimentalDsp)return null;
    const file=localPath(path.join(__dirname,'renderer','dsp-dev','opsis-dsp.wasm'));
    if(!file)return null;
    try{
      const handle=await fs.promises.open(file,'r');
      try{
        const stat=await handle.stat();
        if(stat.size<8||stat.size>4*1024*1024)return null;
        const bytes=Buffer.alloc(stat.size);
        let offset=0;while(offset<bytes.length){const q=await handle.read(bytes,offset,bytes.length-offset,offset);if(!q.bytesRead)return null;offset+=q.bytesRead;}
        if((await handle.stat()).size!==stat.size||bytes.readUInt32LE(0)!==0x6d736100||!fromMain(e))return null;
        return new Uint8Array(bytes);
      }finally{await handle.close();}
    }catch{return null;}
  });
  const fromApp = (e) => fromMain(e) || (!!helpWindow && !helpWindow.isDestroyed() && e.sender === helpWindow.webContents && e.senderFrame === helpWindow.webContents.mainFrame);
  // Read-only detection of installed FxSound; never launch it or change system audio settings.
  let fxStatusCache=null,fxStatusAt=0,fxStatusPending=null;
  function fxSoundStatus() {
    if(process.platform!=='win32')return Promise.resolve({installed:null,running:null});
    if(fxStatusCache&&Date.now()-fxStatusAt<30000)return Promise.resolve(fxStatusCache);
    if(fxStatusPending)return fxStatusPending;
    const ps=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const script="$ErrorActionPreference='Stop'; $p=@('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); $installed=[bool](Get-ItemProperty $p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '^FxSound(?:\\s|$)' } | Select-Object -First 1); $running=[bool](Get-Process -Name FxSound -ErrorAction SilentlyContinue | Select-Object -First 1); @{installed=$installed;running=$running} | ConvertTo-Json -Compress";
    fxStatusPending=new Promise(resolve=>execFile(ps,['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:5000,maxBuffer:4096},(err,out)=>{
      let result={installed:null,running:null};
      if(!err)try{const r=JSON.parse(out);result={installed:typeof r.installed==='boolean'?r.installed:null,running:typeof r.running==='boolean'?r.running:null};}catch{}
      fxStatusCache=result;fxStatusAt=Date.now();resolve(result);
    })).finally(()=>{fxStatusPending=null;});
    return fxStatusPending;
  }
  ipcMain.handle('fxsound:detect',async(e)=>fromMain(e)?(await fxSoundStatus()).installed:null);
  ipcMain.handle('fxsound:status',async(e)=>fromMain(e)?fxSoundStatus():null);
  const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]{1,200000}$/;

  ipcMain.on('thumbbar:icons', (event, icons) => {
    if (!fromMain(event) || !icons || !['prev', 'play', 'pause', 'next'].every((k) => typeof icons[k] === 'string' && PNG_DATA_URL.test(icons[k]))) return;
    thumbbarIcons = {
      prev: nativeImage.createFromDataURL(icons.prev),
      play: nativeImage.createFromDataURL(icons.play),
      pause: nativeImage.createFromDataURL(icons.pause),
      next: nativeImage.createFromDataURL(icons.next),
    };
    updateThumbbar();
  });

  // Local flyout is lazy, shares the existing media-key route, and has no
  // desktop watcher. Restore opt-in using the previous branch's setting key.
  let flyout=null,flyoutAuto=false,flyoutTitle='',flyoutLang='el';
  let flyoutState={title:'',playing:false,owner:'audio'};
  let flyoutLabels={audio:'Music',video:'Video',empty:'No track loaded',prev:'Previous',next:'Next',play:'Play',pause:'Pause',stop:'Stop',close:'Close'};
  function openFlyout(manual){
    if(!flyout)flyout=require('./flyout-main').attachFlyout(win,()=>({...flyoutState,theme:currentTheme,lang:flyoutLang,labels:flyoutLabels}));
    return flyout.open(manual);
  }
  ipcMain.handle('flyout:open',event=>fromMain(event)?openFlyout(true):false);
  ipcMain.on('flyout:settings',(event,data)=>{
    if(!fromMain(event)||!data||typeof data.automatic!=='boolean'||typeof data.lang!=='string'||!/^[a-z]{2}$/.test(data.lang))return;
    if(!data.labels||!Object.keys(flyoutLabels).every(k=>typeof data.labels[k]==='string'&&data.labels[k].length<=120))return;
    flyoutAuto=data.automatic;flyoutLang=data.lang;flyoutLabels=Object.fromEntries(Object.keys(flyoutLabels).map(k=>[k,data.labels[k]]));
    if(!flyoutAuto)flyout?.closeAutomatic();
    flyout?.send();
  });
  let lastNotifiedTitle = null;
  let trackNotificationsEnabled = true;
  ipcMain.on('settings:track-notifications', (event, enabled) => { if (fromMain(event) && typeof enabled === 'boolean') trackNotificationsEnabled = enabled; });

  let lastCrashText='',lastCrashAt=0,crashWindowStart=0,crashWindowCount=0;
  ipcMain.on('crash:log', (event, details) => {
    if (!fromMain(event) || typeof details !== 'string') return;
    try {
      const logPath = path.join(app.getPath('userData'), 'crash.log');
      const now=Date.now(),message=details.slice(0,4000);
      if(now-crashWindowStart>=60000){crashWindowStart=now;crashWindowCount=0;}
      if(crashWindowCount>=12||(message===lastCrashText&&now-lastCrashAt<10000))return;
      crashWindowCount++;lastCrashText=message;lastCrashAt=now;
      require('./resource-diagnostics').appendBoundedLog(logPath,`[${new Date(now).toISOString()}] ${message}\n`);
    } catch { /* best-effort — never let logging itself crash the app */ }
  });
  ipcMain.handle('crash:get-log-path', (e) => (fromMain(e) ? path.join(app.getPath('userData'), 'crash.log') : null));

  ipcMain.handle('autostart:get', (e) => (fromMain(e) ? app.getLoginItemSettings().openAtLogin : false));
  ipcMain.on('autostart:set', (event, enabled) => {
    if (!fromMain(event) || typeof enabled !== 'boolean') return;
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
  });
  ipcMain.on('now-playing:update', (event, payload) => {
    if (!fromMain(event) || !payload || typeof payload !== 'object') return;
    const playing = payload.playing === true;
    const title = typeof payload.title === 'string' ? payload.title.slice(0, 300) : '';
    const owner=payload.owner==='video'?'video':'audio';
    flyoutState={title,playing,owner};
    const identity=title?owner+':'+title:'';
    if(flyoutAuto&&playing&&identity&&identity!==flyoutTitle)void openFlyout(false);
    if(playing||!title)flyoutTitle=identity;
    flyout?.send();
    isPlaying = playing;
    win.setTitle(title ? `${title} — Opsis Media Suite` : 'Opsis Media Suite');
    updateThumbbar();
    if (playing && title && title !== lastNotifiedTitle && trackNotificationsEnabled && Notification.isSupported()) {
      lastNotifiedTitle = title;
      new Notification({ title: 'Opsis Media Suite', body: title, silent: true }).show();
    }
    if (!title) lastNotifiedTitle = null;
  });

  ipcMain.on('theme:changed', (event, theme) => {
    if (!fromMain(event) || typeof theme !== 'string' || !/^[a-z0-9-]{1,30}$/.test(theme)) return;
    currentTheme = theme;
    flyout?.send();
    if (helpWindow && !helpWindow.isDestroyed()) {
      helpWindow.webContents.send('theme:sync', theme);
    }
  });

  ipcMain.on('window:minimize', (e) => { if (fromMain(e)) win.minimize(); });
  ipcMain.on('window:maximize-toggle', (e) => {
    if (!fromMain(e)) return;
    if (win.isMaximized()) win.unmaximize(); else win.maximize();
  });

  let normalBounds = null;
  ipcMain.on('window:mini-mode', (event, enable) => {
    if (!fromMain(event) || typeof enable !== 'boolean') return;
    isMiniMode = enable;
    if (enable) {
      normalBounds = win.getBounds();
      win.setAlwaysOnTop(true);
      win.setResizable(false);
      win.setMinimumSize(340, 130); // the normal 1180x760 floor would otherwise keep the window from shrinking
      win.setSize(340, 130);
    } else {
      win.setAlwaysOnTop(false);
      win.setResizable(true);
      win.setMinimumSize(WINDOW_WIDTH, WINDOW_HEIGHT);
      if (normalBounds) win.setBounds(normalBounds);
      else win.setSize(WINDOW_WIDTH, WINDOW_HEIGHT);
      normalBounds = null;
    }
  });
  win.on('maximize', () => win.webContents.send('window:maximized-state', true));
  win.on('unmaximize', () => win.webContents.send('window:maximized-state', false));
  ipcMain.on('window:close', (e) => { if (fromMain(e)) win.close(); });
  ipcMain.on('app:version-sync', (event) => { event.returnValue = fromApp(event) ? app.getVersion() : ''; });
  ipcMain.on('paths:music-sync', (event) => { event.returnValue = fromApp(event) ? app.getPath('music') : ''; });
  ipcMain.on('help:open', (e) => { if (fromMain(e)) createHelpWindow(win); });

  ipcMain.handle('deps:check', async (e) => {
    if (!fromMain(e)) return { ffmpeg: { ok: false, path: null } };
    const ffmpegPath = await resolveFfmpegPath();
    return { ffmpeg: { ok: !!ffmpegPath, path: ffmpegPath } };
  });

  ipcMain.handle('deps:install', async (e) => {
    if (!fromMain(e)) return { ok: false, error: 'denied' };
    try {
      const installedPath = await installFfmpeg((progress) => {
        win.webContents.send('deps:progress', progress);
      }, (info) => confirmFfmpegDownload(win, info));
      return { ok: true, path: installedPath };
    } catch (err) {
      return { ok: false, error: err.message, cancelled: err.code === 'cancelled' };
    }
  });

  let metadataBusy=false, metadataCancelled=false;
  win.once('closed',()=>{metadataCancelled=true;});
  ipcMain.handle('metadata:cancel',e=>{if(!fromMain(e)||!metadataBusy)return false;metadataCancelled=true;return true;});
  ipcMain.handle('metadata:complete',async(event,mode,values)=>{
    if(!fromMain(event)||metadataBusy||!['auto','manual','online','fingerprint','cover'].includes(mode))return {error:'busy or denied'};
    metadataBusy=true;metadataCancelled=false;
    try{
      const tags=require('./music-tags');
      const formats=mode==='fingerprint'?['mp3','flac']:['mp3','flac','wav','m4a','ogg','opus'];
      const picked=await dialog.showOpenDialog(win,{title:'Select '+formats.join(' / ').toUpperCase()+' files',properties:mode==='auto'?['openFile','multiSelections']:['openFile'],filters:[{name:formats.join(' / ').toUpperCase(),extensions:formats}]});
      if(picked.canceled||metadataCancelled||win.isDestroyed())return {cancelled:true};
      if(picked.filePaths.length>50)return {error:'Maximum 50 files per batch'};
      if(mode==='cover'){
        const file=picked.filePaths[0];
        const image=await dialog.showOpenDialog(win,{title:'Select local cover (JPEG / PNG)',properties:['openFile'],filters:[{name:'JPEG / PNG',extensions:['jpg','jpeg','png']}]});
        if(image.canceled||metadataCancelled||win.isDestroyed())return {cancelled:true};
        const cover=await tags.readLocalCover(image.filePaths[0]);
        if(!cover||nativeImage.createFromBuffer(cover.data).isEmpty())return {error:'Invalid JPEG / PNG cover (maximum 4096 px)'};
        const confirm=await dialog.showMessageBox(win,{type:'question',message:'Add missing cover only? / Προσθήκη μόνο αν λείπει εξώφυλλο;',detail:path.basename(file)+' — '+cover.width+' × '+cover.height+' px. Original backup retained; existing artwork is never replaced.',buttons:['Cancel / Ακύρωση','Add cover / Προσθήκη'],defaultId:0,cancelId:0});
        if(confirm.response!==1||metadataCancelled||win.isDestroyed())return {cancelled:true};
        return {rows:[{file,...await tags.complete(file,{}, {cover,cancelled:()=>metadataCancelled||win.isDestroyed()})}]};
      }
      if(mode==='online'||mode==='fingerprint'){
        const file=picked.filePaths[0], stat=await fs.promises.lstat(file);
        if(!stat.isFile()||stat.size>512*1024*1024||/^(\\\\|\/\/)/.test(file))return {error:'Unsupported local file'};
        const real=await fs.promises.realpath(file);
        if(path.resolve(file).toLowerCase()!==real.toLowerCase()||stat.nlink!==1)return {error:'Redirected or linked file'};
        const mm=await import('music-metadata');const m=await mm.parseFile(file,{duration:mode==='fingerprint',skipCovers:true});
        const lookup=require('./music-lookup');let choices;
        if(mode==='fingerprint'){
          const key=process.env.OPSIS_ACOUSTID_APP_KEY;
          if(!key)return {error:'AcoustID application key is not configured. Fingerprint identification is unavailable in this build.'};
          const ffmpeg=await resolveFfmpegPath();
          if(!ffmpeg)return {error:'FFmpeg is not installed'};
          if(!Number.isFinite(m.format.duration))return {error:'Audio duration unavailable'};
          const consent=await dialog.showMessageBox(win,{type:'question',message:'Send acoustic fingerprint and duration to AcoustID?',detail:'The fingerprint is derived locally from up to 120 seconds. No audio file, file name or path is uploaded.',buttons:['Cancel / Ακύρωση','Identify / Αναγνώριση'],defaultId:0,cancelId:0});
          if(consent.response!==1||metadataCancelled||win.isDestroyed())return {cancelled:true};
          const fp=await lookup.fingerprint(ffmpeg,file);
          if(metadataCancelled||win.isDestroyed())return {cancelled:true};
          choices=await lookup.acousticSearch(fp,m.format.duration,key);
        }else{
          const guessed=tags.infer(file), displayed=tags.readTrackText(m),artist=displayed.artist||guessed.artist,title=displayed.title||guessed.title;
          if(!artist||!title)return {error:'Artist and title needed / Απαιτούνται καλλιτέχνης και τίτλος'};
          const consent=await dialog.showMessageBox(win,{type:'question',buttons:['Cancel / Ακύρωση','Search MusicBrainz'],defaultId:0,cancelId:0,message:'Send artist and title to MusicBrainz?',detail:artist+' — '+title+'\nNo file, path or audio is uploaded.'});
          if(consent.response!==1||metadataCancelled||win.isDestroyed())return {cancelled:true};
          choices=await lookup.search({artist,title});
        }
        if(metadataCancelled||win.isDestroyed())return {cancelled:true};
        if(!choices.length)return {error:'No matches / Χωρίς αποτελέσματα'};
        // Native dialog buttons are intentionally limited to five candidates per page.
        let selected=null;
        for(let i=0;i<choices.length;i+=5){
          const page=choices.slice(i,i+5),more=i+5<choices.length;
          const labels=page.map((r,j)=>(i+j+1)+'. '+r.title+' — '+r.artist+' | '+(r.album||'—')+' '+r.year);
          const answer=await dialog.showMessageBox(win,{type:'question',message:'Choose exact recording and album / Επιλέξτε έκδοση',detail:'Search scores are not proof of identity. Existing tags will not be overwritten.',buttons:['Cancel / Ακύρωση',...labels,...(more?['More / Περισσότερα']:[])],defaultId:0,cancelId:0,noLink:true});
          if(answer.response===0||metadataCancelled||win.isDestroyed())return {cancelled:true};
          if(answer.response<=page.length){selected=page[answer.response-1];break;}
        }
        if(!selected)return {cancelled:true};
        const ok=await dialog.showMessageBox(win,{type:'question',message:'Fill only missing tags?',detail:[selected.title,selected.artist,selected.album,selected.year].filter(Boolean).join(' — '),buttons:['Cancel / Ακύρωση','Save tags / Αποθήκευση','View cover online / Εξώφυλλο'],defaultId:0,cancelId:0});
        if(ok.response===2){const link=lookup.coverURL(selected.releaseId);if(link)await require('electron').shell.openExternal(link);return {cancelled:true};}
        if(ok.response!==1||metadataCancelled||win.isDestroyed())return {cancelled:true};
        return {rows:[{file,...await tags.complete(file,selected,{cancelled:()=>metadataCancelled||win.isDestroyed()})}]};
      }
      const planned=picked.filePaths.map(file=>({file,values:mode==='auto'?tags.clean(tags.infer(file)):tags.clean(values)}));
      const usable=planned.filter(row=>Object.keys(row.values).length);
      if(!usable.length)return {error:'No usable tag values / Δεν βρέθηκαν στοιχεία'};
      const preview=usable.slice(0,12).map(row=>path.basename(row.file)+': '+Object.entries(row.values).map(([k,v])=>k+'='+v).join(', ')).join('\n');
      const confirm=await dialog.showMessageBox(win,{type:'question',buttons:['Cancel / Ακύρωση','Complete tags / Συμπλήρωση'],defaultId:0,cancelId:0,message:'Fill missing tags in supported audio layouts only? / Συμπλήρωση μόνο κενών tags;',detail:'Original backups are retained beside the files. Existing tags are not replaced. Close players using these files.\n'+preview+(usable.length>12?'\n… '+(usable.length-12)+' more':'')});
      if(confirm.response!==1)return {cancelled:true};
      const rows=[];
      for(const row of planned){
        const {file,values}=row;
        if(metadataCancelled||win.isDestroyed()){rows.push({file,status:'cancelled'});continue;}
        if(!Object.keys(values).length)rows.push({file,status:'skipped'});
        else try{rows.push({file,...await tags.complete(file,values,{cancelled:()=>metadataCancelled||win.isDestroyed()})});}
        catch(err){rows.push({file,status:err.code==='cancelled'?'cancelled':'failed',error:String(err.message).slice(0,250)});}
        if(!win.isDestroyed())win.webContents.send('metadata:progress',{done:rows.length,total:planned.length});
      }
      return {rows};
    }catch(err){return {error:String(err.message).slice(0,250)};}
    finally{metadataBusy=false;}
  });
  let musicFolderJob=null;
  ipcMain.handle('music:import-folder',async e=>{
    if(win.isDestroyed()||!fromMain(e)||musicFolderJob)return {error:'busy or denied'};
    const job=musicFolderJob={cancelled:false};
    const cancelled=()=>job.cancelled||win.isDestroyed();
    try{
      const picked=await dialog.showOpenDialog(win,{title:'Import music folder / Εισαγωγή φακέλου μουσικής',properties:['openDirectory']});
      if(picked.canceled||cancelled()||!fromMain(e))return {cancelled:true};
      const result=await require('./music-library').scanFolder(picked.filePaths[0],{cancelled});
      return cancelled()||!fromMain(e)?{cancelled:true}:result;
    }catch{return cancelled()?{cancelled:true}:{error:'Music folder could not be read'};}
    finally{if(musicFolderJob===job)musicFolderJob=null;}
  });
  ipcMain.handle('music:cancel-folder',e=>{
    if(win.isDestroyed()||!fromMain(e)||!musicFolderJob)return false;
    musicFolderJob.cancelled=true;return true;
  });
  let metadataReadBusy=false;
  ipcMain.handle('metadata:read', async (event, filePath) => {
    if(metadataReadBusy)return null;
    metadataReadBusy=true;
    try {
      // Read the canonical path validated by local-media-policy, not the
      // caller's spelling. Recheck after the asynchronous module import.
      if (!fromMain(event) || typeof filePath !== 'string' || !path.isAbsolute(filePath) || !AUDIO_FILE_EXTENSIONS.includes(path.extname(filePath).toLowerCase())) return null;
      const file=localPath(filePath);
      if(!file||!AUDIO_FILE_EXTENSIONS.includes(path.extname(file).toLowerCase())||fs.statSync(file).size>512*1024*1024)return null;
      const mm = await import('music-metadata');
      if(!fromMain(event)||localPath(file)!==file||fs.statSync(file).size>512*1024*1024)return null;
      const meta = await mm.parseFile(file, { duration: false, skipCovers: false });
      const { common } = meta;
      const displayed=require('./music-tags').readTrackText(meta);
      let picture = null;
      if (common.picture && common.picture[0]) {
        const pic = common.picture[0];
        if(['image/jpeg','image/png','image/webp'].includes(pic.format)&&pic.data?.length<=2*1024*1024){
          // Bound retained album art per track. Preserve originals on disk.
          const bytes=Buffer.from(pic.data);
          const header=require('./renderer/photolib').headerSize(bytes);
          // Reject oversized/unknown image headers before native decode.
          // An invalid cover must not suppress readable text metadata.
          const safe=header&&Number.isSafeInteger(header.width)&&Number.isSafeInteger(header.height)&&header.width>0&&header.height>0&&header.width<=8192&&header.height<=8192&&header.width*header.height<=16000000;
          const img=safe?nativeImage.createFromBuffer(bytes):null;
          const size=img?.getSize();
          if(img&&!img.isEmpty()&&size.width>0&&size.height>0&&size.width<=8192&&size.height<=8192&&size.width*size.height<=16000000){
            const factor=Math.min(1,384/Math.max(size.width,size.height));
            const thumb=factor<1?img.resize({width:Math.max(1,Math.round(size.width*factor)),height:Math.max(1,Math.round(size.height*factor)),quality:'good'}):img;
            const jpeg=thumb.toJPEG(82);if(jpeg.length<=256*1024)picture='data:image/jpeg;base64,'+jpeg.toString('base64');
          }
        }
      }
      return {
        title: displayed.title,
        artist: displayed.artist,
        album: displayed.album,
        genre: Array.isArray(common.genre)?common.genre.filter(v=>typeof v==='string').slice(0,8).map(v=>v.slice(0,200)).join(' / ').slice(0,512):null,
        picture,
      };
    } catch {
      return null;
    }finally{metadataReadBusy=false;}
  });

  ipcMain.handle('settings:export', async (event, data) => {
    if (!fromMain(event) || !data || typeof data !== 'object' || Array.isArray(data) || Buffer.byteLength(JSON.stringify(data)) > 8 * 1024 * 1024) return { canceled: false, ok: false, error: 'invalid data' };
    const clean = require('./renderer/backup').sanitize(data);
    if (!clean) return { canceled: false, ok: false, error: 'invalid data' };
    const result = await dialog.showSaveDialog(win, {
      defaultPath: 'opsis-media-suite-backup.json',
      filters: [{ name: 'Opsis Media Suite Backup', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      if(!fromMain(event))return {canceled:true};
      const parent=require('./local-media-policy').localDirectory(path.dirname(result.filePath));
      const leaf=path.basename(result.filePath);
      if(!parent||!leaf||/[\\/:*?"<>|\x00-\x1f\x7f]/.test(leaf)||path.extname(leaf).toLowerCase()!=='.json')throw Error('invalid backup path');
      const output=path.join(parent,leaf);
      require('./atomic-write').atomicWrite(output,JSON.stringify(clean,null,2));
      return { canceled: false, ok: true, path: result.filePath };
    } catch (err) {
      return { canceled: false, ok: false, error: err.message };
    }
  });

  ipcMain.handle('settings:import', async (event) => {
    if (!fromMain(event)) return { canceled: true };
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Opsis Media Suite Backup', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    try {
      if(!fromMain(event))return {canceled:true};
      const file=localPath(result.filePaths[0]);if(!file||path.extname(file).toLowerCase()!=='.json')throw Error('invalid backup path');
      const limit=8*1024*1024,fd=fs.openSync(file,'r');
      let raw;
      try{if(fs.fstatSync(fd).size>limit)throw Error('file too large');
        const b=Buffer.alloc(limit+1);let n=0,k;while(n<b.length&&(k=fs.readSync(fd,b,n,b.length-n,null))>0)n+=k;
        if(n>limit)throw Error('file too large');raw=new TextDecoder('utf-8',{fatal:true}).decode(b.subarray(0,n));
      }finally{fs.closeSync(fd);}
      const data=require('./renderer/backup').sanitize(JSON.parse(raw));if(!data)throw Error('invalid backup data');
      return { canceled: false, ok: true, data };
    } catch (err) {
      return { canceled: false, ok: false, error: err.message };
    }
  });

  ipcMain.handle('dialog:choose-folder', async (event) => {
    if (!fromMain(event)) return { canceled: true };
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || !filePaths[0]) return { canceled: true };
    return { canceled: false, folderPath: filePaths[0] };
  });
}

function forwardJumpListAction(argv) {
  const arg = argv.find((a) => a.startsWith('--jumplist-action='));
  if (arg && mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('media-key', arg.split('=')[1]);
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
      forwardJumpListAction(argv);
      forwardOpenFile(argv);
    }
  });

  app.whenReady().then(() => {
    reapplyAutostartAfterRename();
    suiteApi = suite.init({
      onLang: (l) => { helpLang = l; },
      getMainWin: () => mainWin,
      getTheme: () => currentTheme,
      isMini: () => !!mainWin && !mainWin.isDestroyed() && mainWin.getBounds().width < 700,
      isTrusted: (wc) => (!!mainWin && !mainWin.isDestroyed() && wc === mainWin.webContents) || (!!helpWindow && !helpWindow.isDestroyed() && wc === helpWindow.webContents),
    });
    converterApi = converter.init({
      getMainWin: () => mainWin, resolveFfmpegPath, installFfmpeg, confirmFfmpegDownload,
      otherBusy:()=>mediaApi?.shutdownBusy()===true,
      // default place for every encode: Windows Music folder > Opsis Media Suite (created automatically; the old Music\WaveFrame folder of earlier versions is left as it is)
      defaultVideoOutDir: () => { const d = path.join(app.getPath('videos'), 'Opsis Media Suite'); fs.mkdirSync(d, { recursive: true }); return d; },
      defaultOutDir: () => { const d = path.join(app.getPath('music'), 'Opsis Media Suite'); fs.mkdirSync(d, { recursive: true }); return d; },
    });
    mediaApi = media.init({ getMainWin: () => mainWin, resolveFfmpegPath });
    createWindow();
    forwardJumpListAction(process.argv);
    mainWin.webContents.once('did-finish-load', () => forwardOpenFile(process.argv));
    if (process.env.WAVEFRAME_SELFTEST !== '1' && process.env.WAVEFRAME_NO_SPLASH !== '1') mainWin.webContents.once('did-finish-load', () => suiteApi.onMainLoaded());

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
