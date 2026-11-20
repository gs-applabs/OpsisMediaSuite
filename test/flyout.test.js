'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'flyout-main.js'), 'utf8');

function fixture(t, desktopAvailable = false) {
  const windows = [];
  class Window extends EventEmitter {
    constructor() {
      super();
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: 'file:///fixture.html' };
      this.webContents.setWindowOpenHandler = () => {};
      this.messages = [];
      this.webContents.send = (...args) => this.messages.push(args);
      windows.push(this);
    }
    isDestroyed() { return Boolean(this.destroyed); }
    isVisible() { return Boolean(this.visible); }
    isMinimized() { return Boolean(this.minimized); }
    isFocused() { return Boolean(this.focused); }
    setPosition(x, y) { this.position = [x, y]; }
    show() { this.showInactive(); this.focus(); }
    showInactive() { this.visible = true; }
    focus() { this.focused = true; this.emit('focus'); }
    hide() { this.visible = this.focused = false; this.emit('hide'); }
    destroy() { this.destroyed = true; this.emit('closed'); }
    async loadFile() { this.webContents.emit('did-finish-load'); }
  }
  const ipcMain = new EventEmitter();
  const nativeCommands = [];
  let nativeMessage;
  const screen = {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ workArea: { x: -1000, y: 20, width: 1000, height: 700 } }),
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, __dirname: path.join(__dirname, '..'), setTimeout, clearTimeout, setInterval, clearInterval, process,
    require(name) {
      if (name === './ipc-trust.js') return require('../ipc-trust.js');
      if (name === 'electron') return { BrowserWindow: Window, ipcMain, screen };
      if (name === './windows-desktop') return {
        createWindowsDesktop: (receive) => {
          nativeMessage = receive;
          return { available: desktopAvailable, send(message) { nativeCommands.push(message); }, close() {} };
        },
      };
      return require(name);
    },
  });
  const owner = new Window();
  const controller = module.exports.attachFlyout(owner, () => 'light');
  t.after(() => { if (!owner.isDestroyed()) owner.destroy(); });
  const send = (win, channel, value, frame = win.webContents.mainFrame) => {
    ipcMain.emit(channel, { sender: win.webContents, senderFrame: frame }, value);
  };
  return { owner, controller, send, windows, ipcMain, nativeCommands, nativeMessage };
}

test('the flyout opens manually by default and automatic events leave focus in the current window', (t) => {
  const { owner, controller, send, windows } = fixture(t);
  controller.show('media');
  assert.equal(windows.length, 1);
  send(owner, 'flyout:settings', { automatic: true, lang: 'el' });
  send(owner, 'flyout:open', 'up-next');
  const panel = windows[1];
  assert.equal(panel.isVisible(), true);
  assert.equal(panel.isFocused(), false);
  assert.deepEqual(panel.position, [-372, 416]);
  assert.deepEqual(owner.messages.at(-1), ['flyout:visible', true]);

  send(panel, 'flyout:dismiss');
  assert.equal(panel.isVisible(), false);
  assert.deepEqual(owner.messages.at(-1), ['flyout:visible', false]);
  controller.show('manual');
  assert.equal(panel.isVisible(), true);
  assert.equal(panel.isFocused(), true);
});

test('the flyout accepts commands only from its visible main frame and validates values', (t) => {
  const { owner, controller, send, windows, ipcMain } = fixture(t);
  controller.show('manual');
  const panel = windows[1];
  const command = { action: 'volume', value: 0.42 };
  send(owner, 'flyout:command', command);
  send(panel, 'flyout:command', command, {});
  send(panel, 'flyout:command', { action: 'seek', value: 2 });
  send(panel, 'flyout:command', { action: 'unknown' });
  assert.equal(owner.messages.length, 1);

  send(panel, 'flyout:command', command);
  assert.equal(owner.messages.at(-1)[0], 'flyout:command');
  assert.equal(owner.messages.at(-1)[1].action, 'volume');
  assert.equal(owner.messages.at(-1)[1].value, 0.42);

  send(panel, 'flyout:dismiss');
  send(panel, 'flyout:command', { action: 'next' });
  assert.equal(owner.messages.at(-1)[0], 'flyout:visible');
  owner.destroy();
  assert.equal(panel.isDestroyed(), true);
  assert.equal(ipcMain.eventNames().length, 0);
});


