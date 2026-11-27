'use strict';
const VP=require('./renderer/vplib');
const path=require('node:path');
const STOP=new Set(['quota','provider-blocked','provider-cooldown','rate-limited','auth','api-key-required','credentials-required','network-or-provider','provider-response','busy']);
const MAX_BATCH=10;
function seasonPlan(videos,anchor){
 const target=VP.releaseInfo(anchor);
 if(!target.title||target.season===null||target.multiple)return [];
 const key=s=>s.normalize('NFKC').toLowerCase().replace(/[\s._-]+/g,' ').trim();
 const seen=new Set(),out=[];
 for(const file of videos){
  if(typeof file!=='string'||seen.has(file))continue;
  const info=VP.releaseInfo(file);
  if(info.season!==target.season||info.episode===null||info.multiple||key(info.title)!==key(target.title))continue;
  seen.add(file);out.push({file,episode:info.episode});
 }
 return out.sort((a,b)=>a.episode-b.episode||a.file.localeCompare(b.file)).map(x=>x.file);
}
async function runSeasonBatch({files,provider,providerId,credentials={},autoSave=false,hashEnabled=false,approved,audit,hash,save,progress=()=>{},cancelled=()=>false,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 const rows=[],total=Math.min(files.length,MAX_BATCH);let stopped=null,started=Date.now();
 const stop=()=>cancelled()?'cancelled':Date.now()-started>180000?'time-budget':null;
 const add=(file,status,extra={})=>{rows.push({file,status,...extra});progress({done:rows.length,total,rows:rows.slice(),stopped:null});};
 for(const file of files.slice(0,MAX_BATCH)){
  if((stopped=stop()))break;
  if(!approved(file)){add(file,'not-approved');continue;}
  const existing=await audit(file);
  if(existing==='greek'||existing==='embedded-greek'){add(file,'already-present');continue;}
  if(existing!=='missing'&&existing!=='other-language'){add(file,'local-review');continue;}
  if((stopped=stop()))break;
  let moviehash=null;
  if(hashEnabled&&providerId==='opensubtitles'&&approved(file))try{moviehash=await hash(file);}catch{}
  if((stopped=stop()))break;
  if(!approved(file)){add(file,'not-approved');continue;}
  // Give the provider an honest cadence; no parallel requests or retry loops.
  await sleep(1000);
  if((stopped=stop()))break;
  const req={query:VP.titleOf(file),language:'el',moviehash,...credentials};
  const found=await provider.search(req);
  // Credentials are used on the first actual search only; provider retains
  // its key/token in memory. Do not repeatedly log in for each episode.
  credentials={};
  if((stopped=stop()))break;
  if(!found?.ok){const code=found?.code||'network-or-provider';add(file,'search-failed',{code});if(STOP.has(code)){stopped=code;break;}continue;}
  const items=Array.isArray(found.items)?found.items:[];
  if(!items.length){add(file,'no-results');continue;}
  const exact=items.filter(x=>x.hashMatch===true&&x.language==='el');
  // No heuristic download and no arbitrary tie-breaking across exact files.
  if(!autoSave||providerId!=='opensubtitles'||!moviehash||exact.length!==1){add(file,'review',{count:items.length,exact:exact.length,best:items[0].name});continue;}
  await sleep(1000);
  if((stopped=stop()))break;
  if(!approved(file)){add(file,'not-approved');continue;}
  // Recheck local state immediately before spending download quota.
  const current=await audit(file);
  if(current!=='missing'&&current!=='other-language'){add(file,'local-review');continue;}
  if((stopped=stop()))break;
  const downloaded=await provider.download(exact[0].id);
  if(!downloaded?.ok){const code=downloaded?.code||'network-or-provider';add(file,'download-failed',{code});if(STOP.has(code)){stopped=code;break;}continue;}
  if((stopped=stop()))break;
  if(!approved(file)){add(file,'not-approved');continue;}
  const result=await save(file,downloaded.subtitle,'el');
  add(file,result?.ok?(result.reused?'already-present':'saved'):'save-failed',{...(result?.ok?{name:result.name}:{code:result?.code||'save-failed'})});
  if(downloaded.remaining===0){stopped='quota';break;}
 }
 return {rows,stopped,total,truncated:files.length>MAX_BATCH};
}
module.exports={seasonPlan,runSeasonBatch,MAX_BATCH};
