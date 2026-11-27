'use strict';
// Deliberately separate test-only renderer; no preload or app access.
window.runDspFixture=async function(bytes){
  const module=await WebAssembly.compile(new Uint8Array(bytes));
  const rate=48000,frames=rate*2;
  const config={version:2,base:{version:1,enabled:1,eq_db:[0,0,0,0,0,6,0,0,0,0],bass_db:0,presence_percent:0,balance_percent:0,surround_percent:0,preamp_db:0},compressor_mode:0,ambience_percent:0,exciter_percent:0,limiter:1};
  async function render(enabled){
    const ctx=new OfflineAudioContext(2,frames,rate);
    await ctx.audioWorklet.addModule('processor.mjs');
    const buffer=ctx.createBuffer(1,frames,rate),pcm=buffer.getChannelData(0);
    for(let i=0;i<frames;i++)pcm[i]=.025*Math.sin(2*Math.PI*1000*i/rate);
    const src=ctx.createBufferSource();src.buffer=buffer;
    const node=new AudioWorkletNode(ctx,'opsis-test-dsp',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{module,config:{...config,base:{...config.base,enabled}}}});
    let failed=false;node.onprocessorerror=()=>{failed=true;};
    src.connect(node);node.connect(ctx.destination);src.start();
    const out=await ctx.startRendering(),l=out.getChannelData(0),r=out.getChannelData(1);
    let sum=0,base=0,delta=0,err=0;
    for(let i=rate;i<frames;i++){sum+=l[i]**2;base+=pcm[i]**2;delta=Math.max(delta,Math.abs(l[i]-r[i]));err=Math.max(err,Math.abs(l[i]-pcm[i]));}
    if(failed||!Number.isFinite(sum)||sum===0)throw Error('worklet failed or silent');
    return {gain:10*Math.log10(sum/base),delta,err};
  }
  const wet=await render(1),dry=await render(0);
  if(Math.abs(wet.gain-6)>.2||wet.delta>1e-6||dry.err>1e-7||dry.delta>1e-7)throw Error('unexpected response '+JSON.stringify({wet,dry}));
  return {wet,dry};
};
