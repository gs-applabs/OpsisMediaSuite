'use strict';
const {setTimeout:delay}=require('node:timers/promises');
const UA='OpsisMediaSuite/3.0 (https://github.com/gs-applabs/OpsisMediaSuite)';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
let tail=Promise.resolve(),last=0;
function text(v){return typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,250):'';}
function phrase(v){return '"'+text(v).replace(/[\\"]/g,'\\$&')+'"';}
function query(tags){const title=text(tags?.title),artist=text(tags?.artist);if(!title||!artist)throw Error('Both artist and title are required');return 'recording:'+phrase(title)+' AND artist:'+phrase(artist);}
function rows(data){const out=[];for(const r of (Array.isArray(data?.recordings)?data.recordings:[]).slice(0,8)){
 if(!uuid.test(r.id||''))continue;
 const artist=(Array.isArray(r['artist-credit'])?r['artist-credit']:[]).slice(0,8).map(a=>text(a.name||a.artist?.name)+text(a.joinphrase)).join(' ').trim();
 const title=text(r.title);if(!title||!artist)continue;
 const releases=(Array.isArray(r.releases)?r.releases:[]).filter(a=>uuid.test(a.id||'')&&text(a.title)).slice(0,4);
 for(const a of releases.length?releases:[{}]){
 const year=/^\d{4}(?:-|$)/.test(a.date||'')?a.date.slice(0,4):'';
 out.push({recordingId:r.id,releaseId:a.id||null,title,artist,album:text(a.title),year,score:Number.isFinite(+r.score)?Math.max(0,Math.min(100,+r.score)):0,durationMs:Number.isFinite(r.length)?r.length:null});
 if(out.length>=12)return out;
 }
 }return out;}
async function boundedJSON(url,fetcher=fetch){
 const res=await fetcher(url,{headers:{'User-Agent':UA,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!res.ok)throw Error('MusicBrainz HTTP '+res.status);
 if(Number(res.headers.get('content-length'))>1024*1024)throw Error('response too large');
 if(!res.body)throw Error('empty response');
 const reader=res.body.getReader(),chunks=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>1024*1024)throw Error('response too large');chunks.push(Buffer.from(value));}}
 finally{await reader.cancel().catch(()=>{});}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function search(tags,fetcher=fetch){
 const q=query(tags),url=new URL('https://musicbrainz.org/ws/2/recording');url.searchParams.set('query',q);url.searchParams.set('fmt','json');url.searchParams.set('limit','8');
 const job=tail.then(async()=>{await delay(Math.max(0,1100-(Date.now()-last)));last=Date.now();return rows(await boundedJSON(url,fetcher));});
 tail=job.catch(()=>{});return job;
}
function coverURL(id){return uuid.test(id||'')?'https://coverartarchive.org/release/'+id+'/front':null;}
module.exports={query,rows,search,coverURL};
