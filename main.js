const { registerUiScheme, handleUiRequests, loadUiPage } = require('./renderer-protocol.js');
const { atomicWrite } = require('./atomic-write.js');
const { makeTrust } = require('./ipc-trust.js');
const { app, BrowserWindow, ipcMain, dialog, protocol, globalShortcut, nativeImage, Notification, screen, Menu, Tray } = require('electron');
const path = require('path');
const { AUDIO_EXTS, VIDEO_EXTS } = require('./media-types.js');
const { safeLocalPath } = require('./local-path.js');
const { readTrackText } = require('./audio-tags');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execFile, spawn } = require('child_process');
const AdmZip = require('adm-zip');
const suite = require('./suite-main.js');
const suiteLib = require('./suite.js');
const converter = require('./conv-main.js');
const { removeStaleOutput } = require('./conv-engine.js');
const media = require('./media-main.js');
const { attachFlyout } = require('./flyout-main.js');
const { detectEncoders, invalidateEncoders } = require('./conv-video.js');
const { systemFfmpegCandidates } = require('./ffmpeg-path.js');
registerUiScheme(protocol);
media.registerScheme(); // the read-only wfmedia: protocol of the video player must be declared before the app is ready

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.on('will-frame-navigate', (event) => event.preventDefault());
});


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
    if (!path.isAbsolute(ffmpegPath) || !fs.statSync(ffmpegPath, { throwIfNoEntry: false })?.isFile()) return resolve(false);
    execFile(ffmpegPath, ['-version'], { windowsHide: true, timeout: 5000 }, (error) => resolve(!error));
  });
}

// Prefer an ffmpeg the user already has on their system PATH (e.g. from a
// codec pack or a standalone install) over anything Waveframe itself bundles
// or downloads — that way Waveframe never has to *distribute* the binary for
// that user at all. See CLAUDE.md rule 11. Waveframe does not bundle any
// ffmpeg binary itself; if none is found, the Settings > dependencies panel
// offers to download the LGPL build on demand.
const requiredAudioEncoders = ['libmp3lame', 'libopus', 'libvorbis', 'wmav2', 'flac', 'aac'];
let preferManagedFfmpeg = false;
let ffmpegLookup;
let ffmpegCheckedAt = 0;

async function hasRequiredEncoders(executable) {
  const { audioEncoders } = await detectEncoders(executable);
  return requiredAudioEncoders.every((codec) => audioEncoders.has(codec));
}

function resolveFfmpegPath() {
  if (ffmpegLookup && Date.now() - ffmpegCheckedAt < 60000) return ffmpegLookup;
  ffmpegCheckedAt = Date.now();
  ffmpegLookup = (async () => {
    for (const candidate of [...(preferManagedFfmpeg ? [] : systemFfmpegCandidates(process.env.PATH)), FALLBACK_FFMPEG()]) {
      const executable = await fs.promises.realpath(candidate).catch(() => null);
      if (safeLocalPath(executable) && await hasRequiredEncoders(executable)) return executable;
    }
    return null;
  })();
  return ffmpegLookup;
}

