'use strict';
// A feature status is not evidence that a specific video uses a hardware decoder.
function gpuSummary(status,info){
 const names=['gpu_compositing','video_decode','video_encode','rasterization','webgl','webgl2'];
 const features={};
 for(const n of names)if(typeof status?.[n]==='string')features[n]=status[n].slice(0,64);
 const devices=[];
 for(const row of Array.isArray(info?.gpuDevice)?info.gpuDevice.slice(0,8):[]){
  if(!row||typeof row!=='object')continue;
  const device={active:row.active===true};
  for(const key of ['vendorId','deviceId'])if(Number.isInteger(row[key])&&row[key]>=0&&row[key]<=0xffffffff)device[key]=row[key];
  for(const key of ['vendorString','deviceString','driverVersion'])if(typeof row[key]==='string')device[key]=row[key].replace(/[\x00-\x1f\x7f]/g,' ').slice(0,120);
  devices.push(device);
 }
 return {features,devices};
}
function decoderMode(value){return ['auto','d3d11va','dxva2','none'].includes(value)?value:null;}
module.exports={gpuSummary,decoderMode};
