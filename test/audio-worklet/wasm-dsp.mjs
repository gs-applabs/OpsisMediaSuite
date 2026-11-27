// ES module shared by the standalone test page and the AudioWorklet.
// The WASM artifact is supplied only by the local test build.
export function instantiateDsp(module,rate){
  const imports={};
  // Standalone Emscripten may import unused WASI functions; fail closed if
  // any such function is actually called. No filesystem/network host access.
  for(const entry of WebAssembly.Module.imports(module)){
    if(entry.kind!=='function'||!['wasi_snapshot_preview1','env'].includes(entry.module))throw Error('unexpected wasm import');
    if(!['proc_exit','fd_write','fd_close','fd_seek','environ_get','environ_sizes_get','emscripten_notify_memory_growth','emscripten_resize_heap','abort','__assert_fail'].includes(entry.name))throw Error('unexpected wasm import '+entry.name);
    (imports[entry.module]??={})[entry.name]=()=>{throw Error('unexpected wasm host call '+entry.name);};
  }
  const instance=new WebAssembly.Instance(module,imports),e=instance.exports;
  if(typeof e._initialize==='function')e._initialize();
  if(e.opsis_wasm_init(rate)!==1)throw Error('unsupported rate');
  const mem=e.memory.buffer;
  const settings=new Float32Array(mem,e.opsis_wasm_settings(),20);
  const left=new Float32Array(mem,e.opsis_wasm_plane(0),2048);
  const right=new Float32Array(mem,e.opsis_wasm_plane(1),2048);
  return {e,settings,left,right};
}
export function configValues(c){
  if(c?.version!==2||c.base?.version!==1||!Array.isArray(c.base.eq_db)||c.base.eq_db.length!==10)throw Error('invalid settings');
  const b=c.base;
  const values=[b.enabled,...b.eq_db,b.bass_db,b.presence_percent,b.balance_percent,b.surround_percent,b.preamp_db,c.compressor_mode,c.ambience_percent,c.exciter_percent,c.limiter];
  const ranges=[[0,1],...Array.from({length:11},()=>[-12,12]),[0,100],[-100,100],[0,100],[-24,12],[0,3],[0,100],[0,100],[0,1]];
  if(!values.every((v,i)=>typeof v==='number'&&Number.isFinite(v)&&v>=ranges[i][0]&&v<=ranges[i][1])||![0,16,19].every(i=>Number.isInteger(values[i])))throw Error('invalid settings');
  return values;
}
