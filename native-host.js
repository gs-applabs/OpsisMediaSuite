'use strict';
const path=require('node:path');
const fs=require('node:fs'),os=require('node:os');
const VP=require('./renderer/vplib');
const {decoderMode}=require('./gpu-diagnostics');
function prepareSubtitle(text){
 if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>5*1024*1024)return null;
 const parsed=VP.subtitleToVtt(text,'srt',0),body=VP.exportSubtitles(parsed.entries,'srt');
 if(!body||Buffer.byteLength(body,'utf8')>5*1024*1024)return null;
 return body;
}
const {spawn,execFile}=require('node:child_process');
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
 if(!['seek','volume','rate','subtitle-delay'].includes(name)||typeof value!=='number'||!Number.isFinite(value))return null;
 const bounds={seek:[0,360000000],volume:[0,100],rate:[.5,4],'subtitle-delay':[-7200000,7200000]}[name];
 if(value<bounds[0]||value>bounds[1])return null;
 return {name,value:name==='rate'?value:Math.round(value)};
}
function normalizeViewport(rect){
 if(rect===null)return 0;
 if(!rect||typeof rect!=='object')return null;
 const {x,y,w,h}=rect;
 if(![x,y,w,h].every(Number.isInteger)||x<0||y<0||w<=0||h<=0||x+w>1000||y+h>1000)return null;
 return ((x*1024+y)*1024+w)*1024+h;
}
function parseAudioEndpoints(text){
 try{
  if(typeof text!=='string'||text.length>65536)return null;
  const r=JSON.parse(text);
  if(r.ok!==true||!Array.isArray(r.rows)||r.rows.length>64||!Array.isArray(r.rolesKnown)||r.rolesKnown.length!==3||!r.rolesKnown.every(x=>typeof x==='boolean'))return null;
  const rows=[];
  for(const x of r.rows){
   if(!x||typeof x.name!=='string'||x.name.length>160||![1,2,4,8].includes(x.state)||!['console','multimedia','communications'].every(k=>typeof x[k]==='boolean'))return null;
   rows.push({name:x.name.replace(/[\x00-\x1f\x7f]/g,' '),state:x.state,console:x.console,multimedia:x.multimedia,communications:x.communications});
  }
  return {rows,partial:r.partial===true,rolesKnown:r.rolesKnown};
 }catch{return null;}
}
// A kill request is not proof of process exit. Wait for close (including
// stdio disposal), with a finite deadline; never signal a false successful stop.
function stopChildAndWait(proc,timeoutMs=4000){
 return new Promise(resolve=>{
  let settled=false,timer;
  const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);proc.removeListener('close',closed);resolve(ok);};
  const closed=()=>finish(true);
  proc.once('close',closed);
  timer=setTimeout(()=>finish(false),timeoutMs);
  try{proc.kill();}catch{} // still allow a concurrent close event to acknowledge
 });
}
function createNativeHost({app,extensions,authorize}){
 let child=null,opening=false,state={phase:'idle'},epoch=0,pending=null,commandId=0,subtitleSession=null,stopping=null;
 function finishCommand(r){if(!pending)return;const p=pending;pending=null;clearTimeout(p.timer);p.resolve(r);}
 const hostPath=()=>path.join(app.isPackaged?process.resourcesPath:path.join(__dirname,'native-player','publish'),...(app.isPackaged?['native-player']:[]),'Opsis.NativePlayer.exe');
 const available=()=>process.platform==='win32' && !!localPath(hostPath());
 const status=()=>({available:available(),...state});
 function audioEndpoints(){
  const exe=available()?localPath(hostPath()):null;if(!exe)return Promise.resolve(null);
  return new Promise(resolve=>{
    try{execFile(exe,['--audio-endpoints'],{cwd:path.dirname(exe),windowsHide:true,timeout:5000,maxBuffer:65536,encoding:'utf8'},(err,out)=>resolve(err?null:parseAudioEndpoints(out)));}
    catch{resolve(null);}
  });
 }
 async function open(value,engine='libvlc',positionMs=0,subtitleText=null,embedding=null,decode='auto'){
  if(!['libvlc','directshow','media-foundation'].includes(engine))return {ok:false,code:'bad-engine'};
  if(!available())return {ok:false,code:'native-not-built'};
  if(!decoderMode(decode)||(engine!=='libvlc'&&decode!=='auto'))return {ok:false,code:'bad-decoder-mode'};
  if(embedding!==null&&(engine!=='libvlc'||typeof embedding.handle!=='string'||!/^\d{1,20}$/.test(embedding.handle)||!Number.isSafeInteger(embedding.pid)||embedding.pid<=0))return {ok:false,code:'bad-embedding'};
  if(engine==='media-foundation'&&(typeof value!=='string'||!['.mp4','.m4v','.mov','.wmv','.wav','.mp3','.m4a','.aac','.wma'].includes(path.extname(value).toLowerCase())))return {ok:false,code:'unsupported-format'};
  if(child||opening)return {ok:false,code:'native-busy'};
  const p=allowedFile(value,extensions);if(!p)return {ok:false,code:'denied'};
  opening=true;const token=++epoch;
  try{
   if(!(await authorize(p))||token!==epoch)return {ok:false,code:'denied'};
   const valid=allowedFile(p,extensions),exe=localPath(hostPath());if(!valid||!exe)return {ok:false,code:'denied'};
   const pos=Math.round(Math.max(0,Math.min(360000000,Number(positionMs)||0)));
   let scratch=null,sidecar=null;
   const cleanup=()=>{if(subtitleSession?.token===token)subtitleSession=null;if(scratch){try{fs.rmSync(scratch,{recursive:true,force:true});}catch{}scratch=null;}};
   if(engine==='libvlc'){
     const body=subtitleText===null?'':prepareSubtitle(subtitleText);if(body===null)return {ok:false,code:'bad-subtitle'};
     try{scratch=fs.mkdtempSync(path.join(os.tmpdir(),'opsis-native-sub-'));sidecar=path.join(scratch,'synced.srt');fs.writeFileSync(sidecar,body,{encoding:'utf8',flag:'wx',mode:0o600});subtitleSession={token,dir:scratch,revision:0,bytes:Buffer.byteLength(body,'utf8')};}
     catch{cleanup();return {ok:false,code:'subtitle-temp-failed'};}
   }
   state={phase:'starting',engine,decoderRequested:decode,embedded:embedding!==null,positionMs:pos,durationMs:0,session:token,subtitleTransferred:engine==='libvlc'&&subtitleText!==null};
   return await new Promise(resolve=>{
    let proc,settled=false,timer;
    const finish=r=>{if(settled)return;settled=true;clearTimeout(timer);resolve(r);};
    try{proc=spawn(exe,[engine==='directshow'?'--directshow':engine==='media-foundation'?'--mf-play':embedding?'--embed':'--open',valid,String(pos),...(sidecar?[sidecar]:[]),...(embedding?[embedding.handle,String(embedding.pid)]:[]),...(engine==='libvlc'?['--decode-mode',decode]:[])],{cwd:path.dirname(exe),shell:false,windowsHide:true,stdio:['pipe','pipe','ignore']});child=proc;}
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
      if(event.event==='ready'){state={...state,phase:'playing',positionMs:event.positionMs,durationMs:event.durationMs,subtitleAccepted:event.subtitleAccepted??null};finish({ok:true,engine,decoderRequested:state.decoderRequested,embedded:state.embedded,status:'ready',session:token,subtitleAccepted:state.subtitleAccepted});}
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
  const cmd=normalizeCommand(name,value);if(!cmd||state.session!==session||!['libvlc','directshow','media-foundation'].includes(state.engine)||state.phase!=='playing'||!child?.stdin?.writable)return Promise.resolve({ok:false,code:'unavailable'});
  if(name==='subtitle-delay'&&state.engine!=='libvlc')return Promise.resolve({ok:false,code:'unsupported-engine'});
  return sendCommand(cmd);
 }
 function sendCommand(cmd){
  if(pending)return Promise.resolve({ok:false,code:'busy'});
  return new Promise(resolve=>{const id=++commandId;const timer=setTimeout(()=>finishCommand({ok:false,code:'timeout'}),3000);pending={id,timer,resolve};try{child.stdin.write(JSON.stringify({id,...cmd})+'\n');}catch{finishCommand({ok:false,code:'pipe-error'});}});
 }
 function updateViewport(session,rect){
  const value=normalizeViewport(rect);
  if(value===null||state.session!==session||state.phase!=='playing'||!state.embedded||!child?.stdin?.writable)return Promise.resolve({ok:false,code:'unavailable'});
  if(pending)return Promise.resolve({ok:false,code:'busy'});
  return sendCommand({name:'viewport',value});
 }
 function replaceSubtitle(session,text){
  const s=subtitleSession;
  if(!s||s.token!==session||state.session!==session||state.phase!=='playing'||state.engine!=='libvlc'||!child?.stdin?.writable)return Promise.resolve({ok:false,code:'unavailable'});
  if(pending)return Promise.resolve({ok:false,code:'busy'});
  if(text===null)return sendCommand({name:'subtitle-off'});
  const body=prepareSubtitle(text);if(!body)return Promise.resolve({ok:false,code:'bad-subtitle'});
  const bytes=Buffer.byteLength(body,'utf8');
  if(s.revision>=24||s.bytes+bytes>32*1024*1024)return Promise.resolve({ok:false,code:'subtitle-session-limit'});
  const revision=++s.revision;
  try{fs.writeFileSync(path.join(s.dir,'revision-'+revision+'.srt'),body,{encoding:'utf8',flag:'wx',mode:0o600});s.bytes+=bytes;}
  catch{return Promise.resolve({ok:false,code:'subtitle-temp-failed'});}
  // Retain every staged revision until exit: LibVLC may still read it.
  return sendCommand({name:'subtitle-replace',value:revision});
 }
 function stop(){
  epoch++;finishCommand({ok:false,code:'cancelled'});
  const proc=child;
  // No child can be spawned by an old pending authorization: epoch invalidates it.
  if(!proc)return Promise.resolve(true);
  if(stopping?.proc===proc)return stopping.promise;
  state={...state,phase:'stopping'};
  const operation={proc,promise:null};
  operation.promise=stopChildAndWait(proc).finally(()=>{if(stopping===operation)stopping=null;});
  stopping=operation;
  return operation.promise;
 }
 if(typeof app.on==='function')app.on('before-quit',stop);
 return {available,status,open,stop,command,replaceSubtitle,updateViewport,audioEndpoints};
}
module.exports={createNativeHost,parseHostEvent,prepareSubtitle,normalizeCommand,createLineFramer,normalizeViewport,parseAudioEndpoints,stopChildAndWait};
