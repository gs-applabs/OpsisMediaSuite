const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const EXECUTABLE = 'Opsis.WindowsDesktop.exe';

function helperPath() {
  return process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'windows-desktop', EXECUTABLE))
    ? path.join(process.resourcesPath, 'windows-desktop', EXECUTABLE)
    : path.join(__dirname, 'windows-desktop', 'out', EXECUTABLE);
}

function createWindowsDesktop(receive) {
  const executable = helperPath();
  const available = process.platform === 'win32' && fs.existsSync(executable);
  let child;
  let closed = false;
  let snapshotPending = false;
  let unavailable = false;
  const starts = [];
  function pruneStarts() {
    const now = Date.now();
    while (starts.length && now - starts[0] >= 120000) starts.shift();
    return now;
  }

  function start() {
    if (closed || !available || unavailable || child) return;
    starts.push(pruneStarts());
    let process;
    try { process = spawn(executable, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }); }
    catch {
      unavailable = starts.length >= 4;
      receive({ type: 'exit' });
      return;
    }
    child = process;
    const lines = readline.createInterface({ input: process.stdout });
    lines.on('line', (line) => {
      if (child !== process || closed || line.length > 2_000_000) return;
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message?.type === 'snapshot' || message?.type === 'error') snapshotPending = false;
      if (message && typeof message.type === 'string') receive(message);
    });
    process.stdin.on('error', () => { /* helper ended before consuming the write */ });
    function ended() {
      if (child !== process) return;
      lines.close();
      child = null;
      snapshotPending = false;
      pruneStarts();
      if (starts.length >= 4) unavailable = true;
      if (!closed) receive({ type: 'exit' });
    }
    process.once('error', ended);
    process.once('exit', ended);
  }

  function send(message) {
    start();
    if (!child?.stdin.writable) return;
    if (message.type === 'snapshot') {
      if (snapshotPending) return;
      snapshotPending = true;
    }
    child.stdin.write(JSON.stringify(message) + '\n');
  }

  function close() {
    closed = true;
    if (!child) return;
    child.stdin.end();
    const active = child;
    const force = setTimeout(() => { if (!active.exitCode) active.kill(); }, 1500);
    force.unref();
    active.once('exit', () => clearTimeout(force));
  }

  return { get available() { return available && !unavailable; }, get running() { return !!child; }, send, close };
}

module.exports = { createWindowsDesktop, helperPath };
