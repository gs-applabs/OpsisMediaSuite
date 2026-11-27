/* Shared exclusive DSP route selection. No audio devices or persistence. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.OpsisDspRouting=factory();
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  function selectRoute({masterEnabled,externalBypass,preferWorklet,workletReady}){
    if(!masterEnabled||externalBypass)return 'dry';
    return preferWorklet===true&&workletReady===true?'worklet':'web';
  }
  class RouteGate{
    constructor(context,gains,initial='web',duration=.02){
      if(!gains.web||!gains.dry||!Object.hasOwn(gains,initial)||!Number.isFinite(duration)||duration<0||duration>.1)throw Error('invalid route gate');
      this.context=context;this.gains=Object.assign({},gains);this.keys=Object.keys(gains);
      if(this.keys.some(k=>!['web','dry','worklet'].includes(k)))throw Error('invalid route');
      this.duration=duration;this.target=initial;this.start=context.currentTime;this.end=this.start;
      this.from=this.keys.map(k=>k===initial?1:0);
      for(let i=0;i<this.keys.length;i++)this.gains[this.keys[i]].gain.setValueAtTime(this.from[i],this.start);
    }
    weights(at=this.context.currentTime){
      const f=this.end===this.start?1:Math.max(0,Math.min(1,(at-this.start)/(this.end-this.start)));
      return this.keys.map((k,i)=>this.from[i]*(1-f)+(k===this.target?1:0)*f);
    }
    select(route){
      if(!Object.hasOwn(this.gains,route))route='web';
      if(route===this.target)return route;
      const at=this.context.currentTime,values=this.weights(at);
      this.from=values;this.start=at;this.end=at+this.duration;this.target=route;
      for(let i=0;i<this.keys.length;i++){
        const key=this.keys[i],param=this.gains[key].gain;
        param.cancelScheduledValues(at);
        param.setValueAtTime(values[i],at);
        if(this.duration)param.linearRampToValueAtTime(key===route?1:0,this.end);
        else param.setValueAtTime(key===route?1:0,at);
      }
      return route;
    }
  }
  return {selectRoute,RouteGate};
});
