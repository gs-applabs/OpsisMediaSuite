'use strict';
// A single local-file identity rule for music and converter queues.
// Not a permission check, content hash, realpath resolver or URL normalizer.
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.OpsisPathIdentity=factory();
})(typeof self!=='undefined'?self:this,function(){
 function key(p){
  if(typeof p!=='string'||!p)return '';
  return /^[a-z]:[\\/]/i.test(p)?p.replace(/\\/g,'/').toLowerCase():p;
 }
 return Object.freeze({key});
});
