'use strict';
importScripts('photolib.js');
self.onmessage=({data:m})=>{
 try {
  const {width,height,buffer,params,maxEdge}=m;
  if(!WaveframePhoto.exportBudget(width,height,params,maxEdge)||!(buffer instanceof ArrayBuffer)||buffer.byteLength!==width*height*4)throw Error('photo-budget');
  const out=WaveframePhoto.process({width,height,data:new Uint8ClampedArray(buffer)},params);
  self.postMessage({ok:true,width:out.width,height:out.height,buffer:out.data.buffer},[out.data.buffer]);
 }catch(e){self.postMessage({ok:false,error:String(e?.message||'failed').slice(0,100)});}
};
