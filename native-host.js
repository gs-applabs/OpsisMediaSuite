'use strict';
const path=require('node:path');
const fs=require('node:fs'),os=require('node:os');
const VP=require('./renderer/vplib');
function prepareSubtitle(text){
 if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>5*1024*1024)return null;
 const parsed=VP.subtitleToVtt(text,'srt',0),body=VP.exportSubtitles(parsed.entries,'srt');
 if(!body||Buffer.byteLength(body,'utf8')>5*1024*1024)return null;
 return body;
}
const {spawn}=require('node:child_process');
const {allowedFile,localPath}=require('./local-media-policy');
function parseHostEvent(line){
 if(typeof line!=='string'||line.length>1024)return null;
 try{const r=JSON.parse(line);if(!['ready','position','closed','error'].includes(r.event))return null;
 const n=Number(r.positionMs),duration=Number(r.durationMs);
 return {event:r.event, ...(typeof r.subtitleAccepted==='boolean'?{subtitleAccepted:r.subtitleAccepted}:{}),positionMs:Number.isFinite(n)&&n>=0?Math.min(n,360000000):0,durationMs:Number.isFinite(duration)&&duration>=0?Math.min(duration,360000000):0};
 }catch{return null;}
}
function createNativeHost({app,extensions,authorize}){
 let child=null,opening=false,state={phase:'idle'},epoch=0;
 const hostPath=()=>path.join(app.isPackaged?process.resourcesPath:path.join(__dirname,'native-player','publish'),...(app.isPackaged?['native-player']:[]),'Opsis.NativePlayer.exe');
 const available=()=>process.platform==='win32' && !!localPath(hostPath());
 const status=()=>({available:available(),...state});
 async function open(value,engine='libvlc',positionMs=0,subtitleText=null){
  if(!['libvlc','directshow'].includes(engine))return {ok:false,code:'bad-engine'};
  if(!available())return {ok:false,code:'native-not-built'};
  if(child||opening)return {ok:false,code:'native-busy'};
  const p=allowedFile(value,extensions);if(!p)return {ok:false,code:'denied'};
  opening=true;const token=++epoch;
  try{
   if(!(await authorize(p))||token!==epoch)return {ok:false,code:'denied'};
   const valid=allowedFile(p,extensions),exe=localPath(hostPath());if(!valid||!exe)return {ok:false,code:'denied'};
   const pos=Math.round(Math.max(0,Math.min(360000000,Number(positionMs)||0)));
   let scratch=null,sidecar=null;
   const cleanup=()=>{if(scratch){try{fs.rmSync(scratch,{recursive:true,force:true});}catch{}scratch=null;}};
   if(engine==='libvlc'&&subtitleText!==null){
     const body=prepareSubtitle(subtitleText);if(!body)return {ok:false,code:'bad-subtitle'};
     try{scratch=fs.mkdtempSync(path.join(os.tmpdir(),'opsis-native-sub-'));sidecar=path.join(scratch,'synced.srt');fs.writeFileSync(sidecar,body,{encoding:'utf8',flag:'wx',mode:0o600});}
     catch{cleanup();return {ok:false,code:'subtitle-temp-failed'};}
   }
   state={phase:'starting',engine,positionMs:pos,durationMs:0,session:token,subtitleTransferred:!!sidecar};
   return await new Promise(resolve=>{
    let proc,settled=false,buffer='',timer;
    const finish=r=>{if(settled)return;settled=true;clearTimeout(timer);resolve(r);};
    try{proc=spawn(exe,[engine==='directshow'?'--directshow':'--open',valid,String(pos),...(sidecar?[sidecar]:[])],{cwd:path.dirname(exe),shell:false,windowsHide:true,stdio:['ignore','pipe','ignore']});child=proc;}
    catch(_){cleanup();state={...state,phase:'error'};finish({ok:false,code:'launch-failed'});return;}
    timer=setTimeout(()=>{if(child===proc){state={...state,phase:'error'};try{proc.kill();}catch{}}finish({ok:false,code:'native-timeout'});},120000);
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data',chunk=>{
     if(child!==proc)return;
     buffer+=chunk;if(buffer.length>16384){buffer='';return;}
     let end;while((end=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
      const event=parseHostEvent(line);if(!event)continue;
      if(event.event==='ready'){state={...state,phase:'playing',positionMs:event.positionMs,durationMs:event.durationMs,subtitleAccepted:event.subtitleAccepted??null};finish({ok:true,engine,status:'ready',session:token,subtitleAccepted:state.subtitleAccepted});}
      else if(event.event==='position'&&state.phase==='playing')state={...state,positionMs:event.positionMs,durationMs:event.durationMs};
      else if(event.event==='closed')state={...state,phase:'closed',positionMs:event.positionMs,durationMs:event.durationMs};
      else if(event.event==='error'){state={...state,phase:'error'};finish({ok:false,code:'native-playback-failed'});}
     }
    });
    proc.once('error',()=>{cleanup();if(child===proc){child=null;state={...state,phase:'error'};}finish({ok:false,code:'launch-failed'});});
    proc.once('close',code=>{cleanup();if(child===proc){child=null;state={...state,phase:state.phase==='error'||code!==0?'error':'closed'};}finish({ok:false,code:code===2?'native-cancelled':'native-exited'});});
   });
  }finally{opening=false;}
 }
 function stop(){epoch++;if(child)try{child.kill();}catch(_){}}
 if(typeof app.on==='function')app.on('before-quit',stop);
 return {available,status,open,stop};
}
module.exports={createNativeHost,parseHostEvent,prepareSubtitle};
