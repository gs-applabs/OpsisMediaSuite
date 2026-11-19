'use strict';
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createWindowsDesktop, helperPath } = require('../windows-desktop');

if (process.platform !== 'win32') process.exit(0);
console.log(execFileSync(helperPath(), ['--test-taskbar-placement'], { encoding: 'utf8', timeout: 15_000 }).trim());
console.log(execFileSync(helperPath(), ['--test-explorer-taskbar'], { encoding: 'utf8', timeout: 15_000 }).trim());
const desktop = createWindowsDesktop((message) => {
  if (message.type === 'exit' || message.type === 'error') {
    clearTimeout(timeout);
    desktop.close();
    throw new Error('Windows desktop helper failed while taking a snapshot');
  }
  if (message.type !== 'snapshot') return;
  clearTimeout(timeout);
  desktop.close();
  assert.ok(Object.hasOwn(message, 'mixer'));
  assert.ok(message.media === null || Array.isArray(message.media.sessions));
  assert.ok(message.mixer === null || (Number.isFinite(message.mixer.master.volume) && Array.isArray(message.mixer.apps)));
  console.log('Windows desktop helper returned media and audio state');
});
assert.ok(desktop.available, 'Build the Windows desktop helper first');
const timeout = setTimeout(() => {
  desktop.close();
  throw new Error('Windows desktop helper did not answer');
}, 15_000);
desktop.send({ type: 'configure', locks: false, mediaKeys: false, widget: false });
desktop.send({ type: 'snapshot', mixer: true });
