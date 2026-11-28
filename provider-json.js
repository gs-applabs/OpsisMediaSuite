'use strict';
// Common bounded JSON transport for metadata-only adapters. No redirects,
// no retry, no ambient credentials, no persistent agents or background jobs.
const https=require('node:https');
async function readJson(response,{maxBytes,statusError=()=> 'api-error',signal}){
 try{
  signal?.throwIfAborted();
  if(response.statusCode!==200)throw Error(statusError(response.statusCode));
  const headers=response.headers||{};
  if(!/^application\/json\b/i.test(String(headers['content-type']||'')))throw Error('invalid-response');
  if(headers['content-encoding']&&String(headers['content-encoding']).toLowerCase()!=='identity')throw Error('invalid-response');
  const rawLength=headers['content-length'];
  const expected=rawLength===undefined?null:Number(rawLength);
  if(expected!==null&&(!Number.isSafeInteger(expected)||expected<0||expected>maxBytes))throw Error('response-limit');
  const chunks=[];let size=0;
  for await(const part of response){signal?.throwIfAborted();const chunk=Buffer.isBuffer(part)?part:Buffer.from(part);size+=chunk.length;if(size>maxBytes)throw Error('response-limit');chunks.push(chunk);}
  signal?.throwIfAborted();
  if(expected!==null&&size!==expected)throw Error('invalid-response');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)));
 }finally{response.destroy();}
}
async function requestJson(url,{origins,maxBytes,headers={},signal,statusError,lib=https}){
 const u=new URL(url);
 if(u.protocol!=='https:'||u.username||u.password||u.hash||!Array.isArray(origins)||!origins.includes(u.origin)||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>2*1024*1024)throw Error('invalid-request');
 const deadline=AbortSignal.timeout(15000),combined=signal?AbortSignal.any([signal,deadline]):deadline;
 combined.throwIfAborted();
 const response=await new Promise((resolve,reject)=>{
  const req=lib.get(u,{agent:false,signal:combined,headers:{accept:'application/json','accept-encoding':'identity',...headers}},resolve);
  req.on('error',reject);req.setTimeout(8000,()=>req.destroy(Error('timeout')));
 });
 return readJson(response,{maxBytes,statusError,signal:combined});
}
module.exports={requestJson,readJson};
