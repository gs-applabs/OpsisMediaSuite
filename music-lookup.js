'use strict';
const {setTimeout:delay}=require('node:timers/promises');
const UA='OpsisMediaSuite/3.0 (https://github.com/gs-applabs/OpsisMediaSuite)';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
let tail=Promise.resolve(),last=0;
function text(v){return typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,250):'';}
function phrase(v){return '"'+text(v).replace(/[\\"]/g,'\\$&')+'"';}
function query(tags){const title=text(tags?.title),artist=text(tags?.artist);if(!title||!artist)throw Error('Both artist and title are required');return 'recording:'+phrase(title)+' AND artist:'+phrase(artist);}
function rows(data){const out=[],seen=new Set();for(const r of (Array.isArray(data?.recordings)?data.recordings:[]).slice(0,8)){
 if(!r||!uuid.test(r.id||''))continue;
 const artist=(Array.isArray(r['artist-credit'])?r['artist-credit']:[]).slice(0,8).filter(Boolean).map(a=>text(a.name||a.artist?.name)+(typeof a.joinphrase==='string'?a.joinphrase.slice(0,40):'')).join(' ').trim();
 const title=text(r.title);if(!title||!artist)continue;
 const releases=(Array.isArray(r.releases)?r.releases:[]).filter(a=>a&&uuid.test(a.id||'')&&text(a.title)).slice(0,4);
 for(const a of releases.length?releases:[{}]){
 const key=r.id+'|'+(a.id||'');if(seen.has(key))continue;seen.add(key);
 const year=typeof a.date==='string'&&/^\d{4}(?:-|$)/.test(a.date)?a.date.slice(0,4):'';
 out.push({recordingId:r.id,releaseId:a.id||null,title,artist,album:text(a.title),year,score:Number.isFinite(+r.score)?Math.max(0,Math.min(100,+r.score)):0,durationMs:Number.isFinite(r.length)?r.length:null});
 if(out.length>=12)return out;
 }
 }return out;}
async function boundedJSON(url,fetcher=fetch,options={}){
 const res=await fetcher(url,{...options,headers:{'User-Agent':UA,Accept:'application/json',...options.headers},redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!res.ok)throw Error('Metadata provider HTTP '+res.status);
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
function validFingerprint(v){return typeof v==='string'&&v.length>=8&&v.length<=65536&&/^[A-Za-z0-9+/_=-]+$/.test(v);}
async function fingerprint(ffmpeg,file){
 const {execFile}=require('node:child_process'),{promisify}=require('node:util'),path=require('node:path');
 if(!path.isAbsolute(ffmpeg)||!path.isAbsolute(file)||!['.mp3','.flac'].includes(path.extname(file).toLowerCase()))throw Error('invalid fingerprint input');
 let stdout;try{({stdout}=await promisify(execFile)(ffmpeg,['-nostdin','-hide_banner','-v','error','-protocol_whitelist','file,pipe','-i',file,'-map','0:a:0','-vn','-sn','-dn','-t','120','-f','chromaprint','-fp_format','base64','pipe:1'],{timeout:45000,maxBuffer:128*1024,windowsHide:true}));}
 catch{throw Error('Installed FFmpeg does not support Chromaprint or fingerprint generation failed');}
 const fp=stdout.trim();if(!validFingerprint(fp))throw Error('invalid fingerprint output');return fp;
}
let acousticTail=Promise.resolve(),acousticLast=0;
function acousticRows(data){
 if(data?.status!=='ok')throw Error('AcoustID lookup rejected');
 const out=[],seen=new Set();
 for(const a of (Array.isArray(data.results)?data.results:[]).slice(0,8)){
  if(!a||typeof a.score!=='number'||a.score<0.7||a.score>1)continue;
  for(const r of (Array.isArray(a.recordings)?a.recordings:[]).slice(0,8)){
   if(!r||!uuid.test(r.id||''))continue;
   const title=text(r.title),artist=(Array.isArray(r.artists)?r.artists:[]).slice(0,8).map(x=>text(x?.name)).filter(Boolean).join(' / ');
   if(!title||!artist)continue;
   const releases=(Array.isArray(r.releases)?r.releases:[]).filter(x=>x&&uuid.test(x.id||'')&&text(x.title)).slice(0,4);
   for(const rel of releases.length?releases:[{}]){
    const key=r.id+'|'+(rel.id||'');if(seen.has(key))continue;seen.add(key);
    out.push({recordingId:r.id,releaseId:rel.id||null,title,artist,album:text(rel.title),year:'',score:Math.round(a.score*100)});
    if(out.length>=12)return out;
   }
  }
 }return out;
}
function acousticSearch(fp,duration,key,fetcher=fetch){
 if(!validFingerprint(fp)||!Number.isFinite(duration)||duration<1||duration>86400||typeof key!=='string'||!/^[A-Za-z0-9_-]{5,100}$/.test(key))throw Error('invalid fingerprint lookup inputs');
 const body=new URLSearchParams({client:key,duration:String(Math.round(duration)),fingerprint:fp,meta:'recordings releases',format:'json'});
 const job=acousticTail.then(async()=>{await delay(Math.max(0,1100-(Date.now()-acousticLast)));acousticLast=Date.now();return acousticRows(await boundedJSON('https://api.acoustid.org/v2/lookup',fetcher,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}));});
 acousticTail=job.catch(()=>{});return job;
}
module.exports={query,rows,search,coverURL,fingerprint,validFingerprint,acousticRows,acousticSearch};
