'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'flyout-main.js'), 'utf8');

function fixture(t) {
  const windows = [];
  class Window extends EventEmitter {
    constructor() {
      super();
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = {};
      this.webContents.setWindowOpenHandler = () => {};
      this.messages = [];
      this.webContents.send = (...args) => this.messages.push(args);
      windows.push(this);
    }
    isDestroyed() { return Boolean(this.destroyed); }
    isVisible() { return Boolean(this.visible); }
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
  const screen = {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ workArea: { x: -1000, y: 20, width: 1000, height: 700 } }),
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, __dirname: path.join(__dirname, '..'), setTimeout, clearTimeout,
    require: (name) => name === 'electron' ? { BrowserWindow: Window, ipcMain, screen } : require(name),
  });
  const owner = new Window();
  const controller = module.exports.attachFlyout(owner, () => 'light');
  t.after(() => { if (!owner.isDestroyed()) owner.destroy(); });
  const send = (win, channel, value, frame = win.webContents.mainFrame) => {
    ipcMain.emit(channel, { sender: win.webContents, senderFrame: frame }, value);
  };
  return { owner, controller, send, windows, ipcMain };
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
  assert.deepEqual(panel.position, [-372, 452]);
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
