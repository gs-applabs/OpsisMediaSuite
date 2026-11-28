'use strict';
// Recovered old branch atomic writer, extended to preserve the stronger
// current state-store guarantees. Only for replacement-style state files.
// Media outputs that must never overwrite use their existing link contract.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
function regularOrMissing(file,io){
 try{const st=io.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)throw Error('unsafe-state-destination');}
 catch(e){if(e.code!=='ENOENT')throw e;}
}
function atomicWrite(file,data,{io=fs}={}){
 regularOrMissing(file,io);
 const temp=path.join(path.dirname(file),'.opsis-state-'+randomUUID()+'.tmp');
 let fd,owned=false;
 try{
  fd=io.openSync(temp,'wx',0o600);owned=true;
  io.writeFileSync(fd,data);io.fsyncSync(fd);
  const close=fd;fd=undefined;io.closeSync(close);
  regularOrMissing(file,io);
  io.renameSync(temp,file);owned=false;
 }finally{
  if(fd!==undefined)try{io.closeSync(fd);}catch{}
  if(owned)try{io.unlinkSync(temp);}catch{}
 }
}
module.exports={atomicWrite};
