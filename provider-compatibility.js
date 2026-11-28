'use strict';
// A signed, data-only provider registry. No URL fetch, executable loading or provider credentials.
const crypto=require('node:crypto');
const MAX_MANIFEST=65536,MAX_LIFETIME=30*24*60*60*1000;
const PROVIDERS=new Set(['youtube','youtube-music','spotify','vimeo','dailymotion','soundcloud','bandcamp']);
const keys=(obj,expected)=>!!obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).sort().join(',')===expected.slice().sort().join(',');
const integer=n=>Number.isSafeInteger(n)&&n>=0;
function verifyManifest(bytes,signature,trustedKey,now=Date.now()){
 if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>MAX_MANIFEST||!Buffer.isBuffer(signature)||signature.length!==64||!integer(now))throw Error('invalid-envelope');
 const key=trustedKey?.type==='public'?trustedKey:crypto.createPublicKey(trustedKey);
 if(key.asymmetricKeyType!=='ed25519'||!crypto.verify(null,bytes,key,signature))throw Error('invalid-signature');
 const doc=JSON.parse(bytes.toString('utf8'));
 if(!keys(doc,['schema','sequence','issued','expires','providers'])||doc.schema!==1||!integer(doc.sequence)||doc.sequence===0||!integer(doc.issued)||!integer(doc.expires)||doc.issued>now||doc.expires<=now||doc.expires-doc.issued>MAX_LIFETIME||!Array.isArray(doc.providers)||!doc.providers.length||doc.providers.length>PROVIDERS.size)throw Error('invalid-manifest');
 const seen=new Set(),providers=[];
 for(const p of doc.providers){
  if(!keys(p,['provider','version','sha256','contract','mode'])||!PROVIDERS.has(p.provider)||seen.has(p.provider)||typeof p.version!=='string'||!/^[0-9A-Za-z][0-9A-Za-z.-]{0,47}$/.test(p.version)||typeof p.sha256!=='string'||!/^[a-f0-9]{64}$/.test(p.sha256)||p.contract!==1||!['metadata-only','authorized-media'].includes(p.mode)||p.provider==='spotify'&&p.mode!=='metadata-only')throw Error('invalid-provider');
  seen.add(p.provider);providers.push(Object.freeze({...p}));
 }
 return Object.freeze({...doc,providers:Object.freeze(providers)});
}
function createRegistry({trustedKey,clock=Date.now,minimumSequence=0}={}){
 if(!trustedKey||!integer(minimumSequence))throw Error('invalid-trust-config');
 let current=null,previous=null,highWater=minimumSequence,busy=false;
 const snapshot=()=>Object.freeze({current,previous,highWater,busy});
 return Object.freeze({
  snapshot,
  async activate(bytes,signature,contractTest){
   if(busy)throw Error('update-busy');
   if(typeof contractTest!=='function')throw Error('missing-contract-test');
   busy=true;
   try{
    const next=verifyManifest(bytes,signature,trustedKey,clock());
    if(next.sequence<=highWater)throw Error('replay');
    if(await contractTest(next)!==true)throw Error('contract-test-failed');
    if(next.expires<=clock())throw Error('expired-during-test');
    previous=current;current=next;highWater=next.sequence;return snapshot();
   }finally{busy=false;}
  },
  rollback(){
   if(busy)throw Error('update-busy');
   if(!previous||previous.expires<=clock())return false;
   current=previous;previous=null;return true;
  }
 });
}
function updateDecision({enabled=false,onUse=false,manual=false,lastCheck=0,now=Date.now(),failure='none'}={}){
 if(!integer(now)||!integer(lastCheck)||lastCheck>now)return false;
 if(manual)return true;
 return enabled&&onUse&&(lastCheck===0||now-lastCheck>=24*60*60*1000||failure==='provider-changed'&&now-lastCheck>=60*60*1000);
}
module.exports={verifyManifest,createRegistry,updateDecision,MAX_MANIFEST};
