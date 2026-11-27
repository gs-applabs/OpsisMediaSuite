'use strict';
// Local energy/activity alignment. Not speech recognition: sound effects/music
// can look like dialogue. Reject ambiguous fits and present suggestions only.
const {spawn}=require('node:child_process');
const STEP=.1, RATE=8000, FRAME=800, MAX_SECONDS=1800;
function activityFromPcm(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>RATE*2*MAX_SECONDS+1600)throw Error('audio-limit');
 const n=Math.floor(bytes.length/(FRAME*2)),energy=new Float64Array(n);
 for(let i=0;i<n;i++){
  let sum=0,diff=0,prev=0;
  for(let j=0;j<FRAME;j++){const v=bytes.readInt16LE((i*FRAME+j)*2)/32768;sum+=v*v;diff+=(v-prev)*(v-prev);prev=v;}
  energy[i]=Math.log10(1e-8+Math.sqrt(sum/FRAME)*.65+Math.sqrt(diff/FRAME)*.35);
 }
 if(n<100)return null;
 const sorted=Array.from(energy).sort((a,b)=>a-b),floor=sorted[Math.floor(n*.2)],high=sorted[Math.floor(n*.95)];
 if(high-floor<.35)return null;
 const threshold=floor+Math.max(.18,(high-floor)*.35);
 const activity=Uint8Array.from(energy,x=>x>threshold?1:0);
 const duty=activity.reduce((a,b)=>a+b,0)/n;
 return duty>.05&&duty<.85?activity:null;
}
function estimate(activity,cues,{maxShift=30,step=STEP}={}){
 if(!activity||activity.length<100||activity.length>18000||!Array.isArray(cues)||cues.length<5||step!==STEP)return {ok:false,code:'insufficient-activity'};
 const n=activity.length, prefix=new Int32Array(n+1);
 for(let i=0;i<n;i++)prefix[i+1]=prefix[i]+(activity[i]?1:0);
 const duty=prefix[n]/n;if(duty<.05||duty>.85)return {ok:false,code:'insufficient-activity'};
 const valid=cues.slice(0,20000).filter(c=>c&&Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.start>=0&&c.end>c.start&&c.end<=MAX_SECONDS+60);
 if(valid.length<5)return {ok:false,code:'insufficient-cues'};
 const scales=[1,24/25,25/24,23.976/25,25/23.976,23.976/24,24/23.976];
 const shift=Math.min(300,Math.max(1,Math.round(Number(maxShift||30)/step))), scores=[];
 for(const scale of scales){
  // Merge overlapping subtitle intervals once for each candidate rate.
  const ranges=valid.map(c=>[Math.round(c.start*scale/step),Math.round(c.end*scale/step)]).sort((a,b)=>a[0]-b[0]),merged=[];
  for(const [a,b] of ranges){if(b<=a)continue;const last=merged.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else merged.push([a,b]);}
  for(let offset=-shift;offset<=shift;offset++){
   let frames=0,overlap=0,count=0;
   for(const [a,b] of merged){const x=Math.max(0,a+offset),y=Math.min(n,b+offset);if(y<=x)continue;frames+=y-x;overlap+=prefix[y]-prefix[x];count++;}
   if(count<5||frames<30||frames>n*.85)continue;
   const predicted=frames/n;
   const score=(overlap/n-predicted*duty)/Math.sqrt(predicted*(1-predicted)*duty*(1-duty));
   if(Number.isFinite(score))scores.push({scale,delay:offset*step,score,coverage:frames*step});
  }
 }
 scores.sort((a,b)=>b.score-a.score);const best=scores[0];
 if(!best||best.score<.45)return {ok:false,code:'weak-match'};
 const rival=scores.find(c=>Math.abs(c.delay-best.delay)>.7||Math.abs(c.scale-best.scale)*n*step>1.5);
 const margin=rival?best.score-rival.score:best.score;
 // A low score or boundary hit is not credible evidence of dialogue alignment.
 if(margin<.08||Math.abs(best.delay)>=shift*step-.5)return {ok:false,code:'ambiguous-match'};
 return {ok:true,scale:best.scale,delay:Math.round(best.delay*1000)/1000,score:Math.round(best.score*1000)/1000,margin:Math.round(margin*1000)/1000,analyzedSeconds:n*step,method:'audio-activity'};
}
function extractActivity(ffmpeg,file,seconds=MAX_SECONDS,{audioIndex=0,signal}={}){
 if(!Number.isInteger(audioIndex)||audioIndex<0||audioIndex>63)return Promise.reject(Error('bad-audio-index'));
 if(signal?.aborted)return Promise.reject(Error('cancelled'));
 seconds=Math.max(10,Math.min(MAX_SECONDS,Number(seconds)||MAX_SECONDS));
 return new Promise((resolve,reject)=>{
  const args=['-nostdin','-hide_banner','-v','error','-protocol_whitelist','file,pipe','-i',file,'-map','0:a:'+audioIndex,'-vn','-sn','-dn','-t',String(seconds),'-ac','1','-ar',String(RATE),'-f','s16le','pipe:1'];
  const p=spawn(ffmpeg,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','ignore']});
  let total=0,chunks=[],settled=false;
  const done=(err,val)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);err?reject(err):resolve(val);};
  const cancel=()=>{try{p.kill();}catch{}done(Error('cancelled'));};
  const timer=setTimeout(()=>{p.kill();done(Error('audio-timeout'));},120000);
  signal?.addEventListener('abort',cancel,{once:true});
  p.stdout.on('data',b=>{if(settled)return;total+=b.length;if(total>seconds*RATE*2+1600){p.kill();done(Error('audio-limit'));return;}chunks.push(b);});
  p.once('error',()=>done(Error('audio-unavailable')));
  p.once('close',code=>{if(settled)return;if(code!==0)return done(Error('audio-decode'));try{done(null,activityFromPcm(Buffer.concat(chunks,total)));}catch(e){done(e);}});
 });
}
module.exports={activityFromPcm,estimate,extractActivity};
