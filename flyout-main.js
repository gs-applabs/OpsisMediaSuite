const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');

const WIDTH = 360;
const HEIGHT = 256;
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

function attachFlyout(owner, getTheme) {
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
      const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const x = Math.max(workArea.x, workArea.x + workArea.width - WIDTH - INSET);
      const y = Math.max(workArea.y, workArea.y + workArea.height - HEIGHT - INSET);
      flyout.setPosition(x, y);
      if (reason === 'manual') flyout.show();
      else flyout.showInactive();
      sendToOwner('flyout:visible', true);
    } else if (reason === 'manual') {
      flyout.focus();
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
    flyout.on('hide', () => sendToOwner('flyout:visible', false));
    flyout.on('closed', () => {
      clearTimeout(hideTimer);
      flyout = null;
      ready = hovered = false;
      pending = null;
      sendToOwner('flyout:visible', false);
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
    syncAppearance();
  });
  listen('flyout:state', fromOwner, (state) => {
    if (!flyout?.isVisible() || !state || typeof state !== 'object') return;
    const duration = bounded(state.duration, Number.MAX_SAFE_INTEGER);
    send('flyout:state', {
      title: label(state.title), artist: label(state.artist), upcoming: label(state.upcoming),
      playing: state.playing === true, canPlay: state.canPlay === true, canNext: state.canNext === true,
      shuffle: state.shuffle === true, muted: state.muted === true,
      repeat: state.repeat === 'all' || state.repeat === 'one' ? state.repeat : 'off',
      duration, position: bounded(state.position, duration), volume: bounded(state.volume, 100),
      spectrum: Array.from({ length: LEVELS }, (_, i) => bounded(state.spectrum?.[i], 1)),
    });
  });
  listen('flyout:artwork', fromOwner, (artwork) => {
    if (!flyout?.isVisible()) return;
    const image = typeof artwork === 'string' && artwork.length <= 2000000 &&
      /^data:image\/(?:png|jpe?g|webp|gif|bmp|avif);base64,[a-z0-9+/=]+$/i.test(artwork) ? artwork : '';
    send('flyout:artwork', image);
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
    if (COMMANDS.has(action)) sendToOwner('flyout:command', { action });
    if ((action === 'seek' || action === 'volume') && Number.isFinite(value) && value >= 0 && value <= 1) {
      sendToOwner('flyout:command', { action, value });
    }
  });

  owner.webContents.on('did-start-loading', () => {
    automatic = false;
    hide();
  });
  owner.on('closed', () => {
    clearTimeout(hideTimer);
    for (const [channel, listener] of listeners) ipcMain.removeListener(channel, listener);
    if (flyout && !flyout.isDestroyed()) flyout.destroy();
  });
  return { show, syncAppearance };
}

module.exports = { attachFlyout };
