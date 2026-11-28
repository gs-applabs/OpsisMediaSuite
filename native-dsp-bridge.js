'use strict';
const path=require('node:path');
const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {localPath}=require('./local-media-policy');
const HEADER=96,BLOCK_FRAMES=32768,MAX_SECONDS=300,MAX_BYTES=128*1024*1024;
function makeHeader(rate,channels,frames,config){
 if(!Number.isInteger(rate)||rate<44100||rate>96000||![1,2].includes(channels)||
    !Number.isSafeInteger(frames)||frames<1||frames>rate*MAX_SECONDS||frames*channels*4>MAX_BYTES)return null;
 const c=config?.base;
 if(config?.version!==2||c?.version!==1||![0,1].includes(c.enabled)||!Array.isArray(c.eq_db)||c.eq_db.length!==10||
    ![0,1,2,3].includes(config.compressor_mode)||![0,1].includes(config.limiter))return null;
 const vals=[...c.eq_db,c.bass_db,c.presence_percent,c.balance_percent,c.surround_percent,c.preamp_db,config.ambience_percent,config.exciter_percent];
 const limits=[...Array.from({length:11},()=>[-12,12]),[0,100],[-100,100],[0,100],[-24,12],[0,100],[0,100]];
 if(!vals.every((v,i)=>typeof v==='number'&&Number.isFinite(v)&&v>=limits[i][0]&&v<=limits[i][1]))return null;
 const h=Buffer.alloc(HEADER);
 h.write('ODP2',0,'ascii');h.writeUInt32LE(rate,4);h.writeUInt32LE(channels,8);h.writeUInt32LE(frames,12);h.writeUInt32LE(c.enabled,16);
 vals.slice(0,15).forEach((v,i)=>h.writeFloatLE(v,20+i*4));
 h.writeUInt32LE(config.compressor_mode,80);h.writeFloatLE(config.ambience_percent,84);h.writeFloatLE(config.exciter_percent,88);h.writeUInt32LE(config.limiter,92);
 return h;
}
// Compatibility helper for unit tests; not used by the streaming renderer.
function makeRequest(rate,channels,pcm,cfg){
 if(!(pcm instanceof Uint8Array)||![1,2].includes(channels))return null;
 const h=makeHeader(rate,channels,pcm.byteLength/(channels*4),cfg);
 return h?Buffer.concat([h,Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength)]):null;
}
function createDspBridge({app}){
 const exe=()=>!app.isPackaged&&process.platform==='win32'?localPath(path.join(__dirname,'native-dsp-build','Release','opsis_dsp_pcm.exe')):null;
 let active=null;
 const error=code=>({ok:false,code});
 function abort(s,code='native-dsp-cancelled'){
  if(!s||s.failed)return;
  s.failed=true;clearTimeout(s.idle);clearTimeout(s.total);
  const p=s.pending;s.pending=null;if(p)p.resolve(error(code));
  try{s.child.kill();}catch{}
 }
 function arm(s){clearTimeout(s.idle);s.idle=setTimeout(()=>abort(s,'native-dsp-timeout'),15000);s.idle.unref?.();}
 function open(rate,channels,frames,cfg){
  if(active)return error('native-dsp-busy');
  const file=exe();if(!file)return error('native-dsp-unavailable');
  const header=makeHeader(rate,channels,frames,cfg);if(!header)return error('native-dsp-invalid');
  try{
   const child=spawn(file,[],{cwd:path.dirname(file),windowsHide:true,stdio:['pipe','pipe','ignore']});
   const s={child,token:randomBytes(16).toString('hex'),remaining:frames,channels,pending:null,failed:false,finishing:false};
   active=s;
   child.on('error',()=>abort(s,'native-dsp-failed'));
   child.stdin.on('error',()=>abort(s,'native-dsp-failed'));
   child.stdout.on('error',()=>abort(s,'native-dsp-failed'));
   child.stdout.on('data',data=>{
    if(s.failed)return;
    const p=s.pending;
    if(!p||s.finishing||p.received+data.length>p.out.length){abort(s,'native-dsp-invalid-output');return;}
    data.copy(p.out,p.received);p.received+=data.length;
    if(p.received===p.out.length){
     for(let i=0;i<p.out.length;i+=4)if(!Number.isFinite(p.out.readFloatLE(i))){abort(s,'native-dsp-invalid-output');return;}
     s.remaining-=p.frames;s.pending=null;arm(s);p.resolve({ok:true,pcm:new Uint8Array(p.out)});
    }
   });
   child.on('close',(code,signal)=>{
    clearTimeout(s.idle);clearTimeout(s.total);
    if(active===s)active=null;
    const p=s.pending;s.pending=null;
    if(p)p.resolve(!s.failed&&s.finishing&&code===0&&!signal&&s.remaining===0?{ok:true}:error('native-dsp-failed'));
   });
   s.total=setTimeout(()=>abort(s,'native-dsp-timeout'),180000);s.total.unref?.();arm(s);
   child.stdin.write(header);
   return {ok:true,session:s.token,blockFrames:BLOCK_FRAMES};
  }catch{if(active)abort(active,'native-dsp-failed');return error('native-dsp-failed');}
 }
 function match(token){return active&&!active.failed&&active.token===token?active:null;}
 function chunk(token,pcm){
  const s=match(token);if(!s||s.pending||s.finishing)return Promise.resolve(error('native-dsp-session'));
  const frames=Math.min(BLOCK_FRAMES,s.remaining),size=frames*s.channels*4;
  if(!frames||!(pcm instanceof Uint8Array)||pcm.byteLength!==size){abort(s,'native-dsp-invalid');return Promise.resolve(error('native-dsp-invalid'));}
  return new Promise(resolve=>{
   s.pending={frames,out:Buffer.alloc(size),received:0,resolve};arm(s);
   try{s.child.stdin.write(Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength));}catch{abort(s,'native-dsp-failed');}
  });
 }
 function finish(token){
  const s=match(token);if(!s||s.pending||s.finishing)return Promise.resolve(error('native-dsp-session'));
  if(s.remaining!==0){abort(s,'native-dsp-incomplete');return Promise.resolve(error('native-dsp-incomplete'));}
  return new Promise(resolve=>{s.finishing=true;s.pending={resolve};arm(s);try{s.child.stdin.end();}catch{abort(s,'native-dsp-failed');}});
 }
 function cancel(token){if(active&&(token===undefined||active.token===token)){abort(active);return true;}return false;}
 async function render(rate,channels,pcm,cfg){
  if(!(pcm instanceof Uint8Array)||![1,2].includes(channels))return error('native-dsp-invalid');
  const session=open(rate,channels,pcm.byteLength/(channels*4),cfg);
  if(!session.ok)return session;
  const output=new Uint8Array(pcm.byteLength),stride=BLOCK_FRAMES*channels*4;
  try{
   for(let pos=0;pos<pcm.byteLength;pos+=stride){
    const res=await chunk(session.session,pcm.subarray(pos,pos+stride));if(!res.ok)return res;output.set(res.pcm,pos);
   }
   const done=await finish(session.session);return done.ok?{ok:true,pcm:output}:done;
  }finally{cancel(session.session);}
 }
 return {available:()=>!!exe(),open,chunk,finish,cancel,render,busy:()=>!!active};
}
module.exports={makeHeader,makeRequest,createDspBridge,BLOCK_FRAMES,MAX_SECONDS,MAX_BYTES};