test('system media commands go to the selected Windows session and Windows mixer writes require a known session', (t) => {
  const { controller, send, windows, owner, nativeCommands, nativeMessage } = fixture(t, true);
  controller.show('manual');
  const panel = windows[1];
  nativeMessage({
    type: 'snapshot',
    media: { active: 'browser#0', sessions: [{ id: 'browser#0', name: 'Browser', source: 'browser.exe', title: 'Track' }] },
    mixer: { master: { id: 'master' }, apps: [{ id: 'browser-audio' }] },
  });

  send(panel, 'flyout:select', 'browser#0');
  send(panel, 'flyout:command', { action: 'seek', value: 0.6 });
  assert.equal(nativeCommands.at(-1).type, 'media');
  assert.equal(nativeCommands.at(-1).id, 'browser#0');
  assert.equal(nativeCommands.at(-1).action, 'seek');
  assert.equal(nativeCommands.at(-1).value, 0.6);

  send(panel, 'flyout:mixer', { action: 'volume', id: 'missing', value: 0.5 });
  assert.equal(nativeCommands.at(-1).type, 'media');
  send(panel, 'flyout:mixer', { action: 'volume', id: 'browser-audio', value: 0.5 });
  assert.equal(nativeCommands.at(-1).type, 'mixer');
  assert.equal(nativeCommands.at(-1).id, 'browser-audio');

  send(panel, 'flyout:select', '');
  send(panel, 'flyout:command', { action: 'next' });
  assert.equal(owner.messages.at(-1)[0], 'flyout:command');
  assert.equal(owner.messages.at(-1)[1].action, 'next');
});

test('taskbar placement settings are passed to the Windows helper with backward-compatible defaults', (t) => {
  const { owner, send, nativeCommands } = fixture(t, true);
  const set = (fields) => {
    send(owner, 'flyout:settings', { automatic: false, widget: true, ...fields });
    return nativeCommands.findLast((command) => command.type === 'configure');
  };
  assert.equal(set({}).widgetPosition, 'end');
  assert.equal(set({ widgetCoverBackground: true }).widgetCoverBackground, true);
  assert.equal(set({ widgetCoverBackground: 'true' }).widgetCoverBackground, false);
  assert.equal(set({ widgetPosition: 'center', widgetLegacyBounds: true }).widgetPosition, 'center');
  assert.equal(nativeCommands.findLast((command) => command.type === 'configure').widgetLegacyBounds, true);
  assert.equal(set({ widgetPosition: 'unknown', widgetLegacyBounds: 'true' }).widgetPosition, 'end');
  assert.equal(nativeCommands.findLast((command) => command.type === 'configure').widgetLegacyBounds, false);
});


test('the taskbar follows minimization and remembers a valid dragged position', (t) => {
  const { owner, send, nativeCommands, nativeMessage } = fixture(t, true);
  const config = () => nativeCommands.findLast((command) => command.type === 'configure');
  send(owner, 'flyout:settings', { automatic: false, widget: true, widgetMinimizedOnly: true });
  assert.equal(config().widget, false);
  assert.deepEqual(owner.messages.at(-2), ['flyout:taskbar-status', 'WAITING-MINIMIZE']);

  owner.minimized = true;
  owner.emit('minimize');
  assert.equal(config().widget, true);
  nativeMessage({ type: 'taskbar-position', position: 1.01 });
  assert.deepEqual(owner.messages.at(-1), ['flyout:visible', true]);
  nativeMessage({ type: 'taskbar-position', position: 0.25 });
  assert.deepEqual(owner.messages.at(-1), ['flyout:taskbar-position', 0.25]);

  owner.minimized = false;
  owner.emit('restore');
  assert.equal(config().widget, false);
  assert.equal(config().widgetPosition, 'manual');
  assert.equal(config().widgetOffset, 0.25);
});

test('closing the owner tears down an open flyout without querying a destroyed window', (t) => {
  const { owner, controller, send, windows, ipcMain } = fixture(t, true);
  owner.isMinimized = () => {
    if (owner.isDestroyed()) throw new Error('Object has been destroyed');
    return false;
  };
  send(owner, 'flyout:settings', { automatic: false, widget: true, widgetMinimizedOnly: true });
  controller.show('manual');
  const panel = windows[1];
  assert.equal(panel.isVisible(), true);
  assert.doesNotThrow(() => owner.destroy());
  assert.equal(panel.isDestroyed(), true);
  assert.equal(ipcMain.listenerCount('flyout:open'), 0);
});

test('Windows helper stops restarting after four quick child exits', () => {
  const { PassThrough } = require('node:stream');
  let spawns = 0;
  let active;
  const events = [];
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'windows-desktop.js'), 'utf8'), {
    module: mod, __dirname, process: { platform: 'win32' },
    require(name) {
      if (name === 'node:fs') return { existsSync: () => true };
      if (name === 'node:child_process') return { spawn() {
        spawns++;
        active = new EventEmitter();
        active.stdin = new PassThrough();
        active.stdout = new PassThrough();
        return active;
      } };
      return require(name);
    },
  });
  const bridge = mod.exports.createWindowsDesktop((event) => events.push(event.type));
  for (let i = 0; i < 8; i++) {
    bridge.send({ type: 'snapshot' });
    active.emit('exit', 1);
  }
  assert.equal(spawns, 4);
  assert.equal(bridge.available, false);
  assert.deepEqual(events, ['exit', 'exit', 'exit', 'exit']);
});
