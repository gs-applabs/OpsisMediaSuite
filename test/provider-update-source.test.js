'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Readable}=require('node:stream');
const U=require('../provider-update-source'),{createRegistry}=require('../provider-compatibility');
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519'),now=1800000000000;
function signed(sequence=1){
 const bytes=Buffer.from(JSON.stringify({schema:1,sequence,issued:now-1000,expires:now+3600000,providers:[{provider:'youtube',version:'1.0',sha256:'a'.repeat(64),contract:1,mode:'authorized-media'}]}));
 return {bytes,signature:crypto.sign(null,bytes,privateKey)};
}
function wire(s=signed()){return Buffer.from(JSON.stringify({bytes:s.bytes.toString('base64'),signature:s.signature.toString('base64')}));}
function response(data,statusCode=200,headers={}){const stream=Readable.from([data]);stream.statusCode=statusCode;stream.headers={'content-type':'application/json',...headers};return stream;}
test('trusted endpoint and bounded signed envelope transport reject unsafe inputs',async()=>{
 assert.equal(U.endpoint('https://updates.example.test/providers.json').hostname,'updates.example.test');
 for(const url of ['http://updates.example.test/a','https://u:p@updates.example.test/a','https://127.0.0.1/a','https://updates.example.test:444/a','https://updates.example.test/a?token=x','https://updates.example.test/a#x'])assert.throws(()=>U.endpoint(url));
 const raw=wire();assert.equal((await U.readEnvelope(response(raw))).signature.length,64);
 await assert.rejects(U.readEnvelope(response(raw,302)),/denied/);
 await assert.rejects(U.readEnvelope(response(raw,200,{'content-length':String(raw.length+1)})),/incomplete/);
 await assert.rejects(U.readEnvelope(response(Buffer.alloc(U.MAX_ENVELOPE+1))),/limit/);
 assert.throws(()=>U.decodeEnvelope(Buffer.from('{"bytes":"a","signature":"b"}')),/envelope/);
});
test('manager is inert without trust config, checks on use and preserves state on failure',async()=>{
 const off=U.createUpdateManager();assert.equal((await off.check({manual:true})).configured,false);
 const reg=createRegistry({trustedKey:publicKey,clock:()=>now});let calls=0,next=signed(),ok=true;
 const manager=U.createUpdateManager({registry:reg,source:'https://updates.example.test/providers.json',clock:()=>now,transport:async()=>{calls++;return next;},contractTest:async()=>ok});
 await manager.check({enabled:true});assert.equal(calls,0);
 assert.equal((await manager.check({enabled:true,onUse:true})).lastResult,'activated');assert.equal(calls,1);
 await manager.check({enabled:true,onUse:true});assert.equal(calls,1);
 next=signed(2);ok=false;assert.equal((await manager.check({manual:true})).lastResult,'update-failed');
 assert.equal(reg.snapshot().current.sequence,1);
});
test('cancelled update cannot activate and concurrent checks do not start a second request',async()=>{
 const reg=createRegistry({trustedKey:publicKey,clock:()=>now});let release,calls=0;
 const manager=U.createUpdateManager({registry:reg,source:'https://updates.example.test/providers.json',clock:()=>now,transport:()=>{calls++;return new Promise(r=>{release=r;});},contractTest:async()=>true});
 const pending=manager.check({manual:true});await manager.check({manual:true});assert.equal(calls,1);
 manager.cancel();release(signed());assert.equal((await pending).lastResult,'cancelled');assert.equal(reg.snapshot().current,null);
});
