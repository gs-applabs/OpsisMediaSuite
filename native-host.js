'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {allowedFile,localPath}=require('./local-media-policy');
function createNativeHost({app,extensions,authorize}){
 let child=null;
 const hostPath=()=>path.join(app.isPackaged?process.resourcesPath:path.join(__dirname,'native-player','publish'),...(app.isPackaged?['native-player']:[]),'Opsis.NativePlayer.exe');
 const available=()=>process.platform==='win32' && !!localPath(hostPath());
 async function open(value){
  if(!available())return {ok:false,code:'native-not-built'};
  if(child)return {ok:false,code:'native-busy'};
  const p=allowedFile(value,extensions);if(!p||!(await authorize(p)))return {ok:false,code:'denied'};
  if(child)return {ok:false,code:'native-busy'};
  const valid=allowedFile(p,extensions),exe=localPath(hostPath());if(!valid||!exe)return {ok:false,code:'denied'};
  return new Promise(resolve=>{
   let proc;
   try{proc=spawn(exe,['--open',valid],{cwd:path.dirname(exe),shell:false,windowsHide:true,stdio:'ignore'});child=proc;}
   catch(_){resolve({ok:false,code:'launch-failed'});return;}
   proc.once('spawn',()=>resolve({ok:true,engine:'libvlc',status:'launched'}));
   proc.once('error',()=>{if(child===proc)child=null;resolve({ok:false,code:'launch-failed'});});
   proc.once('close',()=>{if(child===proc)child=null;});
  });
 }
 function stop(){if(child)try{child.kill();}catch(_){}}
 if(typeof app.on==='function')app.on('before-quit',stop);
 return {available,open,stop};
}
module.exports={createNativeHost};
