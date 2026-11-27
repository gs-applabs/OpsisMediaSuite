'use strict';
// Deliberate external-network test, separate from normal offline CI.
// MDN shared-assets, Sintel excerpt and matching English captions.
// Pin both source revision and Git blob identities.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {boundedBody}=require('../subtitle-provider');
const VP=require('../renderer/vplib');
const source='https://raw.githubusercontent.com/mdn/shared-assets/f160bcf2db52b60820a7728aa9b3fa88568cfc38/';
const files=[
 ['misc/sintel-en.vtt','sintel.en.vtt',1024*1024,'2efa95167a41bd48cf10b80911021d72bff977cf'],
 ['videos/sintel-short.mp4','sintel.mp4',32*1024*1024,'e24dd8fcca6df535682ed96338e861bfb41c6a38']
];
(async()=>{
 const dir=path.resolve('public-subtitle-fixture');await fs.mkdir(dir,{recursive:true});
 for(const [remote,local,limit,sha] of files){
  const res=await fetch(source+remote,{redirect:'error',signal:AbortSignal.timeout(60000)});
  const body=await boundedBody(res,limit);
  const actual=crypto.createHash('sha1').update('blob '+body.length+'\0').update(body).digest('hex');
  if(actual!==sha)throw Error('fixture identity mismatch: '+local);
  if(local.endsWith('.vtt')&&VP.subtitleToVtt(body.toString('utf8'),'vtt',0).cues<2)throw Error('missing public cues');
  await fs.writeFile(path.join(dir,local),body);console.log('Downloaded and verified',local,body.length,'bytes');
 }
})().catch(err=>{console.error(err.message);process.exitCode=1;});
