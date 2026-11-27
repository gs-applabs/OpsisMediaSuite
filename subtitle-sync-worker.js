'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {extractActivity,estimate}=require('./subtitle-autosync');
const controller=new AbortController(),flag=new Int32Array(workerData.cancelFlag);
const cancelled=()=>controller.signal.aborted||Atomics.load(flag,0)===1;
parentPort.once('message',m=>{if(m==='cancel')controller.abort();});
(async()=>{
 try{
  const activity=await extractActivity(workerData.ffmpeg,workerData.file,workerData.seconds,{audioIndex:workerData.audioIndex,signal:controller.signal});
  if(cancelled())throw Error('cancelled');
  parentPort.postMessage(estimate(activity,workerData.cues,{cancelled}));
 }catch(e){parentPort.postMessage({ok:false,code:['cancelled','audio-stop-unconfirmed'].includes(e.message)?e.message:'audio-analysis-failed'});}
 finally{parentPort.close();}
})();
