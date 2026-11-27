'use strict';
const path=require('node:path');
const {execFile}=require('node:child_process');
const {localPath}=require('./local-media-policy');
const HEADER=96,MAX=30*96000*2*4;
function makeRequest(rate,channels,pcm,config){
 if(!Number.isInteger(rate)||rate<44100||rate>96000||![1,2].includes(channels)||
    !(pcm instanceof Uint8Array)||!pcm.byteLength||pcm.byteLength>MAX||pcm.byteLength%(channels*4))return null;
 const frames=pcm.byteLength/(channels*4);
 if(frames>rate*30)return null;
 const c=config?.base;
 if(config?.version!==2||c?.version!==1||![0,1].includes(c.enabled)||!Array.isArray(c.eq_db)||c.eq_db.length!==10||
    ![0,1,2,3].includes(config.compressor_mode)||![0,1].includes(config.limiter))return null;
 const vals=[...c.eq_db,c.bass_db,c.presence_percent,c.balance_percent,c.surround_percent,c.preamp_db,config.ambience_percent,config.exciter_percent];
 const limits=[...Array.from({length:11},()=>[-12,12]),[0,100],[-100,100],[0,100],[-24,12],[0,100],[0,100]];
 if(!vals.every((v,i)=>typeof v==='number'&&Number.isFinite(v)&&v>=limits[i][0]&&v<=limits[i][1]))return null;
 const h=Buffer.alloc(HEADER);
 h.write('ODP2',0,'ascii');h.writeUInt32LE(rate,4);h.writeUInt32LE(channels,8);h.writeUInt32LE(frames,12);h.writeUInt32LE(c.enabled,16);
 vals.slice(0,15).forEach((v,i)=>h.writeFloatLE(v,20+i*4));
 h.writeUInt32LE(config.compressor_mode,80);h.writeFloatLE(config.ambience_percent,84);h.writeFloatLE(config.exciter_percent,88);h.writeUInt32LE(config.limiter,92);
 return Buffer.concat([h,Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength)]);
}
function createDspBridge({app}){
 // Only the fixed developer build location. No search of PATH, downloads,
 // renderer paths or commands. Production packaging intentionally disabled.
 const exe=()=>!app.isPackaged&&process.platform==='win32'?localPath(path.join(__dirname,'native-dsp-build','Release','opsis_dsp_pcm.exe')):null;
 let active=null;
 return {
  available:()=>!!exe(),
  cancel(){if(active){try{active.kill();}catch{}}},
  async render(rate,channels,pcm,cfg){
   if(active)return {ok:false,code:'native-dsp-busy'};
   const file=exe();if(!file)return {ok:false,code:'native-dsp-unavailable'};
   const request=makeRequest(rate,channels,pcm,cfg);if(!request)return {ok:false,code:'native-dsp-invalid'};
   return new Promise(resolve=>{
    try{
     const child=execFile(file,[],{cwd:path.dirname(file),windowsHide:true,timeout:15000,maxBuffer:MAX+1024,encoding:'buffer'},(err,out)=>{
      if(active===child)active=null;
      if(err||!Buffer.isBuffer(out)||out.length!==pcm.byteLength){resolve({ok:false,code:'native-dsp-failed'});return;}
      for(let i=0;i<out.length;i+=4){if(!Number.isFinite(out.readFloatLE(i))){resolve({ok:false,code:'native-dsp-invalid-output'});return;}}
      resolve({ok:true,pcm:new Uint8Array(out)});
     });
     active=child;child.stdin.on('error',()=>{});child.stdin.end(request);
    }catch{active=null;resolve({ok:false,code:'native-dsp-failed'});}
   });
  }
 };
}
module.exports={makeRequest,createDspBridge};
