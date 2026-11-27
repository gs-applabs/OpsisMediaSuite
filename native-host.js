'use strict';
const path=require('node:path');
const {spawn}=require('node:child_process');
const {allowedFile,localPath}=require('./local-media-policy');
function parseHostEvent(line){
 if(typeof line!=='string'||line.length>1024)return null;
 try{const r=JSON.parse(line);if(!['ready','position','closed','error'].includes(r.event))return null;
 const n=Number(r.positionMs),duration=Number(r.durationMs);
 return {event:r.event,positionMs:Number.isFinite(n)&&n>=0?Math.min(n,360000000):0,durationMs:Number.isFinite(duration)&&duration>=0?Math.min(duration,360000000):0};
 }catch{return null;}
}
function createNativeHost({app,extensions,authorize}){
 let child=null,opening=false,state={phase:'idle'},epoch=0;
 const hostPath=()=>path.join(app.isPackaged?process.resourcesPath:path.join(__dirname,'native-player','publish'),...(app.isPackaged?['native-player']:[]),'Opsis.NativePlayer.exe');
 const available=()=>process.platform==='win32' && !!localPath(hostPath());
 const status=()=>({available:available(),...state});
 async function open(value,engine='libvlc',positionMs=0){
  if(!['libvlc','directshow'].includes(engine))return {ok:false,code:'bad-engine'};
  if(!available())return {ok:false,code:'native-not-built'};
  if(child||opening)return {ok:false,code:'native-busy'};
  const p=allowedFile(value,extensions);if(!p)return {ok:false,code:'denied'};
  opening=true;const token=++epoch;
  try{
   if(!(await authorize(p))||token!==epoch)return {ok:false,code:'denied'};
   const valid=allowedFile(p,extensions),exe=localPath(hostPath());if(!valid||!exe)return {ok:false,code:'denied'};
   const pos=Math.round(Math.max(0,Math.min(360000000,Number(positionMs)||0)));
   state={phase:'starting',engine,positionMs:pos,durationMs:0,session:token};
   return await new Promise(resolve=>{
    let proc,settled=false,buffer='',timer;
    const finish=r=>{if(settled)return;settled=true;clearTimeout(timer);resolve(r);};
    try{proc=spawn(exe,[engine==='directshow'?'--directshow':'--open',valid,String(pos)],{cwd:path.dirname(exe),shell:false,windowsHide:true,stdio:['ignore','pipe','ignore']});child=proc;}
    catch(_){state={...state,phase:'error'};finish({ok:false,code:'launch-failed'});return;}
    timer=setTimeout(()=>{if(child===proc){state={...state,phase:'error'};try{proc.kill();}catch{}}finish({ok:false,code:'native-timeout'});},120000);
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data',chunk=>{
     if(child!==proc)return;
     buffer+=chunk;if(buffer.length>16384){buffer='';return;}
     let end;while((end=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
      const event=parseHostEvent(line);if(!event)continue;
      if(event.event==='ready'){state={...state,phase:'playing',positionMs:event.positionMs,durationMs:event.durationMs};finish({ok:true,engine,status:'ready',session:token});}
      else if(event.event==='position'&&state.phase==='playing')state={...state,positionMs:event.positionMs,durationMs:event.durationMs};
      else if(event.event==='closed')state={...state,phase:'closed',positionMs:event.positionMs,durationMs:event.durationMs};
      else if(event.event==='error'){state={...state,phase:'error'};finish({ok:false,code:'native-playback-failed'});}
     }
    });
    proc.once('error',()=>{if(child===proc){child=null;state={...state,phase:'error'};}finish({ok:false,code:'launch-failed'});});
    proc.once('close',code=>{if(child===proc){child=null;state={...state,phase:state.phase==='error'||code!==0?'error':'closed'};}finish({ok:false,code:code===2?'native-cancelled':'native-exited'});});
   });
  }finally{opening=false;}
 }
 function stop(){epoch++;if(child)try{child.kill();}catch(_){}}
 if(typeof app.on==='function')app.on('before-quit',stop);
 return {available,status,open,stop};
}
module.exports={createNativeHost,parseHostEvent};
