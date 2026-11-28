'use strict';
// YouTube Data API metadata only; never returns media URLs or downloads audio/video.
const JSONTransport=require('./provider-json');
const VIDEO=/^[A-Za-z0-9_-]{11}$/,PLAYLIST=/^[A-Za-z0-9_-]{2,160}$/;
const MAX_PAGE=50,MAX_ITEMS=200,MAX_BYTES=1024*1024;
function identify(value){
 if(typeof value!=='string'||value.length>2048||/[\x00-\x1f\x7f]/.test(value.trim()))return null;
 let u;try{u=new URL(value.trim());}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'].includes(u.hostname))return null;
 const list=u.searchParams.get('list');
 if(list)return PLAYLIST.test(list)?{kind:'playlist',id:list}:null;
 const id=u.hostname==='youtu.be'?u.pathname.slice(1):u.pathname==='/watch'?u.searchParams.get('v'):/^\/(?:shorts|live|embed)\/([^/]+)\/?$/.exec(u.pathname)?.[1];
 return VIDEO.test(id||'')?{kind:'video',id}:null;
}
function requestUrl(source,page){
 const list=source.kind==='playlist',u=new URL('https://www.googleapis.com/youtube/v3/'+(list?'playlistItems':'videos'));
 u.searchParams.set('part','snippet');
 if(list){u.searchParams.set('playlistId',source.id);u.searchParams.set('maxResults',String(MAX_PAGE));u.searchParams.set('fields','nextPageToken,items(snippet(title,videoOwnerChannelTitle,channelTitle,resourceId/videoId,position))');if(page)u.searchParams.set('pageToken',page);}
 else{u.searchParams.set('id',source.id);u.searchParams.set('fields','items(id,snippet(title,channelTitle))');}
 return u;
}
function requestJson(url,key,signal){
 return JSONTransport.requestJson(url,{origins:['https://www.googleapis.com'],maxBytes:MAX_BYTES,headers:{'x-goog-api-key':key},signal,statusError:code=>code===403?'api-denied':code===429?'rate-limit':'api-error'});
}
const clean=x=>typeof x==='string'?x.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,500):'';
async function preview(value,key,{signal,transport=requestJson}={}){
 const source=identify(value);
 if(!source||typeof key!=='string'||!/^[A-Za-z0-9_-]{20,128}$/.test(key))throw Error('invalid-source-or-key');
 const deadline=AbortSignal.timeout(25000),combined=signal?AbortSignal.any([signal,deadline]):deadline;
 const items=[],seen=new Set();let page=null,truncated=false;
 for(let n=0;n<4;n++){
  combined.throwIfAborted();const data=await transport(requestUrl(source,page),key,combined);combined.throwIfAborted();
  if(!Array.isArray(data?.items)||data.items.length>MAX_PAGE)throw Error('invalid-response');
  for(const entry of data.items){
   const s=entry?.snippet,id=source.kind==='playlist'?s?.resourceId?.videoId:entry?.id;
   if(!VIDEO.test(id||'')||!s||source.kind==='video'&&id!==source.id)continue;
   items.push({id,title:clean(s.title),channel:clean(s.videoOwnerChannelTitle||s.channelTitle),position:Number.isSafeInteger(s.position)&&s.position>=0?s.position:items.length});
   if(items.length>=MAX_ITEMS)break;
  }
  page=data.nextPageToken;
  if(source.kind==='video'||!page)break;
  if(typeof page!=='string'||page.length>512||seen.has(page))throw Error('invalid-page-token');
  seen.add(page);
  if(n===3||items.length>=MAX_ITEMS){truncated=true;break;}
 }
 return {source:'YouTube',kind:source.kind,items,truncated};
}
module.exports={identify,preview,MAX_ITEMS};
