'use strict';
// Engine-neutral session contract for P1. Adapters are supplied by the host;
// this module never loads external filters or launches untrusted processes.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.OpsisPlayback=factory();})(typeof self!=='undefined'?self:this,function(){
const ENGINES=Object.freeze(['libvlc','directshow','media-foundation','chromium']);
const METHODS=['open','play','pause','seek','stop','dispose'];
function candidates({available=[],preferred='auto',local=true}={}) {
  const order=local?ENGINES:['libvlc','chromium','media-foundation'];
  const ids=new Set(available.filter(x=>ENGINES.includes(x)));
  return [...new Set([...(ENGINES.includes(preferred)?[preferred]:[]),...order])].filter(x=>ids.has(x) && (local||x!=='directshow'));
}
class PlaybackSession {
  constructor(adapters={}) { this.adapters=adapters;this.generation=0;this.active=null;this.state='idle';this.attempts=[]; }
  async open(source,options={}) {
    const g=++this.generation,old=this.active;this.active=null;this.state='opening';this.attempts=[];
    if(old)await this._dispose(old);
    if(g!==this.generation)return {ok:false,code:'superseded'};
    for(const id of candidates({...options,available:Object.keys(this.adapters)})) {
      let adapter;
      try {
        adapter=await this.adapters[id]();
        if(!METHODS.every(k=>typeof adapter[k]==='function'))throw Error('invalid-adapter');
        if(g!==this.generation){await this._dispose(adapter);return {ok:false,code:'superseded'};}
        const result=await adapter.open(source);
        if(g!==this.generation){await this._dispose(adapter);return {ok:false,code:'superseded'};}
        if(!result||result.ok!==true)throw Error('open-failed');
        this.active=adapter;this.state='ready';this.attempts.push({id,ok:true});return {ok:true,engine:id,attempts:[...this.attempts]};
      } catch(e) {
        if(adapter)await this._dispose(adapter);
        if(g!==this.generation)return {ok:false,code:'superseded'};
        this.attempts.push({id,ok:false,code:String(e?.message||'failed').slice(0,160)});
        if(options.fallback===false)break;
      }
    }
    if(g!==this.generation)return {ok:false,code:'superseded'};
    this.state='error';return {ok:false,code:'no-engine',attempts:[...this.attempts]};
  }
  async _dispose(adapter){try{await adapter.dispose();}catch(_){}}
  async play(){if(!this.active)return false;const a=this.active;await a.play();if(a!==this.active)return false;this.state='playing';return true;}
  async pause(){if(!this.active)return false;const a=this.active;await a.pause();if(a!==this.active)return false;this.state='paused';return true;}
  async seek(seconds){if(!this.active||!Number.isFinite(seconds)||seconds<0)return false;const a=this.active;await a.seek(seconds);return a===this.active;}
  async stop(){++this.generation;const a=this.active;this.active=null;this.state='idle';if(a){try{await a.stop();}finally{await this._dispose(a);}}}
}
return {ENGINES,candidates,PlaybackSession};
});
