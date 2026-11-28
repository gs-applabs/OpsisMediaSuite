'use strict';
// Official public oEmbed metadata. No returned markup, images or media URLs are loaded.
const JSONTransport=require('./provider-json');
const MAX_BYTES=256*1024;
const endpoints=Object.freeze({Vimeo:'https://vimeo.com/api/oembed.json',Dailymotion:'https://www.dailymotion.com/services/oembed',SoundCloud:'https://soundcloud.com/oembed'});
function identify(value){
 if(typeof value!=='string'||value.length>2048||/[\x00-\x20\x7f]/.test(value.trim()))return null;
 let u;try{u=new URL(value.trim());}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')return null;
 const host=u.hostname,p=u.pathname;let provider,kind='item',id;
 if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host)){
  const match=/^\/(?:video\/)?([0-9]{1,20})\/?$/.exec(p);if(!match)return null;
  provider='Vimeo';id=match[1];u=new URL('https://vimeo.com/'+id);
 }else if(['dailymotion.com','www.dailymotion.com','dai.ly'].includes(host)){
  const match=(host==='dai.ly'?/^\/([a-zA-Z0-9]{1,32})\/?$/:/^\/video\/([a-zA-Z0-9]{1,32})\/?$/).exec(p);if(!match)return null;
  provider='Dailymotion';id=match[1];u=new URL('https://www.dailymotion.com/video/'+id);
 }else if(['soundcloud.com','www.soundcloud.com'].includes(host)){
  const match=/^\/([a-zA-Z0-9_-]{1,100})\/(?:(sets)\/)?([a-zA-Z0-9_-]{1,150})\/?$/.exec(p);if(!match)return null;
  provider='SoundCloud';kind=match[2]?'playlist':'item';id=match[1]+'/'+(match[2]?'sets/':'')+match[3];u=new URL('https://soundcloud.com/'+id);
 }else return null;
 return {provider,kind,id,link:u.href};
}
function requestJson(url,signal){
 return JSONTransport.requestJson(url,{origins:['https://vimeo.com','https://www.dailymotion.com','https://soundcloud.com'],maxBytes:MAX_BYTES,signal,statusError:code=>code===429?'rate-limit':code===401||code===403?'access-denied':code===404?'not-found':'provider-response'});
}
const clean=x=>typeof x==='string'?x.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,500):'';
async function preview(value,{signal,transport=requestJson}={}){
 const source=identify(value);if(!source)throw Error('unsupported-source');
 const url=new URL(endpoints[source.provider]);url.searchParams.set('url',source.link);url.searchParams.set('format','json');
 const deadline=AbortSignal.timeout(15000),combined=signal?AbortSignal.any([signal,deadline]):deadline;
 combined.throwIfAborted();const data=await transport(url,combined);combined.throwIfAborted();
 if(!data||typeof data!=='object'||Array.isArray(data)||!clean(data.title))throw Error('invalid-response');
 return {source:source.provider,kind:source.kind,link:source.link,items:[{id:source.id,title:clean(data.title),channel:clean(data.author_name),position:0,link:source.link}],collectionOnly:source.kind==='playlist'};
}
module.exports={identify,preview};
