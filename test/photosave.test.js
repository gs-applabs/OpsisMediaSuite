'use strict';
// photo:save IPC handler, run against a minimal in-process stub of the electron module (no real Electron, no user data: temp folder only).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const handlers = {};
let target = '',openTarget=null;
const stub = {
  ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; }, on() {} },
  dialog: { showSaveDialog: async () => ({ canceled: false, filePath: target }), showOpenDialog: async () => openTarget?({canceled:false,filePaths:[openTarget]}):({canceled:true}) },
  protocol: { handle() {}, registerSchemesAsPrivileged() {} },
  net: {},
  app: { getPath: () => os.tmpdir(), once() {} },
};
const origLoad = Module._load;
Module._load = function (request, ...rest) { return request === 'electron' ? stub : origLoad.call(this, request, ...rest); };
const M = require('../media-main.js');
Module._load = origLoad;

test('photo save writes only the supplied ArrayBuffer view', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-photo-'));
  const sender = {};
  M.init({ getMainWin: () => ({ isDestroyed: () => false, webContents: sender }), resolveFfmpegPath: () => null });
  const save = handlers['photo:save'];
  assert.equal(typeof save, 'function');
  const big = new Uint8Array([9, 9, 1, 2, 3, 9]);
  target = path.join(dir, 'a.png');
  assert.equal((await save({ sender }, { format: 'png', name: 'x', bytes: big.subarray(2, 5) })).ok, true);
  assert.deepEqual([...fs.readFileSync(target)], [1, 2, 3]);
  target = path.join(dir, 'b.png');
  assert.equal((await save({ sender }, { format: 'png', name: 'x', bytes: new DataView(big.buffer, 1, 2) })).ok, true);
  assert.deepEqual([...fs.readFileSync(target)], [9, 1]);
  target = path.join(dir, 'c.png');
  assert.equal((await save({ sender }, { format: 'png', name: 'x', bytes: new Uint8Array([7, 8]).buffer })).ok, true);
  assert.deepEqual([...fs.readFileSync(target)], [7, 8]);
  target = path.join(dir, 'd.png');
  assert.equal((await save({ sender: {} }, { format: 'png', name: 'x', bytes: new Uint8Array([1]).buffer })).ok, false);
  assert.equal(fs.existsSync(target), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('photo read requires a picker grant and does not expose a different local image',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wf-photo-read-'));const sender={mainFrame:{}},e={sender,senderFrame:sender.mainFrame};
 M.init({getMainWin:()=>({isDestroyed:()=>false,webContents:sender}),resolveFfmpegPath:()=>null});
 const a=path.join(dir,'a.png'),b=path.join(dir,'b.png');
 try{
  fs.writeFileSync(a,Buffer.from([1,2,3]));fs.writeFileSync(b,Buffer.from([4,5,6]));
  assert.equal(await handlers['photo:read'](e,a),null);
  openTarget=a;const picked=await handlers['photo:pick'](e);assert.ok(picked);
  assert.deepEqual([...new Uint8Array((await handlers['photo:read'](e,picked)).bytes)],[1,2,3]);
  assert.equal(await handlers['photo:read'](e,b),null);
  assert.equal(await handlers['photo:read']({sender,senderFrame:{}},picked),null);
 }finally{openTarget=null;fs.rmSync(dir,{recursive:true,force:true});}
});


test('photo export refuses existing destinations and removes only owned scratch',async()=>{
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'opsis-photo-safe-'))),sender={mainFrame:{}},e={sender,senderFrame:sender.mainFrame};
 M.init({getMainWin:()=>({isDestroyed:()=>false,webContents:sender}),resolveFfmpegPath:()=>null});
 try{
  target=path.join(dir,'original.png');fs.writeFileSync(target,Buffer.from([9,8,7]));
  const req={format:'png',name:'original',bytes:new Uint8Array([1,2,3])};
  assert.deepEqual(await handlers['photo:save'](e,req),{ok:false,code:'exists'});
  assert.deepEqual([...fs.readFileSync(target)],[9,8,7]);
  target=path.join(dir,'new.png');assert.equal((await handlers['photo:save'](e,req)).ok,true);
  assert.deepEqual([...fs.readFileSync(target)],[1,2,3]);assert.deepEqual(fs.readdirSync(dir).sort(),['new.png','original.png']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});


test('dropped photo header uses the shared date token without granting arbitrary file reads',async()=>{
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'opsis-photo-date-'))),sender={mainFrame:{}},e={sender,senderFrame:sender.mainFrame};
 M.init({getMainWin:()=>({isDestroyed:()=>false,webContents:sender}),resolveFfmpegPath:()=>null});
 const P=require('../photo-metadata'),date='2024:07:18 09:14:30',jpeg=Buffer.from([0xff,0xd8,0xff,0xd9]);
 const original=P.attachCaptureDate(jpeg,'jpeg',date),source=path.join(dir,'source.jpg');
 try{
  fs.writeFileSync(source,original);
  const issue=handlers['photo:date-from-blob'],save=handlers['photo:save'];
  assert.equal(issue(e,source),null);
  assert.equal(issue(e,new Uint8Array(1024*1024+1)),null);
  assert.equal(issue({sender,senderFrame:{}},original),null);
  const padded=Buffer.concat([Buffer.alloc(9),original,Buffer.alloc(9)]);
  const result=issue(e,padded.subarray(9,9+original.length));
  assert.equal(result.captureDate,date);assert.match(result.captureToken,/^[a-f0-9]{32}$/);
  assert.equal(await handlers['photo:read'](e,source),null);
  target=path.join(dir,'edited.jpg');
  assert.equal((await save(e,{format:'jpeg',name:'source',bytes:jpeg,captureToken:result.captureToken})).ok,true);
  assert.equal(P.captureDate(fs.readFileSync(target)),date);
  assert.deepEqual(fs.readFileSync(source),original);
  target=path.join(dir,'denied.jpg');
  assert.equal((await save(e,{format:'jpeg',bytes:jpeg,captureToken:'0'.repeat(32)})).code,'capture-date-unavailable');
  assert.equal(fs.existsSync(target),false);
  openTarget=source;const picked=await handlers['photo:pick'](e);const read=await handlers['photo:read'](e,picked);
  assert.equal(read.captureDate,date);assert.match(read.captureToken,/^[a-f0-9]{32}$/);
 }finally{openTarget=null;fs.rmSync(dir,{recursive:true,force:true});}
});
