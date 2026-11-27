'use strict';
// OpenSubtitles.com REST API; no credentials on disk, no caller-supplied URLs.
const API='https://api.opensubtitles.com/api/v1/';
const MAX=5*1024*1024;
const VP=require('./renderer/vplib');
const clean=(v,n=160)=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,n):'';
const secret=(v,n=2048)=>typeof v==='string'&&v.length<=n&&!/[\r\n\x00]/.test(v)?v:'';
function downloadUrl(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['dl.opensubtitles.com','api.opensubtitles.com','www.opensubtitles.com'].includes(u.hostname)&&u.pathname.startsWith('/download/')?u.href:null;}catch{return null;}
}
function retrySeconds(value,now=Date.now()){
 const raw=String(value||'').trim();
 const seconds=/^\d+$/.test(raw)?Number(raw):raw?Math.ceil((Date.parse(raw)-now)/1000):NaN;
 return Number.isFinite(seconds)?Math.max(30,Math.min(86400,seconds)):60;
}
async function boundedBody(response,limit=MAX){
 const html=/\btext\/html\b/i.test(response.headers.get('content-type')||'');
 if(!response.ok||html){
  const e=new Error('http-'+response.status);
  e.code=response.status===429||response.status===406?'quota':html||response.status===403?'provider-blocked':response.status===401?'auth':'http-'+response.status;
  if(['quota','provider-blocked'].includes(e.code))e.retryAfter=retrySeconds(response.headers.get('retry-after'));
  try{await response.body?.cancel();}catch{}throw e;
 }
 const length=Number(response.headers.get('content-length'));if(length>limit){await response.body?.cancel();throw Error('too-large');}
 const reader=response.body?.getReader();if(!reader)throw Error('empty');
 const chunks=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit)throw Error('too-large');chunks.push(Buffer.from(value));}}
 finally{try{await reader.cancel();}catch{}reader.releaseLock();}
 return Buffer.concat(chunks,total);
}
// OpenSubtitles moviehash: uint64 file size + first and last 64KiB sums.
async function movieHash(file){
 const h=await require('node:fs/promises').open(file,'r');
 try{
  const st=await h.stat();if(!st.isFile()||!Number.isSafeInteger(st.size)||st.size<131072)return null;
  let sum=BigInt(st.size);
  for(const start of [0,st.size-65536]){
   const b=Buffer.alloc(65536);let offset=0;
   while(offset<b.length){const r=await h.read(b,offset,b.length-offset,start+offset);if(!r.bytesRead)return null;offset+=r.bytesRead;}
   for(let i=0;i<b.length;i+=8)sum=BigInt.asUintN(64,sum+b.readBigUInt64LE(i));
  }
  const after=await h.stat();if(after.size!==st.size||after.mtimeMs!==st.mtimeMs)return null;
  return sum.toString(16).padStart(16,'0');
 }finally{await h.close();}
}
function createProvider({fetchImpl=globalThis.fetch,decode=b=>new TextDecoder('utf-8',{fatal:true}).decode(b)}={}){
 let key='',token='',busy=false,results=new Map(),last=0,cooldownUntil=0;
 async function request(url,options={},limit=MAX){
  const res=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});
  return boundedBody(res,limit);
 }
 async function json(endpoint,method='GET',body){
  const headers={'Api-Key':key,'User-Agent':'OpsisMediaSuite v3.0.0','Accept':'application/json','Content-Type':'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  return JSON.parse((await request(API+endpoint,{method,headers,...(body?{body:JSON.stringify(body)}:{})},1024*1024)).toString('utf8'));
 }
 async function exclusive(fn){if(busy)return {ok:false,code:'busy'};if(Date.now()<cooldownUntil)return {ok:false,code:'provider-cooldown',retryAfter:Math.ceil((cooldownUntil-Date.now())/1000)};if(Date.now()-last<750)return {ok:false,code:'rate-limited'};busy=true;last=Date.now();try{return await fn();}catch(e){if(e.retryAfter)cooldownUntil=Date.now()+e.retryAfter*1000;return {ok:false,code:e.code||(['too-large','bad-subtitle','bad-link','bad-response'].includes(e.message)?e.message:'network-or-provider'),...(e.retryAfter?{retryAfter:e.retryAfter}:{})};}finally{busy=false;}}
 return {
  search(req){return exclusive(async()=>{
   results.clear();
   const query=clean(req?.query,160).trim(),lang=String(req?.language||'').toLowerCase();
   if(!query||!['el','en','fr','de','it','es','pt','ru','tr','pl','nl','sv','da','no','fi','cs','sk','hu','ro','uk'].includes(lang))return {ok:false,code:'bad-query'};
   const supplied=secret(req?.apiKey,256).trim();if(supplied&&supplied!==key){key=supplied;token='';}
   if(!key)return {ok:false,code:'api-key-required'};
   const username=secret(req?.username,256),password=secret(req?.password,512);
   if(username||password){if(!username||!password)return {ok:false,code:'credentials-required'};token='';const login=await json('login','POST',{username,password});token=secret(login.token);if(!token)return {ok:false,code:'auth'};}
   const hash=typeof req?.moviehash==='string'&&/^[a-f0-9]{16}$/.test(req.moviehash)?req.moviehash:null;
   const info=VP.releaseInfo(query);
   const q=new URLSearchParams({languages:lang,order_by:'download_count',order_direction:'desc'});
   let reply;
   if(hash){q.set('moviehash',hash);reply=await json('subtitles?'+q);q.delete('moviehash');}
   if(!reply||Array.isArray(reply.data)&&reply.data.length===0){
    q.set('query',info.season!==null&&info.title?info.title:query);
    if(info.season!==null){q.set('season_number',String(info.season));q.set('episode_number',String(info.episode));}
    reply=await json('subtitles?'+q);
   }
   if(!Array.isArray(reply.data))throw Error('bad-response');
   for(const row of reply.data.slice(0,50)){
    const a=row?.attributes;if(!a||a.language!==lang||!Array.isArray(a.files))continue;
    for(const f of a.files.slice(0,4)){
     if(!Number.isSafeInteger(f?.file_id)||f.file_id<=0||results.size>=50)continue;
     const name=clean(f.file_name)||'subtitle.srt';
     const item={id:f.file_id,name,release:clean(a.release),language:lang,hearingImpaired:!!a.hearing_impaired,hashMatch:a.moviehash_match===true,downloads:Math.max(0,Math.min(1e9,Number(a.download_count)||0)),fps:Number.isFinite(a.fps)?a.fps:null};
     const score=VP.releaseScore(query,item.release||item.name);
     const nameScore=VP.releaseScore(query,item.name);
     if(!item.hashMatch&&(score===-1000||nameScore===-1000))continue;
     item.matchScore=item.hashMatch?10000:Math.max(score,nameScore);
     results.set(item.id,item);
    }
   }
   return {ok:true,items:[...results.values()].sort((a,b)=>b.matchScore-a.matchScore||b.downloads-a.downloads)};
  });},
  download(id){return exclusive(async()=>{
   const row=results.get(id);if(!row||!key)return {ok:false,code:'not-in-results'};
   const reply=await json('download','POST',{file_id:id,sub_format:'srt'});
   const url=downloadUrl(reply.link);if(!url)throw Error('bad-link');
   // Temporary signed link only. Do not send API key or bearer to download host.
   const bytes=await request(url,{headers:{'Accept':'text/plain, application/octet-stream','User-Agent':'OpsisMediaSuite v3.0.0'}});
   const text=decode(bytes);
   if(text.includes('\0')||!VP.subtitleToVtt(text,'srt',0).cues)throw Error('bad-subtitle');
   return {ok:true,language:row.language,subtitle:{name:row.name.replace(/\.[^.]+$/,'')+'.srt',ext:'srt',text},remaining:Number.isSafeInteger(reply.remaining)?reply.remaining:null};
  });},
  clear(){if(busy)return false;key='';token='';results.clear();return true;}
 };
}
module.exports={createProvider,downloadUrl,boundedBody,movieHash,retrySeconds};
