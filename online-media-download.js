'use strict';
const fs=require('node:fs');
const https=require('node:https');
const path=require('node:path');
const crypto=require('node:crypto');
const {Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {onlineSource}=require('./renderer/vidlib');
const MAX_BYTES=512*1024*1024;
function candidate(value){
 const c=onlineSource(value);if(!c||c.provider!=='direct'||c.kind!=='item'||c.capability!=='direct-candidate')return null;
 const u=new URL(value.trim());if(u.protocol!=='https:'||u.port&&u.port!=='443')return null;
 const ext=path.extname(u.pathname).toLowerCase();
 if(!/^\.(mp4|mkv|webm|mov|mp3|wav|flac|m4a|aac|ogg|opus)$/.test(ext))return null;
 return {url:u,ext,host:u.hostname};
}
function publicAddress(address){
 const net=require('node:net');if(net.isIP(address)!==4)return false;
 const [a,b,c]=address.split('.').map(Number);
 return a>0&&a<224&&a!==10&&a!==127&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0))&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19||b===51&&c===100))&&!(a===192&&b===0&&c===2)&&!(a===192&&b===88&&c===99)&&!(a===203&&b===0&&c===113);
}
// Same bounded streaming writer used by production and deterministic fixtures.
async function saveResponse(response,dir,ext,{signal,maxBytes=MAX_BYTES,onProgress=()=>{}}={}){
 const type=String(response.headers['content-type']||'').split(';')[0].trim().toLowerCase();
 const length=Number(response.headers['content-length']||0);
 if(!/^\.(mp4|mkv|webm|mov|mp3|wav|flac|m4a|aac|ogg|opus)$/.test(ext)||response.statusCode!==200||!(/^(audio|video)\//.test(type)||type==='application/octet-stream')||!Number.isFinite(length)||length<0||length>maxBytes){response.destroy();throw Error('response-denied');}
 const dest=path.join(dir,'online-'+crypto.randomUUID()+ext),partial=dest+'.partial';
 let owned=false,received=0,last=0;
 const started=Date.now();
 const report=()=>{try{onProgress({received,total:length||null,bytesPerSecond:Math.round(received*1000/Math.max(1,Date.now()-started))});}catch{}};
 try{
  signal?.throwIfAborted();
  const fd=await fs.promises.open(partial,'wx');owned=true;
  const limit=new Transform({transform(chunk,enc,cb){
   received+=chunk.length;
   if(received>maxBytes)return cb(Error('size-limit'));
   if(Date.now()-last>=250){last=Date.now();report();}
   cb(null,chunk);
  }});
  await pipeline(response,limit,fd.createWriteStream(),{signal});
  signal?.throwIfAborted();
  if(!received||length&&received!==length)throw Error('incomplete-download');
  await fs.promises.link(partial,dest);
  report();return dest;
 }finally{response.destroy();if(owned)await fs.promises.unlink(partial).catch(()=>{});}
}
async function download(value,dir,{signal,maxBytes=MAX_BYTES,onProgress}={}){
 const c=candidate(value);if(!c)throw Error('unsupported-url');
 const deadline=AbortSignal.timeout(180000);
 const combined=signal?AbortSignal.any([signal,deadline]):deadline;
 combined.throwIfAborted();
 const dns=require('node:dns').promises;
 const addresses=await dns.lookup(c.host,{all:true,family:4});
 combined.throwIfAborted();
 if(!addresses.length||addresses.some(x=>!publicAddress(x.address)))throw Error('non-public-address');
 const ip=addresses[0].address;
 const response=await new Promise((resolve,reject)=>{
  const req=https.get(c.url,{signal:combined,agent:false,family:4,autoSelectFamily:false,lookup:(_host,opts,cb)=>opts.all?cb(null,[{address:ip,family:4}]):cb(null,ip,4)},resolve);
  req.on('error',reject);req.setTimeout(15000,()=>req.destroy(Error('idle-timeout')));
 });
 return saveResponse(response,dir,c.ext,{signal:combined,maxBytes,onProgress});
}
module.exports={candidate,publicAddress,download,saveResponse,MAX_BYTES};
