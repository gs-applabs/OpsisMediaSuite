'use strict';
// Main-process-only update transport. Endpoint and trust key must be supplied
// by trusted distribution configuration, never the renderer or a manifest.
const https=require('node:https');
const {MAX_MANIFEST,updateDecision}=require('./provider-compatibility');
const MAX_ENVELOPE=Math.ceil(MAX_MANIFEST/3)*4+1024;
function endpoint(value){
 if(typeof value!=='string'||value.length>2048||/[\x00-\x20\x7f]/.test(value))throw Error('invalid-update-source');
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||u.hash||u.search||!u.hostname.includes('.')||require('node:net').isIP(u.hostname))throw Error('invalid-update-source');
 return u;
}
function decodeEnvelope(raw){
 if(!Buffer.isBuffer(raw)||!raw.length||raw.length>MAX_ENVELOPE)throw Error('invalid-update-envelope');
 const doc=JSON.parse(raw.toString('utf8'));
 if(!doc||typeof doc!=='object'||Array.isArray(doc)||Object.keys(doc).sort().join(',')!=='bytes,signature'||typeof doc.bytes!=='string'||doc.bytes.length>Math.ceil(MAX_MANIFEST/3)*4||typeof doc.signature!=='string'||doc.signature.length!==88)throw Error('invalid-update-envelope');
 const bytes=Buffer.from(doc.bytes,'base64'),signature=Buffer.from(doc.signature,'base64');
 if(!bytes.length||bytes.length>MAX_MANIFEST||signature.length!==64||bytes.toString('base64')!==doc.bytes||signature.toString('base64')!==doc.signature)throw Error('invalid-update-envelope');
 return {bytes,signature};
}
async function readEnvelope(response,signal){
 try{
  const type=String(response.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  const length=Number(response.headers['content-length']||0);
  if(response.statusCode!==200||type!=='application/json'||!Number.isSafeInteger(length)||length<0||length>MAX_ENVELOPE)throw Error('update-response-denied');
  const chunks=[];let total=0;
  for await(const chunk of response){signal?.throwIfAborted();total+=chunk.length;if(total>MAX_ENVELOPE)throw Error('update-size-limit');chunks.push(chunk);}
  signal?.throwIfAborted();
  if(length&&length!==total)throw Error('update-incomplete');
  return decodeEnvelope(Buffer.concat(chunks,total));
 }finally{response.destroy();}
}
async function fetchEnvelope(source,{signal}={}){
 const u=endpoint(source),deadline=AbortSignal.timeout(15000),combined=signal?AbortSignal.any([signal,deadline]):deadline;
 combined.throwIfAborted();
 const response=await new Promise((resolve,reject)=>{
  const req=https.get(u,{signal:combined,agent:false,headers:{accept:'application/json','accept-encoding':'identity'}},resolve);
  req.on('error',reject);req.setTimeout(8000,()=>req.destroy(Error('update-idle-timeout')));
 });
 return readEnvelope(response,combined);
}
function createUpdateManager({registry,source,contractTest,clock=Date.now,transport=fetchEnvelope}={}){
 const configured=!!(registry&&source&&typeof contractTest==='function');
 const url=configured?endpoint(source).href:null;
 let lastCheck=0,controller=null,lastResult=configured?'not-checked':'not-configured';
 const status=()=>Object.freeze({configured,busy:!!controller,lastCheck,lastResult,registry:configured?registry.snapshot():null});
 return Object.freeze({
  status,
  cancel(){controller?.abort();},
  async check({enabled=false,onUse=false,manual=false,failure='none'}={}){
   if(!configured)return status();
   if(controller||!updateDecision({enabled,onUse,manual,failure,lastCheck,now:clock()}))return status();
   const active=new AbortController();controller=active;lastCheck=clock();
   try{
    const signed=await transport(url,{signal:active.signal});active.signal.throwIfAborted();
    await registry.activate(signed.bytes,signed.signature,async manifest=>{
     active.signal.throwIfAborted();const ok=await contractTest(manifest,active.signal);active.signal.throwIfAborted();return ok;
    });
    lastResult='activated';
   }catch(e){lastResult=active.signal.aborted?'cancelled':e.message==='replay'?'already-known':'update-failed';}
   finally{controller=null;}
   return status();
  }
 });
}
module.exports={endpoint,decodeEnvelope,readEnvelope,fetchEnvelope,createUpdateManager,MAX_ENVELOPE};
