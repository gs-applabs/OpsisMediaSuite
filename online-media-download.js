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
 const [a,b]=address.split('.').map(Number);
 return a>0&&a<224&&a!==10&&a!==127&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0))&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19));
}
async function download(value,dir,{signal,maxBytes=MAX_BYTES}={}){
 const c=candidate(value);if(!c)throw Error('unsupported-url');
 const dns=require('node:dns').promises;
 const addresses=await dns.lookup(c.host,{all:true,family:4});
 if(!addresses.length||addresses.some(x=>!publicAddress(x.address)))throw Error('non-public-address');
 const ip=addresses[0].address;
 const name='online-'+crypto.randomUUID()+c.ext;
 const dest=path.join(dir,name),partial=dest+'.partial';
 let owned=false;
 const deadline=AbortSignal.timeout(180000);
 const combined=signal?AbortSignal.any([signal,deadline]):deadline;
 try{
  const response=await new Promise((resolve,reject)=>{
   const req=https.get(c.url,{signal:combined,agent:false,family:4,autoSelectFamily:false,lookup:(_host,opts,cb)=>opts.all?cb(null,[{address:ip,family:4}]):cb(null,ip,4)},resolve);
   req.on('error',reject);req.setTimeout(15000,()=>req.destroy(Error('idle-timeout')));
  });
  const type=String(response.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  const length=Number(response.headers['content-length']||0);
  if(response.statusCode!==200||!(/^(audio|video)\//.test(type)||type==='application/octet-stream')||length>maxBytes){response.destroy();throw Error('response-denied');}
  const fd=await fs.promises.open(partial,'wx');owned=true;
  let received=0;
  const limit=new Transform({transform(chunk,enc,cb){received+=chunk.length;cb(received>maxBytes?Error('size-limit'):null,chunk);}});
  await pipeline(response,limit,fd.createWriteStream(),{signal:combined});
  if(!received)throw Error('empty-download');
  await fs.promises.link(partial,dest);
  await fs.promises.unlink(partial);owned=false;return dest;
 }finally{if(owned)await fs.promises.unlink(partial).catch(()=>{});}
}
module.exports={candidate,publicAddress,download,MAX_BYTES};
