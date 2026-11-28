'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {verifyManifest,createRegistry,updateDecision}=require('../provider-compatibility');
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519'),now=1800000000000;
function signed(sequence=1,patch={}){
 const bytes=Buffer.from(JSON.stringify({schema:1,sequence,issued:now-1000,expires:now+3600000,providers:[{provider:'youtube',version:'1.0.0',sha256:'a'.repeat(64),contract:1,mode:'authorized-media'}],...patch}));
 return [bytes,crypto.sign(null,bytes,privateKey)];
}
test('signed data-only registry rejects tampering, expiry, untrusted key and executable fields',()=>{
 const [bytes,sig]=signed();assert.equal(verifyManifest(bytes,sig,publicKey,now).sequence,1);
 assert.throws(()=>verifyManifest(Buffer.concat([bytes,Buffer.from(' ')]),sig,publicKey,now),/signature/);
 assert.throws(()=>verifyManifest(bytes,sig,crypto.generateKeyPairSync('ed25519').publicKey,now),/signature/);
 assert.throws(()=>verifyManifest(bytes,sig,publicKey,now+3600000),/manifest/);
 for(const p of [{provider:'spotify',version:'1',sha256:'a'.repeat(64),contract:1,mode:'authorized-media'},{provider:'youtube',version:'1',sha256:'a'.repeat(64),contract:1,mode:'authorized-media',command:'run'}]){
  assert.throws(()=>verifyManifest(...signed(1,{providers:[p]}),publicKey,now),/provider/);
 }
});
test('failed staging preserves active registry, rollback preserves anti-replay sequence',async()=>{
 const reg=createRegistry({trustedKey:publicKey,clock:()=>now});
 await reg.activate(...signed(1),async()=>true);
 await assert.rejects(reg.activate(...signed(2),async()=>false),/contract-test/);
 assert.equal(reg.snapshot().current.sequence,1);
 await reg.activate(...signed(2),async()=>true);
 assert.equal(reg.rollback(),true);assert.equal(reg.snapshot().current.sequence,1);assert.equal(reg.snapshot().highWater,2);
 await assert.rejects(reg.activate(...signed(2),async()=>true),/replay/);
});
test('only one activation can run, opt-in checks on use with bounded cooldown',async()=>{
 const reg=createRegistry({trustedKey:publicKey,clock:()=>now});let finish;
 const pending=reg.activate(...signed(1),()=>new Promise(r=>{finish=r;}));
 await assert.rejects(reg.activate(...signed(2),async()=>true),/busy/);
 assert.throws(()=>reg.rollback(),/busy/);finish(true);await pending;
 assert.equal(updateDecision({enabled:true,onUse:false,now}),false);
 assert.equal(updateDecision({enabled:true,onUse:true,lastCheck:now-1000,now,failure:'provider-changed'}),false);
 assert.equal(updateDecision({enabled:true,onUse:true,lastCheck:now-3600000,now,failure:'provider-changed'}),true);
 assert.equal(updateDecision({manual:true,now}),true);
});
