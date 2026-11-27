'use strict';
const {spawn}=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict'),fs=require('node:fs');
const {normalizeCommand,parseHostEvent}=require('../native-host');
const child=spawn(path.resolve(process.env.OPSIS_NATIVE_TEST_EXE||'native-player/publish/Opsis.NativePlayer.exe'),['--selftest-pipe',path.resolve('fixture.mkv')],{stdio:['pipe','pipe','pipe'],windowsHide:true});
const events=[],errors=[];let buffer='',notify=()=>{};
child.stdout.setEncoding('utf8');child.stdout.on('data',s=>{buffer+=s;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);try{const e=JSON.parse(line);events.push(e);notify();}catch{}}});
child.stderr.on('data',b=>{if(errors.length<64)errors.push(String(b).slice(0,1024));});
child.stdin.on('error',()=>{});
const exited=new Promise((res,rej)=>{child.once('error',rej);child.once('close',res);});
exited.catch(()=>{});
function waitFor(fn){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{notify=()=>{};reject(Error('missing native event'));},8000);notify=()=>{const r=events.find(fn);if(r){clearTimeout(timer);notify=()=>{};resolve(r);}};notify();});}
async function send(id,name,value,expected=true){
 const cmd=expected?normalizeCommand(name,value):{name,...(value===undefined?{}:{value})};
 assert.ok(cmd);child.stdin.write(JSON.stringify({id,...cmd})+'\n');
 const ack=await waitFor(e=>e.event==='ack'&&e.id===id);assert.equal(ack.ok,expected,JSON.stringify(ack));
}
const watchdog=setTimeout(()=>child.kill(),29000);
(async()=>{
 const ready=await waitFor(e=>e.event==='ready');assert.ok(parseHostEvent(JSON.stringify(ready)).durationMs>=4000);
 await send(1,'pause');await send(2,'seek',1500);
 assert.ok(await waitFor(e=>e.event==='position'&&Math.abs(e.positionMs-1500)<=300));
 await send(3,'seek',-1,false);await send(4,'seek',undefined,false);await send(5,'open','C:\\invalid',false);
 child.stdin.end();assert.equal(await exited,0);console.log('Native redirected pipe acknowledgments and seek verified');
})().catch(e=>{console.error(e);process.exitCode=1;child.kill();}).finally(()=>{clearTimeout(watchdog);fs.writeFileSync('pipe-result.json',JSON.stringify({events,errors},null,2));});