// The Windows uninstall entry identifies the installed edition without loading any DirectShow filters.
async function detectKLite() {
  if (process.platform !== 'win32') return null;
  const key = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\KLiteCodecPack_is1';
  const reg = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
  const readings = await Promise.all(['HKLM', 'HKCU'].flatMap((hive) => ['64', '32'].map((view) =>
    new Promise((resolve) => {
      execFile(reg, ['query', hive + '\\' + key, '/v', 'DisplayName', '/reg:' + view],
        { windowsHide: true, timeout: 2000, maxBuffer: 4096 }, (error, stdout) => {
          const name = !error && /^\s*DisplayName\s+REG_SZ\s+(K-Lite [^\r\n]+)$/im.exec(stdout)?.[1];
          resolve(name ? name.trim().slice(0, 140) : '');
        });
    }))));
  return readings.find(Boolean) || '';
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
  await fs.promises.mkdir(dir, { recursive: true });
  const stage = await fs.promises.mkdtemp(path.join(dir, 'ffmpeg-stage-'));
  const zipPath = path.join(stage, 'ffmpeg.zip');
  const stagedExe = path.join(stage, 'ffmpeg.exe');
  try {
    onProgress({ phase: 'download', pct: 0 });
    await suiteLib.downloadVerified(info.url, zipPath, { expectedSha256: info.sha256, expectedSize: info.size, maxBytes: 400 * 1024 * 1024, onProgress: (pct) => onProgress({ phase: 'download', pct }) });
    onProgress({ phase: 'extract', pct: 0 });
    const entry = new AdmZip(zipPath).getEntries().find((e) => /(^|\/)bin\/ffmpeg\.exe$/i.test(e.entryName));
    if (!entry) throw new Error('Το ffmpeg.exe δεν βρέθηκε μέσα στο πακέτο λήψης.');
    await fs.promises.writeFile(stagedExe, entry.getData(), { flag: 'wx' });
    const works = await testFfmpeg(stagedExe);
    try {
      if (!works || !await hasRequiredEncoders(stagedExe)) throw new Error('Το ffmpeg δεν εκτελείται σωστά.');
      await fs.promises.rename(stagedExe, FALLBACK_FFMPEG());
    } finally {
      invalidateEncoders(stagedExe);
    }
    invalidateEncoders(FALLBACK_FFMPEG());
    ffmpegLookup = undefined;
    onProgress({ phase: 'done', pct: 1 });
    return FALLBACK_FFMPEG();
  } catch (error) {
    if (error.code === 'sha-mismatch' || error.code === 'size-mismatch') throw new Error('Το αρχείο που κατέβηκε δεν ταιριάζει με το δημοσιευμένο SHA-256 και διαγράφηκε.');
    throw error;
  } finally {
    await fs.promises.rm(stage, { recursive: true, force: true }).catch((error) => console.error('FFmpeg staging cleanup:', error));
  }
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
    title: 'Opsis Media Suite — ' + suiteApi.tx('help.title'),
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#0b0b14',
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  helpWindow.setMenuBarVisibility(false);
  helpWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  loadUiPage(helpWindow, 'help.html', { theme: currentTheme, lang: helpLang });
  helpWindow.on('closed', () => { helpWindow = null; });
}

const WINDOW_STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(WINDOW_STATE_FILE(), 'utf-8'));
    if (![state.x, state.y, state.width, state.height].every(Number.isSafeInteger) ||
        state.width < WINDOW_WIDTH || state.height < WINDOW_HEIGHT || state.width > 32768 || state.height > 32768) return null;
    const onScreen = screen.getAllDisplays().some((d) => {
      const b = d.bounds;
      return state.x >= b.x - 50 && state.y >= b.y - 50 && state.x < b.x + b.width && state.y < b.y + b.height;
    });
    return onScreen ? state : null;
  } catch { return null; }
}
function saveWindowState(win) {
  if (win.isDestroyed() || win.isMinimized() || win.isMaximized()) return;
  try { atomicWrite(WINDOW_STATE_FILE(), JSON.stringify(win.getBounds())); } catch { /* best-effort */ }
}

function extractAudioFileArg(argv) {
  return argv.map((a) => path.resolve(a)).find((a) => safeLocalPath(a) && AUDIO_EXTS.includes(path.extname(a).slice(1).toLowerCase()) && fs.existsSync(a)) || null;
}
function extractVideoFileArg(argv) {
  return argv.map((a) => path.resolve(a)).find((a) => safeLocalPath(a) && VIDEO_EXTS.includes(path.extname(a).slice(1).toLowerCase()) && fs.existsSync(a)) || null;
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
        { type: 'task', title: suiteApi.tx('vp.play') + ' / ' + suiteApi.tx('vp.pause'), program: process.execPath, args: '--jumplist-action=playpause', iconPath: process.execPath, iconIndex: 0 },
        { type: 'task', title: suiteApi.tx('vp.next'), program: process.execPath, args: '--jumplist-action=next', iconPath: process.execPath, iconIndex: 0 },
        { type: 'task', title: suiteApi.tx('vp.prev'), program: process.execPath, args: '--jumplist-action=prev', iconPath: process.execPath, iconIndex: 0 },
      ],
    },
  ]);
}

let mainWin = null;
let restoreMainWindow = null;

let suiteApi = null;
let converterApi = null;
let mediaApi = null;

