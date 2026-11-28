#!/usr/bin/env node
'use strict';

// Renderer self-test: launches the real Electron app with WAVEFRAME_SELFTEST=1. main.js then runs window.__selfTest() inside
// the renderer (real Web Audio, real DOM, real i18n) and exits with 0 on success. Prints one PASS/FAIL line per check.
// Run with `npm run selftest` — complements `npm test` (pure unit tests) and `npm run smoke-test` (launch only).

const { spawn, execFileSync, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-selftest-')); // isolated profile: never touches the real settings

const packaged=process.env.OPSIS_PACKAGED_SELFTEST_EXE;
const ELECTRON_BIN=packaged?path.resolve(packaged):path.join(__dirname,'node_modules','.bin',process.platform==='win32'?'electron.cmd':'electron');
if (!fs.existsSync(ELECTRON_BIN)) { console.error('FAIL: Electron not installed (run npm install)'); process.exit(1); }

const child = spawn(ELECTRON_BIN, packaged?[]:['.'], {
  cwd: __dirname,
  env: { ...process.env, WAVEFRAME_SELFTEST: '1', WAVEFRAME_USER_DATA: USER_DATA, ELECTRON_ENABLE_LOGGING: '0' },
  shell: !packaged&&process.platform==='win32',
  stdio: ['ignore', 'pipe', 'pipe'],
});

// Test-only Windows process tree samples, independent from Electron metrics.
let sampler=null,profileTimer=null,profileStopped=false;
if(process.platform==='win32'&&process.env.OPSIS_RESOURCE_PROFILE==='1'&&child.pid){
  const sample=()=>{
    if(profileStopped||sampler)return;
    const ps=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    sampler=execFile(ps,['-NoProfile','-NonInteractive','-File',path.join(__dirname,'test','windows-process-profile.ps1'),'-RootPid',String(child.pid)],{windowsHide:true,timeout:12000,maxBuffer:256*1024},(err,stdout)=>{
      sampler=null;if(profileStopped)return;
      if(err){console.log('PROCESS_PROFILE_UNAVAILABLE '+String(err.code||'sample-failed'));return;}
      try{const row=JSON.parse(stdout.trim());console.log('PROCESS_PROFILE '+JSON.stringify(row));}catch{console.log('PROCESS_PROFILE_UNAVAILABLE invalid-output');}
    });
  };
  profileTimer=setInterval(sample,Number(process.env.OPSIS_SOAK_CYCLES)>120?15000:4000);sample();
}
function stopProfile(){profileStopped=true;clearInterval(profileTimer);if(sampler)try{sampler.kill();}catch{}}
let tail='',sawFailure=false;
child.stdout.on('data',d=>{const s=d.toString();const lines=(tail+s).split(/\r?\n/);tail=lines.pop().slice(-8192);if(lines.some(l=>/^FAIL/.test(l)))sawFailure=true;process.stdout.write(s);});
child.stderr.on('data', () => { /* Chromium noise */ });

const cycles=Math.max(20,Math.min(1200,Number.parseInt(process.env.OPSIS_SOAK_CYCLES,10)||20));
const timeoutMs=process.env.OPSIS_RESOURCE_SOAK==='1'?240000+cycles*6000:240000;
const timeout = setTimeout(() => {
  stopProfile();
  console.error('FAIL: self-test timed out after '+timeoutMs/1000+' s');
  try { if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGKILL'); } catch (_) { /* already gone */ }
  process.exit(1);
}, timeoutMs);

child.on('close', (code) => {
  stopProfile();clearTimeout(timeout);
  try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (_) { /* still locked */ }
  const failed = sawFailure || /^FAIL/.test(tail) || code !== 0;
  console.log(failed ? 'SELF-TEST FAILED' : 'SELF-TEST PASSED');
  process.exit(failed ? 1 : 0);
});
