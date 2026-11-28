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
// Trusted local state directory only; the manifest never supplies paths.
function createFileStore(dir){
 const fs=require('node:fs'),path=require('node:path');
 const file=path.join(dir,'provider-registry-v1.json'),max=3*(Math.ceil(MAX_MANIFEST/3)*4+1024);
 return Object.freeze({
  load(){
   let fd;try{fd=fs.openSync(file,'r');}catch(e){if(e.code==='ENOENT')return null;throw e;}
   try{const buffer=Buffer.alloc(max+1);let n=0,count;while(n<buffer.length&&(count=fs.readSync(fd,buffer,n,buffer.length-n,null))>0)n+=count;
    if(n>max)throw Error('state-too-large');return JSON.parse(buffer.subarray(0,n).toString('utf8'));
   }finally{fs.closeSync(fd);}
  },
  save(state){
   const data=Buffer.from(JSON.stringify(state));if(data.length>max)throw Error('state-too-large');
   fs.mkdirSync(dir,{recursive:true,mode:0o700});
   require('./atomic-write').atomicWrite(file,data);
  }
 });
}
function envelope(bytes,signature){return {bytes:bytes.toString('base64'),signature:signature.toString('base64')};}
function readEnvelope(value,trustedKey,now){
 if(!keys(value,['bytes','signature'])||typeof value.bytes!=='string'||value.bytes.length>Math.ceil(MAX_MANIFEST/3)*4||typeof value.signature!=='string'||value.signature.length!==88)throw Error('invalid-state-envelope');
 const bytes=Buffer.from(value.bytes,'base64'),signature=Buffer.from(value.signature,'base64');
 if(bytes.toString('base64')!==value.bytes||signature.toString('base64')!==value.signature)throw Error('invalid-state-encoding');
 // Archived manifests may have expired. Verify at their signed issuance time,
 // then separately enforce expiry on every active snapshot and rollback.
 const issued=JSON.parse(bytes.toString('utf8')).issued;
 if(!integer(issued)||issued>now)throw Error('invalid-state-time');
 const manifest=verifyManifest(bytes,signature,trustedKey,issued);
 return {manifest,envelope:envelope(bytes,signature)};
}
function createRegistry({trustedKey,clock=Date.now,minimumSequence=0,store=null}={}){
 if(!trustedKey||!integer(minimumSequence))throw Error('invalid-trust-config');
 let current=null,previous=null,highest=null,highWater=minimumSequence,busy=false;
 const saved=store?.load();
 if(saved!==null&&saved!==undefined){
  if(!keys(saved,['schema','current','previous','highest'])||saved.schema!==1||!saved.current||!saved.highest)throw Error('invalid-state');
  current=readEnvelope(saved.current,trustedKey,clock());highest=readEnvelope(saved.highest,trustedKey,clock());
  previous=saved.previous?readEnvelope(saved.previous,trustedKey,clock()):null;
  if(highest.manifest.sequence<minimumSequence||current.manifest.sequence>highest.manifest.sequence||previous&&previous.manifest.sequence>=current.manifest.sequence)throw Error('invalid-state-sequence');
  if(current.manifest.sequence===highest.manifest.sequence&&current.envelope.bytes!==highest.envelope.bytes)throw Error('invalid-state-conflict');
  highWater=highest.manifest.sequence;
 }
 const valid=x=>x&&x.manifest.expires>clock()&&x.manifest.issued<=clock()?x.manifest:null;
 const snapshot=()=>Object.freeze({current:valid(current),previous:valid(previous),highWater,busy});
 const persist=(next,prior,high)=>{if(store)store.save({schema:1,current:next.envelope,previous:prior?.envelope||null,highest:high.envelope});};
 return Object.freeze({
  snapshot,
  async activate(bytes,signature,contractTest){
   if(busy)throw Error('update-busy');
   if(typeof contractTest!=='function')throw Error('missing-contract-test');
   busy=true;
   try{
    // Copy inputs before awaiting a test; caller mutation cannot change the persisted envelope.
    if(!Buffer.isBuffer(bytes)||bytes.length>MAX_MANIFEST||!Buffer.isBuffer(signature)||signature.length!==64)throw Error('invalid-envelope');
    const data=Buffer.from(bytes),sig=Buffer.from(signature);
    const next=verifyManifest(data,sig,trustedKey,clock());
    if(next.sequence<=highWater)throw Error('replay');
    if(await contractTest(next)!==true)throw Error('contract-test-failed');
    if(next.expires<=clock())throw Error('expired-during-test');
    const record={manifest:next,envelope:envelope(data,sig)};
    persist(record,current,record);
    previous=current;current=record;highest=record;highWater=next.sequence;
   }finally{busy=false;}
   return snapshot();
  },
  rollback(){
   if(busy)throw Error('update-busy');
   if(!valid(previous))return false;
   persist(previous,null,highest);
   current=previous;previous=null;return true;
  }
 });
}
function updateDecision({enabled=false,onUse=false,manual=false,lastCheck=0,now=Date.now(),failure='none'}={}){
 if(!integer(now)||!integer(lastCheck)||lastCheck>now)return false;
 if(manual)return true;
 return enabled&&onUse&&(lastCheck===0||now-lastCheck>=24*60*60*1000||failure==='provider-changed'&&now-lastCheck>=60*60*1000);
}
module.exports={verifyManifest,createRegistry,createFileStore,updateDecision,MAX_MANIFEST};
