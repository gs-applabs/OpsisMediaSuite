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
 return {event:r.event,...(typeof r.playing==='boolean'?{playing:r.playing}:{}),...(typeof r.muted==='boolean'?{muted:r.muted}:{}),...(Number.isFinite(r.volume)?{volume:Math.max(0,Math.min(100,r.volume))}:{}), ...(typeof r.subtitleAccepted==='boolean'?{subtitleAccepted:r.subtitleAccepted}:{}),positionMs:Number.isFinite(n)&&n>=0?Math.min(n,360000000):0,durationMs:Number.isFinite(duration)&&duration>=0?Math.min(duration,360000000):0};
 }catch{return null;}
}
// Preserve valid frames after an oversized or fragmented line; never retain an unbounded line.
function createLineFramer(onLine,max=1024){
 let partial='',discard=false;
 return chunk=>{
  if(typeof chunk!=='string')return;
  let start=0;
  while(start<chunk.length){
   const end=chunk.indexOf('\n',start),stop=end<0?chunk.length:end;
   if(!discard){
    if(partial.length+stop-start>max){partial='';discard=true;}
    else partial+=chunk.slice(start,stop);
   }
   if(end<0)break;
   if(!discard)onLine(partial.trim());
   partial='';discard=false;start=end+1;
  }
 };
}
function normalizeCommand(name,value){
 if(['toggle','pause','play','mute'].includes(name))return {name};
 if(!['seek','volume','rate'].includes(name)||typeof value!=='number'||!Number.isFinite(value))return null;
 const bounds={seek:[0,360000000],volume:[0,100],rate:[.5,4]}[name];
 if(value<bounds[0]||value>bounds[1])return null;
 return {name,value:name==='rate'?value:Math.round(value)};
}
function createNativeHost({app,extensions,authorize}){
 let child=null,opening=false,state={phase:'idle'},epoch=0,pending=null,commandId=0;
 function finishCommand(r){if(!pending)return;const p=pending;pending=null;clearTimeout(p.timer);p.resolve(r);}
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
    let proc,settled=false,timer;
    const finish=r=>{if(settled)return;settled=true;clearTimeout(timer);resolve(r);};
    try{proc=spawn(exe,[engine==='directshow'?'--directshow':'--open',valid,String(pos),...(sidecar?[sidecar]:[])],{cwd:path.dirname(exe),shell:false,windowsHide:true,stdio:['pipe','pipe','ignore']});child=proc;}
    catch(_){cleanup();state={...state,phase:'error'};finish({ok:false,code:'launch-failed'});return;}
    timer=setTimeout(()=>{if(child===proc){state={...state,phase:'error'};try{proc.kill();}catch{}}finish({ok:false,code:'native-timeout'});},120000);
    proc.stdin?.on('error',()=>{if(child===proc)finishCommand({ok:false,code:'pipe-error'});});
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data',createLineFramer(line=>{
      if(child!==proc||token!==epoch||['closed','error','stopping'].includes(state.phase))return;
      if(pending){try{const a=JSON.parse(line);if(a.event==='ack'&&a.id===pending.id&&typeof a.ok==='boolean'){finishCommand({ok:a.ok,code:a.ok?'accepted':'rejected'});return;}}catch{}}
      const event=parseHostEvent(line);if(!event)return;
      if(event.event==='ready'&&state.phase!=='starting')return;
      if(event.event==='position'&&state.phase!=='playing')return;
      const fields={};for(const k of ['playing','muted','volume'])if(Object.hasOwn(event,k))fields[k]=event[k];state={...state,...fields};
      if(event.event==='ready'){state={...state,phase:'playing',positionMs:event.positionMs,durationMs:event.durationMs,subtitleAccepted:event.subtitleAccepted??null};finish({ok:true,engine,status:'ready',session:token,subtitleAccepted:state.subtitleAccepted});}
      else if(event.event==='position'&&state.phase==='playing')state={...state,positionMs:event.positionMs,durationMs:event.durationMs};
      else if(event.event==='closed'){state={...state,phase:'closed',positionMs:event.positionMs,durationMs:event.durationMs};finishCommand({ok:false,code:'native-closed'});finish({ok:false,code:'native-closed'});}
      else if(event.event==='error'){state={...state,phase:'error'};finishCommand({ok:false,code:'native-playback-failed'});finish({ok:false,code:'native-playback-failed'});try{proc.kill();}catch{}}
    }));
    proc.once('error',()=>{cleanup();if(child===proc){child=null;state={...state,phase:'error'};}finish({ok:false,code:'launch-failed'});});
    proc.once('close',code=>{cleanup();if(child===proc)finishCommand({ok:false,code:'native-closed'});if(child===proc){child=null;state={...state,phase:state.phase==='stopping'?'closed':state.phase==='error'||code!==0?'error':'closed'};}finish({ok:false,code:code===2?'native-cancelled':'native-exited'});});
   });
  }finally{opening=false;}
 }
 function command(session,name,value){
  const cmd=normalizeCommand(name,value);if(!cmd||state.session!==session||!['libvlc','directshow'].includes(state.engine)||state.phase!=='playing'||!child?.stdin?.writable)return Promise.resolve({ok:false,code:'unavailable'});
  if(pending)return Promise.resolve({ok:false,code:'busy'});
  return new Promise(resolve=>{const id=++commandId;const timer=setTimeout(()=>finishCommand({ok:false,code:'timeout'}),3000);pending={id,timer,resolve};try{child.stdin.write(JSON.stringify({id,...cmd})+'\n');}catch{finishCommand({ok:false,code:'pipe-error'});}});
 }
 function stop(){epoch++;finishCommand({ok:false,code:'cancelled'});if(child){state={...state,phase:'stopping'};try{child.kill();}catch(_){}}}
 if(typeof app.on==='function')app.on('before-quit',stop);
 return {available,status,open,stop,command};
}
module.exports={createNativeHost,parseHostEvent,prepareSubtitle,normalizeCommand,createLineFramer};
