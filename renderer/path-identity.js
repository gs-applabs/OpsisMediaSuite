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
 // Convert local paths without interpreting literal #, %, ? or spaces as
 // URL syntax. Keep identity separate from URL encoding and permission checks.
 function fileUrl(p){
  if(typeof p!=='string'||!p||/[\x00-\x1f\x7f]/.test(p)||/^[\\/]{2}/.test(p))return '';
  try{
   if(/^[a-z]:[\\/]/i.test(p)){
    if(p.slice(2).includes(':'))return '';
    return 'file:///'+p.slice(0,2)+p.slice(2).replace(/\\/g,'/').split('/').map(encodeURIComponent).join('/');
   }
   if(p.startsWith('/'))return 'file://'+p.split('/').map(encodeURIComponent).join('/');
  }catch{}
  return '';
 }
 return Object.freeze({key,fileUrl});
});
