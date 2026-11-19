const { BrowserWindow, ipcMain, nativeImage, screen, systemPreferences } = require('electron');
const path = require('node:path');
const { createWindowsDesktop } = require('./windows-desktop');

const WIDTH = 360;
const HEIGHT = 292;
const INSET = 12;
const DISPLAY_TIME_MS = 6500;
const COMMANDS = new Set(['playpause', 'prev', 'next', 'shuffle', 'repeat', 'mute']);
const LEVELS = 8;

function label(value) {
  return typeof value === 'string' ? value.slice(0, 300) : '';
}

function bounded(value, max) {
  return Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0;
}

function attachFlyout(owner, getTheme, isOwnerMinimized = () => owner.isMinimized?.()) {
  const desktop = createWindowsDesktop(onDesktopMessage);
  let lockToast;
  let lockTimer;
  let lockReady = false;
  let lockData;
  let pollTimer;
  let disposed = false;
  let notifyDesktopAvailability;
  let external = [];
  let activeSession = '';
  let mixer = null;
  let selected = '';
  let pendingSystemMode;
  let localState;
  let localArtwork = '';
  let widgetState = '';
  let sourceArtwork = '';
  let widgetArtwork = '';
  let desktopSettings = { locks: false, widget: false, light: false };
  let lastSystemAccent;
  const mediaActions = new Set(['playpause', 'prev', 'next', 'seek', 'shuffle', 'repeat']);
  const ownSource = process.execPath.toLowerCase().replaceAll('\\', '/');
  let flyout;
  let ready = false;
  let pending = null;
  let hovered = false;
  let hideTimer;
  let automatic = false;
  let appearance = { lang: 'el', accent: '' };
  const listeners = [];

  function send(channel, data) {
    if (ready && flyout && !flyout.isDestroyed()) flyout.webContents.send(channel, data);
  }

  function sendToOwner(channel, data) {
    if (!owner.isDestroyed()) owner.webContents.send(channel, data);
  }

  function displayWorkArea() {
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  }

  function widgetVisible() {
    return !disposed && !owner.isDestroyed() && desktopSettings.widget &&
      (!desktopSettings.widgetMinimizedOnly || isOwnerMinimized());
  }

  function sendWindowsAccent() {
    if (process.platform !== 'win32' || !systemPreferences?.getAccentColor) return;
    const color = systemPreferences.getAccentColor();
    if (!/^[0-9a-f]{8}$/i.test(color)) return;
    const hex = '#' + color.slice(0, 6).toLowerCase();
    if (hex === lastSystemAccent) return;
    lastSystemAccent = hex;
    sendToOwner('flyout:windows-accent', hex);
  }

  function refreshWidgetVisibility() {
    if (disposed || owner.isDestroyed()) return;
    pushDesktopSettings();
    updatePolling();
    sendToOwner('flyout:visible', !!widgetVisible() || !!flyout?.isVisible());
    if (widgetVisible()) pushWidget();
    else if (desktopSettings.widget && desktopSettings.widgetMinimizedOnly)
      sendToOwner('flyout:taskbar-status', 'WAITING-MINIMIZE');
  }

  function updatePolling() {
    clearInterval(pollTimer);
    pollTimer = undefined;
    if (disposed || owner.isDestroyed() || !desktop.available || (!flyout?.isVisible() && !widgetVisible() && !automatic)) return;
    const poll = () => desktop.send({ type: 'snapshot', mixer: !!flyout?.isVisible(), artwork: !!flyout?.isVisible() || !!widgetVisible(), selected });
    poll();
    pollTimer = setInterval(poll, automatic || widgetVisible() ? 950 : 1200);
  }

  function pushDesktopSettings() {
    if (disposed || !desktop.available || (!desktop.running && !automatic && !desktopSettings.locks && !desktopSettings.widget && !flyout?.isVisible())) return;
    desktop.send({ type: 'configure', ...desktopSettings, widget: !!widgetVisible(), mediaKeys: automatic });
  }

  function isOurSession(source) {
    const id = source.toLowerCase().replaceAll('\\', '/');
    return id === ownSource || id === 'com.example.waveframe' || id.endsWith('/opsis media suite.exe');
  }

  function systemState() {
    const sessions = external.map(({ id, name, title }) => ({ id, name, title }));
    send('flyout:system', { available: desktop.available, selected, sessions, mixer });
  }

  function thumbnail(data) {
    if (data === sourceArtwork) return widgetArtwork;
    sourceArtwork = data;
    widgetArtwork = '';
    if (typeof data !== 'string' || !data || data.length > 2000000) return widgetArtwork;
    try {
      const image = nativeImage.createFromDataURL(data);
      if (image.isEmpty()) return widgetArtwork;
      const { width, height } = image.getSize();
      const size = width >= height ? { width: 80 } : { height: 80 };
      const encoded = image.resize({ ...size, quality: 'good' }).toJPEG(78).toString('base64');
      if (encoded.length <= 12000) widgetArtwork = encoded;
    } catch { /* a corrupt cover uses the widget's music icon */ }
    return widgetArtwork;
  }

  function pushWidget() {
    if (!widgetVisible()) return;
    const current = external.find((session) => session.id === activeSession) ||
      (!localState?.playing && external.find((session) => session.playing)) || localState;
    const view = JSON.stringify({
      type: 'widget', title: label(current?.title), artist: label(current?.artist),
      artwork: thumbnail((current === localState ? localArtwork : current?.artwork) || ''), playing: current?.playing,
      canPlay: current?.canPlay, canPrev: current?.canPrev ?? current?.canPlay,
      canNext: current?.canNext, spectrum: current?.spectrum,
    });
    if (view !== widgetState) {
      widgetState = view;
      desktop.send(JSON.parse(view));
    }
  }

  function pushPlayer() {
    const session = external.find((item) => item.id === selected);
    if (session) {
      const { artwork, ...state } = session;
      send('flyout:state', { ...state, external: true, spectrum: [] });
      send('flyout:artwork', artwork || '');
    } else if (localState) {
      send('flyout:state', localState);
      send('flyout:artwork', localArtwork);
    }
  }

  function onDesktopMessage(message) {
    if (owner.isDestroyed()) return;
    if (message.type === 'ready') {
      widgetState = '';
      pushDesktopSettings();
      pushWidget();
      return;
    }
    if (message.type === 'snapshot') {
      const previousSelection = selected;
      external = Array.isArray(message.media?.sessions)
        ? message.media.sessions.filter((item) => typeof item?.source === 'string' && !isOurSession(item.source))
        : [];
      activeSession = message.media?.active || '';
      mixer = message.mixer;
      if (pendingSystemMode === 'media') selected = external.some((item) => item.id === activeSession) ? activeSession : '';
      else if (!external.some((item) => item.id === selected)) selected = '';
      pendingSystemMode = undefined;
      systemState();
      if (selected || selected !== previousSelection) pushPlayer();
      pushWidget();
      return;
    }
    if (message.type === 'key') {
      if (message.key === 'media' || message.key === 'volume') {
        if (!automatic) return;
        if (message.key === 'media') pendingSystemMode = 'media';
        show(message.key === 'volume' ? 'mixer' : 'media');
      } else if (desktopSettings.locks && ['caps', 'num', 'scroll'].includes(message.key)) {
        showLock(message.key, message.enabled === true);
      }
      return;
    }
    if (message.type === 'taskbar-position' && widgetVisible() && Number.isFinite(message.position) &&
        message.position >= 0 && message.position <= 1) {
      desktopSettings.widgetPosition = 'manual';
      desktopSettings.widgetOffset = message.position;
      sendToOwner('flyout:taskbar-position', message.position);
      return;
    }
    if (message.type === 'taskbar-status' && typeof message.status === 'string' &&
        /^(?:CHECKING|NO-TASKBAR|NO-BOUNDS|NO-SPACE|NOT-VISIBLE|ATTACH-FAILED|(?:WIN32|ATTACHED|PARTIAL)-[0-9]{1,10})?$/.test(message.status)) {
      if (widgetVisible() || !desktopSettings.widget)
        sendToOwner('flyout:taskbar-status', message.status);
      return;
    }
    if (message.type === 'widget' && widgetVisible()) {
      if (message.action === 'open') {
        selected = external.some((item) => item.id === activeSession) ? activeSession : '';
        show('manual');
        systemState();
        pushPlayer();
      } else if (mediaActions.has(message.action)) {
        const active = external.find((item) => item.id === activeSession) ||
          (!localState?.playing && external.find((session) => session.playing));
        if (active) desktop.send({ type: 'media', id: active.id, action: message.action });
        else sendToOwner('flyout:command', { action: message.action });
      }
      return;
    }
    if (message.type === 'result') {
      if (!message.ok) send('flyout:notice', 'failed');
      desktop.send({ type: 'snapshot', mixer: !!flyout?.isVisible(), artwork: !!flyout?.isVisible() || !!widgetVisible(), selected });
    }
    if (message.type === 'error') send('flyout:notice', 'failed');
    if (message.type === 'exit') {
      if (desktopSettings.widget) sendToOwner('flyout:taskbar-status', 'HELPER-EXIT');
      mixer = null;
      external = [];
      selected = '';
      widgetState = '';
      systemState();
      pushPlayer();
    }
  }

  function showLock(key, enabled) {
    lockData = { key, enabled, ...appearance, theme: getTheme() };
    if (!lockToast) {
      lockToast = new BrowserWindow({
        width: 236, height: 56, show: false, frame: false, skipTaskbar: true,
        resizable: false, focusable: false, alwaysOnTop: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true,
          preload: path.join(__dirname, 'flyout-preload.js') },
      });
      lockToast.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      lockToast.webContents.on('will-navigate', (event) => event.preventDefault());
      lockToast.on('closed', () => { lockToast = null; lockReady = false; });
      lockToast.loadFile(path.join(__dirname, 'renderer', 'lock-toast.html')).then(() => {
        lockReady = true;
        if (desktopSettings.locks || process.env.WAVEFRAME_SELFTEST === '1') revealLock();
      }).catch(() => lockToast?.destroy());
      return;
    }
    if (lockReady) revealLock();
  }

  function revealLock() {
    if (!lockToast || lockToast.isDestroyed()) return;
    clearTimeout(lockTimer);
    const work = displayWorkArea();
    lockToast.setPosition(work.x + Math.max(0, Math.round((work.width - 236) / 2)),
      Math.max(work.y, work.y + work.height - 76));
    lockToast.webContents.send('flyout:lock', lockData);
    lockToast.showInactive();
    lockTimer = setTimeout(() => lockToast?.hide(), 2300);
  }

  function hide() {
    clearTimeout(hideTimer);
    pending = null;
    hovered = false;
    if (flyout?.isVisible()) flyout.hide();
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    if (!hovered && !flyout?.isFocused()) hideTimer = setTimeout(hide, DISPLAY_TIME_MS);
  }

  function reveal() {
    if (!pending || !ready) return;
    const reason = pending;
    pending = null;
    if (!flyout.isVisible()) {
      const work = displayWorkArea();
      const x = Math.max(work.x, work.x + work.width - WIDTH - INSET);
      const y = Math.max(work.y, work.y + work.height - HEIGHT - INSET);
      flyout.setPosition(x, y);
      if (reason === 'manual') flyout.show();
      else flyout.showInactive();
      sendToOwner('flyout:visible', true);
      systemState();
      pushPlayer();
      pushDesktopSettings();
      updatePolling();
    } else if (reason === 'manual') {
      flyout.focus();
    }
    if (reason === 'mixer') send('flyout:mode', 'mixer');
    else if (reason === 'media' || reason === 'up-next' || reason === 'manual') send('flyout:mode', 'media');
    if (reason === 'up-next') {
      selected = '';
      pendingSystemMode = undefined;
      systemState();
      pushPlayer();
    }
    scheduleHide();
  }

  function syncAppearance() {
    send('flyout:appearance', { ...appearance, theme: getTheme() });
  }

  function show(reason) {
    if (reason !== 'manual' && !automatic) return;
    if (pending !== 'manual') pending = reason;
    if (flyout) { reveal(); return; }
    flyout = new BrowserWindow({
      width: WIDTH, height: HEIGHT, show: false, frame: false, skipTaskbar: true,
      resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, alwaysOnTop: true, roundedCorners: true,
      backgroundColor: '#14141f',
      webPreferences: {
        contextIsolation: true, nodeIntegration: false, sandbox: true,
        preload: path.join(__dirname, 'flyout-preload.js'),
      },
    });
    flyout.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    flyout.webContents.on('will-navigate', (event) => event.preventDefault());
    flyout.on('focus', scheduleHide);
    flyout.on('blur', scheduleHide);
    flyout.on('hide', () => {
      if (disposed || owner.isDestroyed()) return;
      sendToOwner('flyout:visible', !!widgetVisible());
      updatePolling();
    });
    flyout.on('closed', () => {
      clearTimeout(hideTimer);
      flyout = null;
      ready = hovered = false;
      pending = null;
      if (disposed || owner.isDestroyed()) return;
      sendToOwner('flyout:visible', !!widgetVisible());
      updatePolling();
    });
    flyout.webContents.on('render-process-gone', () => flyout?.destroy());
    flyout.webContents.once('did-finish-load', () => {
      ready = true;
      syncAppearance();
      reveal();
    });
    flyout.loadFile(path.join(__dirname, 'renderer', 'flyout.html'), {
      query: { theme: getTheme(), lang: appearance.lang },
    }).catch(() => flyout?.destroy());
  }

  function listen(channel, windowForSender, handle) {
    const listener = (event, value) => {
      const win = windowForSender();
      if (win && !win.isDestroyed() && event.sender === win.webContents &&
          event.senderFrame && event.senderFrame === win.webContents.mainFrame) handle(value);
    };
    ipcMain.on(channel, listener);
    listeners.push([channel, listener]);
  }

  const fromOwner = () => owner;
  const fromFlyout = () => flyout;
  listen('flyout:open', fromOwner, (reason) => {
    if (reason === 'manual' || reason === 'up-next' || reason === 'media') show(reason);
  });
  listen('flyout:settings', fromOwner, (data) => {
    if (!data || typeof data.automatic !== 'boolean') return;
    automatic = data.automatic;
    if (!automatic && pending !== 'manual') pending = null;
    appearance = {
      lang: typeof data.lang === 'string' && /^[a-z]{2}$/.test(data.lang) ? data.lang : 'el',
      accent: typeof data.accent === 'string' && /^#[0-9a-f]{6}$/i.test(data.accent) ? data.accent : '',
    };
    desktopSettings = {
      locks: data.locks === true, widget: data.widget === true, light: data.light === true, lang: appearance.lang,
      widgetMinimizedOnly: data.widgetMinimizedOnly === true,
      widgetOffset: Number.isFinite(data.widgetOffset) && data.widgetOffset >= 0 && data.widgetOffset <= 1 ? data.widgetOffset : null,
      widgetPosition: ['start', 'center', 'end', 'manual'].includes(data.widgetPosition) ? data.widgetPosition : 'end',
      widgetLegacyBounds: data.widgetLegacyBounds === true,
      widgetCoverBackground: data.widgetCoverBackground === true,
      openLabel: label(data.openLabel), prevLabel: label(data.prevLabel),
      playLabel: label(data.playLabel), nextLabel: label(data.nextLabel), dragLabel: label(data.dragLabel),
    };
    if (!desktopSettings.locks) lockToast?.hide();
    if (!desktopSettings.widget) widgetState = '';
    if (desktop.available) refreshWidgetVisibility();
    sendWindowsAccent();
    if (notifyDesktopAvailability !== desktop.available) {
      notifyDesktopAvailability = desktop.available;
      sendToOwner('flyout:desktop-availability', desktop.available);
    }
    syncAppearance();
  });
  listen('flyout:state', fromOwner, (state) => {
    if ((!flyout?.isVisible() && !widgetVisible()) || !state || typeof state !== 'object') return;
    const duration = bounded(state.duration, Number.MAX_SAFE_INTEGER);
    localState = {
      title: label(state.title), artist: label(state.artist), upcoming: label(state.upcoming),
      playing: state.playing === true, canPlay: state.canPlay === true, canNext: state.canNext === true,
      shuffle: state.shuffle === true, muted: state.muted === true,
      repeat: state.repeat === 'all' || state.repeat === 'one' ? state.repeat : 'off',
      duration, position: bounded(state.position, duration), volume: bounded(state.volume, 100),
      spectrum: Array.from({ length: LEVELS }, (_, i) => bounded(state.spectrum?.[i], 1)),
    };
    if (!selected) send('flyout:state', localState);
    pushWidget();
  });
  listen('flyout:artwork', fromOwner, (artwork) => {
    if (!flyout?.isVisible() && !widgetVisible()) return;
    localArtwork = typeof artwork === 'string' && artwork.length <= 2000000 &&
      /^data:image\/(?:png|jpe?g|webp|gif|bmp|avif);base64,[a-z0-9+/=]+$/i.test(artwork) ? artwork : '';
    if (!selected) send('flyout:artwork', localArtwork);
    pushWidget();
  });
  listen('flyout:hover', fromFlyout, (value) => {
    if (typeof value !== 'boolean' || !flyout.isVisible()) return;
    hovered = value;
    scheduleHide();
  });
  listen('flyout:dismiss', fromFlyout, hide);
  listen('flyout:command', fromFlyout, (data) => {
    if (!flyout.isVisible() || !data || typeof data !== 'object') return;
    const { action, value } = data;
    const validValue = Number.isFinite(value) && value >= 0 && value <= 1;
    if (selected) {
      if (mediaActions.has(action) && (action !== 'seek' || validValue))
        desktop.send({ type: 'media', id: selected, action, value });
      return;
    }
    if (COMMANDS.has(action)) sendToOwner('flyout:command', { action });
    if ((action === 'seek' || action === 'volume') && validValue) sendToOwner('flyout:command', { action, value });
  });
  listen('flyout:select', fromFlyout, (id) => {
    if (!flyout.isVisible() || (id !== '' && !external.some((item) => item.id === id))) return;
    selected = id;
    pendingSystemMode = undefined;
    systemState();
    pushPlayer();
  });
  listen('flyout:mixer', fromFlyout, (request) => {
    if (!flyout.isVisible() || !request || typeof request !== 'object') return;
    const { id, action, value } = request;
    if (!mixer?.master || (id !== 'master' && !mixer.apps.some((item) => item.id === id))) return;
    if ((action === 'volume' && Number.isFinite(value) && value >= 0 && value <= 1) ||
        (action === 'mute' && (value === 0 || value === 1))) desktop.send({ type: 'mixer', id, action, value });
  });

  owner.webContents.on('did-start-loading', () => {
    automatic = false;
    notifyDesktopAvailability = undefined;
    lastSystemAccent = undefined;
    desktopSettings = { locks: false, widget: false, light: false };
    pushDesktopSettings();
    hide();
  });
  for (const event of ['minimize', 'restore', 'show']) owner.on(event, refreshWidgetVisibility);
  systemPreferences?.on('accent-color-changed', sendWindowsAccent);

  owner.on('closed', () => {
    disposed = true;
    systemPreferences?.removeListener('accent-color-changed', sendWindowsAccent);
    clearTimeout(hideTimer);
    clearTimeout(lockTimer);
    clearInterval(pollTimer);
    desktop.close();
    if (lockToast && !lockToast.isDestroyed()) lockToast.destroy();
    for (const [channel, listener] of listeners) ipcMain.removeListener(channel, listener);
    const panel = flyout;
    if (panel && !panel.isDestroyed()) panel.destroy();
  });
  async function selfTest() {
    const results = [];
    const waitFor = async (read) => {
      for (let attempt = 0; attempt < 25; attempt++) {
        if (await read()) return true;
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      return false;
    };

    const originalLang = await owner.webContents.executeJavaScript('currentLang');
    try {
      await owner.webContents.executeJavaScript("setLanguage('el')");
      show('manual');
      const panel = await waitFor(() => flyout?.isVisible());
      results.push({ name: 'desktop flyout opens and shows its renderer', ok: panel });
      if (!panel) return results;
      results.push({
        name: 'desktop flyout renders the Greek title and accessible close label',
        ok: await waitFor(() => flyout.webContents.executeJavaScript(`
          document.documentElement.lang === 'el' &&
          document.querySelector('[data-i18n="flyout.title"]').textContent === 'Χειριστήριο ήχου' &&
          document.querySelector('[data-label="splash.close"]').getAttribute('aria-label') === 'Κλείσιμο'
        `)),
      });

      await flyout.webContents.executeJavaScript(`
        const slider = document.getElementById('volume');
        slider.value = '0.47';
        slider.dispatchEvent(new Event('input'));
      `);
      results.push({
        name: 'desktop volume slider updates the audio player through IPC',
        ok: await waitFor(() => owner.webContents.executeJavaScript("document.getElementById('volume').value === '47'")),
      });
      if (desktop.available) {
        await flyout.webContents.executeJavaScript("document.getElementById('mixer-mode').click()");
        results.push({
          name: 'Windows mixer opens from the flyout',
          ok: await flyout.webContents.executeJavaScript("!document.getElementById('mixer-panel').hidden"),
        });
        showLock('caps', true);
        results.push({
          name: 'lock-key toast renders a status without switching focus',
          ok: await waitFor(() => lockToast?.isVisible() &&
            lockToast.webContents.executeJavaScript("document.getElementById('lock-state').textContent === 'Ενεργό'")) &&
            !lockToast.isFocused(),
        });
      }
      return results;
    } finally {
      hide();
      lockToast?.hide();
      await owner.webContents.executeJavaScript(`setLanguage(${JSON.stringify(originalLang)})`);
    }
  }

  return { show, syncAppearance, selfTest, usesSystemMedia: desktop.available };
}

module.exports = { attachFlyout };
