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
  // Three PARALLEL branches, each with a separate gain. Never feed an
  // enhanced signal into another DSP. Test the same gate used by the app.
  const ctx=new OfflineAudioContext(2,rate*4,rate);
  await ctx.audioWorklet.addModule('processor.mjs');
  const src=ctx.createOscillator();src.frequency.value=1000;
  const level=ctx.createGain();level.gain.value=.025;src.connect(level);
  const stereo=ctx.createGain();stereo.channelCount=2;stereo.channelCountMode='explicit';level.connect(stereo);
  const web=ctx.createBiquadFilter();web.type='peaking';web.frequency.value=1000;web.Q.value=1.4;web.gain.value=3;
  const worklet=new AudioWorkletNode(ctx,'opsis-test-dsp',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{module,config}});
  let failed=false;worklet.onprocessorerror=()=>{failed=true;};
  const gains={web:ctx.createGain(),dry:ctx.createGain(),worklet:ctx.createGain()};
  stereo.connect(web);web.connect(gains.web);stereo.connect(gains.dry);
  stereo.connect(worklet);worklet.connect(gains.worklet);
  Object.values(gains).forEach(g=>g.connect(ctx.destination));
  const gate=new OpsisDspRouting.RouteGate(ctx,gains);
  const choose=(ready,external=false)=>OpsisDspRouting.selectRoute({masterEnabled:true,externalBypass:external,preferWorklet:true,workletReady:ready});
  const first=ctx.suspend(1).then(()=>{gate.select(choose(true));return ctx.resume();});
  const second=ctx.suspend(2).then(()=>{gate.select(choose(true,true));return ctx.resume();});
  const third=ctx.suspend(3).then(()=>{gate.select(choose(false));return ctx.resume();});
  src.start();const switched=await ctx.startRendering();await Promise.all([first,second,third]);
  const ch=switched.getChannelData(0),expected=[3,6,0,3],measured=[];
  for(let i=0;i<4;i++){
    let sum=0;const start=rate*i+rate/4,end=rate*i+rate*3/4;
    for(let n=start;n<end;n++)sum+=ch[n]**2;
    const gain=10*Math.log10(sum/(end-start)/(.025*.025/2));
    measured.push(gain);
    if(Math.abs(gain-expected[i])>.2)throw Error('route gain '+i+': '+gain);
  }
  if(failed)throw Error('worklet processor error');
  return {wet,dry,routes:measured};
};
