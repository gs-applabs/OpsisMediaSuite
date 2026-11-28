'use strict';
// Run with electron test/audio-worklet/launch.js after building fixture WASM.
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const timeout=setTimeout(()=>{console.error('FAIL worklet timeout');app.exit(1);},60000);
app.whenReady().then(async()=>{
 let win;
 try{
  const bytes=fs.readFileSync(path.join(__dirname,'opsis-dsp.wasm'));
  if(bytes.length>4*1024*1024)throw Error('unexpected WASM size');
  win=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'opsis-dsp-test'}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  const ses=win.webContents.session;ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
  ses.webRequest.onBeforeRequest((details,cb)=>cb({cancel:!details.url.startsWith('file:')}));
  await win.loadFile(path.join(__dirname,'index.html'));
  const r=await win.webContents.executeJavaScript('window.runDspFixture('+JSON.stringify([...bytes])+')');
  console.log('PASS isolated AudioWorklet WASM offline response '+JSON.stringify(r));
  clearTimeout(timeout);app.exit(0);
 }catch(e){console.error('FAIL '+e.stack);clearTimeout(timeout);app.exit(1);}
});
