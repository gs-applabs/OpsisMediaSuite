'use strict';
const VP=require('./renderer/vplib');
const {boundedBody}=require('./subtitle-provider');
const {canonicalSrt}=require('./subtitle-sidecar');
const MAX=5*1024*1024;
const langs=new Set(['el','en','fr','de','it','es','pt','ru','tr','pl','nl','sv','da','no','fi','cs','sk','hu','ro','uk']);
function subdlLink(value){
 if(typeof value!=='string'||!/^\/subtitle\/[a-zA-Z0-9_-]{1,128}\/[a-zA-Z0-9_-]{1,128}$/.test(value))return null;
 return 'https://dl.subdl.com'+value;
}
function createSubdl({fetchImpl=globalThis.fetch,decode=b=>new TextDecoder('utf-8',{fatal:true}).decode(b)}={}){
 let key='',busy=false,last=0,cooldown=0,rows=new Map();
 async function run(fn){
  if(busy)return {ok:false,code:'busy'};
  if(Date.now()<cooldown)return {ok:false,code:'provider-cooldown',retryAfter:Math.ceil((cooldown-Date.now())/1000)};
  if(Date.now()-last<750)return {ok:false,code:'rate-limited'};
  busy=true;last=Date.now();
  try{return await fn();}catch(e){if(e.retryAfter)cooldown=Date.now()+e.retryAfter*1000;return {ok:false,code:e.code||'network-or-provider',...(e.retryAfter?{retryAfter:e.retryAfter}:{})};}finally{busy=false;}
 }
 async function request(url,limit,accept){
  return boundedBody(await fetchImpl(url,{headers:{Accept:accept},redirect:'error',signal:AbortSignal.timeout(20000)}),limit);
 }
 return {
  search(req){return run(async()=>{
   rows.clear();
   const query=typeof req?.query==='string'?req.query.trim().slice(0,160):'',lang=req?.language;
   if(!query||!langs.has(lang))return {ok:false,code:'bad-query'};
   if(typeof req.apiKey==='string'&&req.apiKey.trim()&&req.apiKey.length<=256&&!/[\x00-\x20\x7f]/.test(req.apiKey.trim()))key=req.apiKey.trim();
   if(!key)return {ok:false,code:'api-key-required'};
   const info=VP.releaseInfo(query);
   const q=new URLSearchParams({api_key:key,film_name:info.title||query,languages:lang.toUpperCase(),unpack:'1',subs_per_page:'30',client:'custom_integration'});
   if(info.season!==null){q.set('type','tv');q.set('season_number',String(info.season));q.set('episode_number',String(info.episode));}
   const data=JSON.parse((await request('https://api.subdl.com/api/v1/subtitles?'+q,1024*1024,'application/json')).toString('utf8'));
   if(data.status!==true||!Array.isArray(data.subtitles))return {ok:false,code:'provider-response'};
   let id=0;
   for(const pack of data.subtitles.slice(0,30)){
    if(!Array.isArray(pack?.unpack_files))continue;
    for(const f of pack.unpack_files.slice(0,100)){
     if(rows.size>=50)break;
     if(typeof f?.language!=='string'||f.language.toUpperCase()!==lang.toUpperCase())continue;
     const link=subdlLink(f.url),ext=String(f.format||'').toLowerCase();
     if(!link||!['srt','vtt','ass','ssa'].includes(ext)||!Number.isSafeInteger(f.size)||f.size<=0||f.size>MAX)continue;
     if(info.season!==null&&(Number(f.season)!==info.season||Number(f.episode)!==info.episode))continue;
     const name=String(f.name||'subtitle.'+ext).replace(/[\x00-\x1f\x7f]/g,' ').slice(0,160);
     const release=String(f.release_name||pack.release_name||name).replace(/[\x00-\x1f\x7f]/g,' ').slice(0,160);
     const score=VP.releaseScore(query,release),nameScore=VP.releaseScore(query,name);
     if(score===-1000||nameScore===-1000)continue;
     const item={id:++id,name,release,language:lang,hearingImpaired:!!f.hi,hashMatch:false,downloads:0,matchScore:Math.max(score,nameScore)};
     rows.set(id,{item,link,ext});
    }
   }
   return {ok:true,items:[...rows.values()].map(x=>x.item).sort((a,b)=>b.matchScore-a.matchScore)};
  });},
  download(id){return run(async()=>{
   const row=rows.get(id);if(!row)return {ok:false,code:'not-in-results'};
   // Public individual file URL only. No API key forwarded to download host.
   const bytes=await request(row.link,MAX,'text/plain, application/octet-stream');
   const body=canonicalSrt({ext:row.ext,text:decode(bytes)});
   if(!body)return {ok:false,code:'bad-subtitle'};
   return {ok:true,language:row.item.language,subtitle:{ext:'srt',name:row.item.name.replace(/\.[^.]+$/,'')+'.srt',text:body},remaining:null};
  });},
  clear(){if(busy)return false;key='';rows.clear();return true;}
 };
}
module.exports={createSubdl,subdlLink};
