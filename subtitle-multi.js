'use strict';
// A user explicitly selects both APIs. Each has an independent session/key.
// Never silently fall through from a failed provider, or merge raw numeric IDs.
async function searchProviders({providers,query,language,moviehash,credentials={},allowed=()=>true}){
 const items=[],statuses=[];
 for(const id of ['opensubtitles','subdl']){
  if(!allowed())return {ok:false,code:'cancelled'};
  const provider=providers[id];if(!provider)continue;
  const auth=id==='opensubtitles'?{apiKey:credentials.openKey,username:credentials.username,password:credentials.password,moviehash}:{apiKey:credentials.subdlKey};
  let result;
  try{result=await provider.search({query,language,...auth});}catch{result={ok:false,code:'network-or-provider'};}
  statuses.push({provider:id,ok:result?.ok===true,code:result?.ok?null:result?.code||'network-or-provider',retryAfter:result?.retryAfter||null});
  if(result?.ok&&Array.isArray(result.items))for(const item of result.items.slice(0,50)){
   if(!Number.isSafeInteger(item.id)||item.id<=0||item.language!==language)continue;
   items.push({...item,provider:id});
  }
 }
 if(!allowed())return {ok:false,code:'cancelled'};
 items.sort((a,b)=>Number(!!b.hashMatch)-Number(!!a.hashMatch)||(b.matchScore||0)-(a.matchScore||0)||(b.downloads||0)-(a.downloads||0));
 return {ok:statuses.some(s=>s.ok),code:statuses.some(s=>s.ok)?null:'providers-unavailable',items,statuses};
}
module.exports={searchProviders};
