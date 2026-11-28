import {instantiateDsp,configValues} from './wasm-dsp.mjs';
class OpsisTestProcessor extends AudioWorkletProcessor{
  constructor(options){
    super();
    this.dsp=instantiateDsp(options.processorOptions.module,sampleRate);
    const d=this.dsp;d.settings.set(configValues(options.processorOptions.config));
    if(d.e.opsis_wasm_configure()!==1)throw Error('initial settings rejected');
    d.e.opsis_wasm_reset();
    this.failed=false;
    this.pending=null;
    this.port.onmessage=({data})=>{
      if(data?.type!=='settings')return;
      try{this.pending=configValues(data.config);}catch{this.port.postMessage({type:'invalid-settings'});}
    };
    this.port.postMessage({type:'ready'});
  }
  process(inputs,outputs){
    const out=outputs[0],input=inputs[0];
    if(!out||out.length!==2)return false;
    const n=out[0].length,d=this.dsp;
    if(this.failed||n>2048||out[1].length!==n){out[0].fill(0);out[1].fill(0);return false;}
    try{
      if(this.pending){
        d.settings.set(this.pending);
        // A prior 10ms transition may still be in progress. Coalesce to latest.
        if(d.e.opsis_wasm_configure()===1)this.pending=null;
      }
      const l=input?.[0],r=input?.[1]||l;
      for(let i=0;i<n;i++){d.left[i]=l?.[i]??0;d.right[i]=r?.[i]??0;}
      if(d.e.opsis_wasm_process(n)!==1)throw Error('DSP processing rejected');
      for(let i=0;i<n;i++){out[0][i]=d.left[i];out[1][i]=d.right[i];}
      return true;
    }catch{
      this.failed=true;out[0].fill(0);out[1].fill(0);this.port.postMessage({type:'failed'});return false;
    }
  }
}
registerProcessor('opsis-test-dsp',OpsisTestProcessor);
