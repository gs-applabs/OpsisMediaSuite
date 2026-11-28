'use strict';
// Official Spotify Web API. Metadata only, never playback, preview audio or download URLs.
const https=require('node:https');
const ID=/^[A-Za-z0-9]{22}$/,MAX_ITEMS=200,MAX_BYTES=2*1024*1024,PAGE=50;
function identify(value){
 if(typeof value!=='string'||value.length>2048||/[\x00-\x1f\x7f]/.test(value.trim()))return null;
 let u;try{u=new URL(value.trim());}catch{return null;}
 if(u.protocol!=='https:'||u.hostname!=='open.spotify.com'||u.username||u.password||u.port&&u.port!=='443')return null;
 const match=/^\/(?:intl-[a-zA-Z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]{22})\/?$/.exec(u.pathname);
 return match?{kind:match[1],id:match[2]}:null;
}
function validToken(token){return typeof token==='string'&&/^[A-Za-z0-9._~+\/=-]{20,4096}$/.test(token);}
function requestUrl(source,offset){
 const suffix=source.kind==='playlist'?'playlists/'+source.id+'/items':source.kind==='album'?'albums/'+source.id+'/tracks':'tracks/'+source.id;
 const u=new URL('https://api.spotify.com/v1/'+suffix);
 u.searchParams.set('market','GR');
 if(source.kind!=='track'){u.searchParams.set('limit',String(PAGE));u.searchParams.set('offset',String(offset));}
 if(source.kind==='playlist')u.searchParams.set('fields','next,total,items(is_local,item(id,type,name,artists(name),album(name),duration_ms,is_local),track(id,type,name,artists(name),album(name),duration_ms,is_local))');
 return u;
}
async function requestJson(url,token,signal){
 const response=await new Promise((resolve,reject)=>{
  const req=https.get(url,{agent:false,signal,headers:{accept:'application/json',authorization:'Bearer '+token}},resolve);
  req.on('error',reject);req.setTimeout(8000,()=>req.destroy(Error('timeout')));
 });
 try{
  if(response.statusCode!==200)throw Error(({401:'token-expired',403:'access-denied',404:'not-found',429:'rate-limit'})[response.statusCode]||'api-error');
  if(!/^application\/json\b/i.test(String(response.headers['content-type']||'')))throw Error('invalid-response');
  const chunks=[];let size=0;for await(const chunk of response){size+=chunk.length;if(size>MAX_BYTES)throw Error('response-limit');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
 }finally{response.destroy();}
}
const clean=x=>typeof x==='string'?x.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,500):'';
function row(track,position){
 if(!track||track.type!=='track'||track.is_local||!ID.test(track.id||''))return null;
 return {id:track.id,title:clean(track.name),channel:Array.isArray(track.artists)?track.artists.slice(0,20).map(a=>clean(a?.name)).join(', ').slice(0,500):'',album:clean(track.album?.name),durationMs:Number.isSafeInteger(track.duration_ms)&&track.duration_ms>=0?track.duration_ms:null,position,link:'https://open.spotify.com/track/'+track.id};
}
async function preview(value,token,{signal,transport=requestJson}={}){
 const source=identify(value);if(!source||!validToken(token))throw Error('invalid-source-or-token');
 const deadline=AbortSignal.timeout(25000),combined=signal?AbortSignal.any([signal,deadline]):deadline;
 const items=[];let truncated=false,skipped=0,offset=0;
 for(let n=0;n<4;n++){
  combined.throwIfAborted();const data=await transport(requestUrl(source,offset),token,combined);combined.throwIfAborted();
  const entries=source.kind==='track'?[data]:data?.items;
  if(!Array.isArray(entries)||entries.length>PAGE)throw Error('invalid-response');
  for(const [i,entry] of entries.entries()){
   const track=source.kind==='playlist'?(entry?.is_local?null:entry?.item||entry?.track):entry;
   const item=row(track,offset+i);
   if(!item||source.kind==='track'&&item.id!==source.id)skipped++;else items.push(item);
  }
  if(source.kind==='track'||!data.next)break;
  if(!entries.length||typeof data.next!=='string')throw Error('invalid-pagination');
  offset+=entries.length;if(n===3){truncated=true;break;}
 }
 return {source:'Spotify',kind:source.kind,items,truncated,skipped,link:'https://open.spotify.com/'+source.kind+'/'+source.id};
}
module.exports={identify,validToken,preview,MAX_ITEMS};
