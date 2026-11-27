'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {extractActivity,estimate}=require('./subtitle-autosync');
const controller=new AbortController();
parentPort.once('message',m=>{if(m==='cancel')controller.abort();});
(async()=>{
 try{
  const activity=await extractActivity(workerData.ffmpeg,workerData.file,workerData.seconds,{audioIndex:workerData.audioIndex,signal:controller.signal});
  if(controller.signal.aborted)throw Error('cancelled');
  parentPort.postMessage(estimate(activity,workerData.cues));
 }catch(e){parentPort.postMessage({ok:false,code:e.message==='cancelled'?'cancelled':'audio-analysis-failed'});}
 finally{parentPort.close();}
})();