async function auditAppResources(win) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const run = (code) => win.webContents.executeJavaScript(code);
  const metrics = () => app.getAppMetrics().reduce((total, process) => ({
    privateMiB: total.privateMiB + (process.memory.privateBytes ?? process.memory.workingSetSize) / 1024,
    cpuPercent: total.cpuPercent + process.cpu.percentCPUUsage,
    processes: total.processes + 1,
  }), { privateMiB: 0, cpuPercent: 0, processes: 0 });
  await run("showTab('settings'); showTab('video'); showTab('player'); 1");
  await delay(750);
  const windows = BrowserWindow.getAllWindows().length;
  const initial = metrics();
  const samples = [];
  for (let round = 0; round < 8; round++) {
    for (const tab of ['player', 'enhance', 'converter', 'video', 'photo', 'settings']) {
      await run(`showTab(${JSON.stringify(tab)}); 1`);
    }
    await delay(250);
    samples.push(metrics());
  }
  await run("showTab('player'); 1");
  await delay(750);
  const final = metrics();
  const peakCpu = Math.max(...samples.map((sample) => sample.cpuPercent));
  const peakMemory = Math.max(...samples.map((sample) => sample.privateMiB));
  return {
    name: '48 tab changes leave the same number of application windows',
    ok: BrowserWindow.getAllWindows().length === windows,
    extra: `processes ${initial.processes}→${final.processes}, memory ${initial.privateMiB.toFixed(1)}→${final.privateMiB.toFixed(1)} MiB, sampled peak ${peakMemory.toFixed(1)} MiB / ${peakCpu.toFixed(1)}% CPU`,
  };
}

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
  let tray = null;
  let minimizedToTray = false;
  const destroyTray = () => {
    if (tray && !tray.isDestroyed()) tray.destroy();
    tray = null;
  };
  const leaveTray = () => {
    if (!minimizedToTray) return;
    minimizedToTray = false;
    win.setSkipTaskbar(false);
    destroyTray();
  };
  restoreMainWindow = () => {
    if (win.isDestroyed()) return;
    leaveTray();
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  };
  if (process.platform === 'win32') {
    win.on('minimize', () => {
      if (minimizedToTray) return;
      try {
        const show = suiteApi.tx('tray.show'), quit = suiteApi.tx('tray.quit');
        tray = new Tray(path.join(__dirname, 'icon.ico'));
        tray.setToolTip('Opsis Media Suite');
        tray.on('click', restoreMainWindow);
        tray.setContextMenu(Menu.buildFromTemplate([
          { label: show, click: restoreMainWindow },
          { type: 'separator' },
          { label: quit, click: () => app.quit() },
        ]));
      } catch {
        destroyTray();
        return;
      }
      minimizedToTray = true;
      win.setSkipTaskbar(true);
      win.hide();
    });
    win.on('show', leaveTray);
  }
  const flyout = attachFlyout(win, () => currentTheme, () => !win.isDestroyed() && (minimizedToTray || win.isMinimized()));
  // Hardening + stability: the app only ever shows its own local pages.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  // Only the microphone input (getUserMedia) is a legitimate permission here; everything else is denied.
  win.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const audioOnly = details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio';
    callback(contents === win.webContents && permission === 'media' && details.isMainFrame && audioOnly);
  });
  // A crashed/killed renderer (GPU driver reset, out of memory on low-RAM PCs) used to leave a blank window until restart.
  const rendererFailures = [];
  let rendererStopped = false;
  win.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit' || win.isDestroyed() || rendererStopped) return;
    const now = Date.now();
    while (rendererFailures.length && now - rendererFailures[0] >= 120000) rendererFailures.shift();
    if (rendererFailures.length >= 4) {
      rendererStopped = true;
      void dialog.showMessageBox(win, { type: 'error', title: suiteApi.tx('crash.title'), message: suiteApi.tx('crash.desc') })
        .catch(() => {});
      return;
    }
    rendererFailures.push(now);
    try { win.reload(); } catch (_) { /* window is closing */ }
  });
  win.on('unresponsive', () => { /* keep the window: the audio engine may just be busy decoding a large file */ });
  loadUiPage(win, 'index.html');
  if (process.env.WAVEFRAME_SELFTEST === '1') {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        let code = 1;
        try {
          const results = await win.webContents.executeJavaScript('window.__selfTest()');
          results.push(...await suiteApi.selfTest());
          results.push(...await converterApi.selfTest());
          results.push(...await mediaApi.selfTest());
          results.push(...await flyout.selfTest());
          results.push(await auditAppResources(win));
          if (process.platform === 'win32') {
            win.minimize();
            await new Promise((resolve) => setTimeout(resolve, 350));
            results.push({ name: 'minimizing hides Opsis in the Windows notification area', ok: minimizedToTray && !win.isVisible() && !!tray && !tray.isDestroyed() });
            restoreMainWindow();
            results.push({ name: 'restoring from the tray shows the same window', ok: win.isVisible() && !minimizedToTray && !tray });
          }
          for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.extra ? ' — ' + r.extra : ''}`);
          code = results.every((r) => r.ok) ? 0 : 1;
        } catch (e) { console.log('FAIL self-test could not run: ' + e); }
        app.exit(code);
      }, 1500);
    });
  }
  win.on('closed', () => {
    destroyTray();
    if (mainWin === win) {
      mainWin = null;
      restoreMainWindow = null;
    }
  });
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
  win.on('close', () => { if (!isMiniMode) saveWindowState(win); });

  const bindMediaKey = (accelerator, action) => {
    globalShortcut.register(accelerator, () => {
      if (!win.isDestroyed()) win.webContents.send('media-key', action, true);
    });
  };
  if (!flyout.usesSystemMedia) {
    bindMediaKey('MediaPlayPause', 'playpause');
    bindMediaKey('MediaNextTrack', 'next');
    bindMediaKey('MediaPreviousTrack', 'prev');
    bindMediaKey('MediaStop', 'stop');
  }
  win.on('closed', () => globalShortcut.unregisterAll());

  let thumbbarIcons = null;
  let isPlaying = false;
  function updateThumbbar() {
    if (!thumbbarIcons || win.isDestroyed()) return;
    win.setThumbarButtons([
      { icon: thumbbarIcons.prev, tooltip: suiteApi.tx('vp.prev'), click: () => win.webContents.send('media-key', 'prev') },
      {
        icon: isPlaying ? thumbbarIcons.pause : thumbbarIcons.play,
        tooltip: suiteApi.tx(isPlaying ? 'vp.pause' : 'vp.play'),
        click: () => win.webContents.send('media-key', 'playpause'),
      },
      { icon: thumbbarIcons.next, tooltip: suiteApi.tx('vp.next'), click: () => win.webContents.send('media-key', 'next') },
      { icon: thumbbarIcons.flyout, tooltip: thumbbarIcons.flyoutLabel, click: () => flyout.show('manual') },
    ]);
  }

  // IPC hardening: every channel is answered only to the main window (or, for the two read-only constants, the Help window)
  // and every argument is type-checked and size-limited here - the renderer is not trusted.
  const fromMain = makeTrust(() => win);
  const fromHelp = makeTrust(() => helpWindow);
  const fromApp = (e) => fromMain(e) || fromHelp(e);
  const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]{1,200000}$/;

  ipcMain.on('thumbbar:icons', (event, icons) => {
    if (!fromMain(event) || !icons || !['prev', 'play', 'pause', 'next', 'flyout'].every((k) => typeof icons[k] === 'string' && PNG_DATA_URL.test(icons[k]))) return;
    thumbbarIcons = {
      prev: nativeImage.createFromDataURL(icons.prev),
      play: nativeImage.createFromDataURL(icons.play),
      pause: nativeImage.createFromDataURL(icons.pause),
      next: nativeImage.createFromDataURL(icons.next),
      flyout: nativeImage.createFromDataURL(icons.flyout),
      flyoutLabel: typeof icons.flyoutLabel === 'string' ? icons.flyoutLabel.slice(0, 120) : 'Opsis Media Suite',
    };
    updateThumbbar();
  });

  let lastNotifiedTitle = null;
  let trackNotificationsEnabled = true;
  ipcMain.on('settings:track-notifications', (event, enabled) => { if (fromMain(event) && typeof enabled === 'boolean') trackNotificationsEnabled = enabled; });

  ipcMain.on('crash:log', (event, details) => {
    if (!fromMain(event) || typeof details !== 'string') return;
    try {
      const logPath = path.join(app.getPath('userData'), 'crash.log');
      // bounded: one entry is at most 4000 characters and the log restarts when it passes 512 KB
      try { if (fs.statSync(logPath).size > 512 * 1024) fs.renameSync(logPath, logPath + '.old'); } catch { /* no log yet */ }
      const line = `[${new Date().toISOString()}] ${details.slice(0, 4000)}\n`;
      fs.appendFileSync(logPath, line);
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
    flyout.syncAppearance();
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
  ipcMain.on('app:legacy-settings-sync', (e) => { e.returnValue = fromMain(e) ? legacySettings : null; });
  ipcMain.on('app:legacy-settings-done', (e) => {
    if (!fromMain(e) || !legacySettings) return;
    try { atomicWrite(legacySettingsMarker(), '1'); legacySettings = null; } catch { /* retry next time */ }
  });
  ipcMain.on('paths:music-sync', (event) => { event.returnValue = fromApp(event) ? app.getPath('music') : ''; });
  ipcMain.on('help:open', (e) => { if (fromMain(e)) createHelpWindow(win); });

  ipcMain.handle('deps:prefer-managed', (event, enabled) => {
    if (!fromMain(event) || typeof enabled !== 'boolean') return false;
    if (preferManagedFfmpeg !== enabled) {
      preferManagedFfmpeg = enabled;
      ffmpegLookup = undefined;
    }
    return true;
  });

  ipcMain.handle('deps:check', async (e) => {
    if (!fromMain(e)) return { ffmpeg: { ok: false, path: null }, kLite: null };
    const [ffmpegPath, kLite] = await Promise.all([resolveFfmpegPath(), detectKLite()]);
    return { ffmpeg: { ok: !!ffmpegPath, path: ffmpegPath }, kLite };
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

  ipcMain.handle('metadata:read', async (event, filePath) => {
    try {
      // tags are only read from absolute paths of real audio files
      if (!fromMain(event) || typeof filePath !== 'string' || !safeLocalPath(filePath) || !AUDIO_EXTS.includes(path.extname(filePath).slice(1).toLowerCase()) || !(await fs.promises.stat(filePath)).isFile()) return null;
      const mm = await import('music-metadata');
      const meta = await mm.parseFile(filePath, { duration: false, skipCovers: false });
      const { common } = meta;
      let picture = null;
      const pic = common.picture?.[0];
      if (pic?.data?.byteLength <= 4 * 1024 * 1024 && /^image\/(?:png|jpe?g|webp|gif)$/i.test(pic.format)) {
        picture = `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`;
      }
      return {
        ...readTrackText(meta),
        picture,
      };
    } catch {
      return null;
    }
  });

  ipcMain.handle('settings:export', async (event, data) => {
    if (!fromMain(event) || !data || typeof data !== 'object' || Array.isArray(data) || JSON.stringify(data).length > 8 * 1024 * 1024) return { canceled: false, ok: false, error: 'invalid data' };
    const result = await dialog.showSaveDialog(win, {
      defaultPath: 'opsis-media-suite-backup.json',
      filters: [{ name: 'Opsis Media Suite Backup', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      atomicWrite(result.filePath, JSON.stringify(data, null, 2));
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
      if (fs.statSync(result.filePaths[0]).size > 8 * 1024 * 1024) return { canceled: false, ok: false, error: 'file too large' };
      const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
      const data = JSON.parse(raw);
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
    const folder = filePaths[0];
    if (canceled || !safeLocalPath(folder)) return { canceled: true };
    const target = outputFolderFile();
    try {
      atomicWrite(target, JSON.stringify([folder, ...readOutputFolders().filter((item) => item !== folder)].slice(0, 50)));
    } catch {
      return { canceled: true };
    }
    return { canceled: false, folderPath: folder };
  });
}

const outputFolderFile = () => path.join(app.getPath('userData'), 'output-folders.json');
function readOutputFolders() {
  try {
    const folders = JSON.parse(fs.readFileSync(outputFolderFile(), 'utf8'));
    return Array.isArray(folders) ? folders.filter((folder) => safeLocalPath(folder)).slice(0, 50) : [];
  } catch { return []; }
}

function forwardJumpListAction(argv) {
  const arg = argv.find((a) => a.startsWith('--jumplist-action='));
  if (arg && mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('media-key', arg.split('=')[1]);
  }
}

// A hidden, sandboxed page on the original file origin imports only the local
// settings from older versions, where the renderer lived on file://.
const legacySettingsMarker = () => path.join(app.getPath('userData'), 'ui-settings-migrated');
let legacySettings = null;
let mainWindowInitialized = false;
async function readLegacySettings() {
  if (process.env.WAVEFRAME_SELFTEST === '1' || fs.existsSync(legacySettingsMarker())) return;
  let dir;
  let win;
  let timer;
  try {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'opsis-legacy-ui-'));
    const page = path.join(dir, 'settings.html');
    await fs.promises.writeFile(page, `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'"><title>Opsis configuration</title>`);
    win = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    legacySettings = await Promise.race([
      win.loadFile(page).then(() => win.webContents.executeJavaScript(
        "Object.entries(localStorage).filter(([key, value]) => /^waveframe[.][a-zA-Z0-9._-]{1,80}$/.test(key) && typeof value === 'string')"
      )),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), 3000); }),
    ]);
  } catch { /* keep the legacy settings available for a later retry */ }
  finally {
    clearTimeout(timer);
    if (win && !win.isDestroyed()) win.destroy();
    if (dir) await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    if (mainWin) {
      restoreMainWindow?.();
      forwardJumpListAction(argv);
      forwardOpenFile(argv);
    }
  });

  app.whenReady().then(async () => {
    handleUiRequests(protocol);
    await readLegacySettings();
    if (process.platform === 'win32') app.setAppUserModelId('com.example.waveframe');
    reapplyAutostartAfterRename();
    const mainWindowTrust = makeTrust(() => mainWin);
    const helpWindowTrust = makeTrust(() => helpWindow);
    suiteApi = suite.init({
      onLang: (l) => { helpLang = l; updateJumpList(); },
      getMainWin: () => mainWin,
      getTheme: () => currentTheme,
      isMini: () => !!mainWin && !mainWin.isDestroyed() && mainWin.getBounds().width < 700,
      isTrusted: (e) => mainWindowTrust(e) || helpWindowTrust(e),
    });
    converterApi = converter.init({
      getMainWin: () => mainWin, resolveFfmpegPath, installFfmpeg, confirmFfmpegDownload,
      // default place for every encode: Windows Music folder > Opsis Media Suite (created automatically; the old Music\WaveFrame folder of earlier versions is left as it is)
      defaultVideoOutDir: () => { const d = path.join(app.getPath('videos'), 'Opsis Media Suite'); fs.mkdirSync(d, { recursive: true }); return d; },
      isApprovedOutDir: (folder) => readOutputFolders().includes(folder),
      defaultOutDir: () => { const d = path.join(app.getPath('music'), 'Opsis Media Suite'); fs.mkdirSync(d, { recursive: true }); return d; },
    });
    for (const type of ['music', 'videos']) {
      const dir = path.join(app.getPath(type), 'Opsis Media Suite');
      if (safeLocalPath(dir)) void removeStaleOutput(dir);
    }
    mediaApi = media.init({ getMainWin: () => mainWin, resolveFfmpegPath });
    mainWindowInitialized = true;
    createWindow();
    forwardJumpListAction(process.argv);
    mainWin.webContents.once('did-finish-load', () => forwardOpenFile(process.argv));
    if (process.env.WAVEFRAME_SELFTEST !== '1' && process.env.WAVEFRAME_NO_SPLASH !== '1') mainWin.webContents.once('did-finish-load', () => suiteApi.onMainLoaded());

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else if (mainWin && !mainWin.isVisible()) restoreMainWindow?.();
    });
  });

  let shutdown;
  let shutdownReady = false;
  app.on('before-quit', (event) => {
    if (shutdownReady || !converterApi) return;
    event.preventDefault();
    if (shutdown) return;
    let timer;
    shutdown = Promise.race([converterApi.cancelAll(), new Promise((resolve) => { timer = setTimeout(resolve, 5000); })])
      .finally(() => {
        clearTimeout(timer);
        shutdownReady = true;
        app.quit();
      });
  });

  app.on('window-all-closed', () => {
    if (mainWindowInitialized && process.platform !== 'darwin') app.quit();
  });
}
