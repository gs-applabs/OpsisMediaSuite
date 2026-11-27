'use strict';
// On-demand folder enumeration only. No watcher, no writes, no automatic
// network access. Hard limits include examined non-audio entries.
const fs=require('node:fs/promises'),path=require('node:path');
const {localDirectory,localPath}=require('./local-media-policy');
const EXTS=new Set(['.mp3','.wav','.flac','.ogg','.m4a','.opus','.wma']);
async function scanFolder(root,{maxFiles=2000,maxEntries=20000,maxDepth=8,cancelled=()=>false}={}){
 const safe=localDirectory(root);if(!safe)throw Error('unsafe music folder');
 const files=[],queue=[{dir:safe,depth:0}];let examined=0,truncated=false,skipped=0;
 while(queue.length&&!cancelled()){
  const {dir,depth}=queue.shift();
  if(!localDirectory(dir)){skipped++;continue;}
  let handle;
  try{
   handle=await fs.opendir(dir);
   for await(const entry of handle){
    if(cancelled())break;
    if(++examined>maxEntries||files.length>=maxFiles){truncated=true;break;}
    if(entry.isSymbolicLink()){skipped++;continue;}
    const p=path.join(dir,entry.name);
    if(entry.isDirectory()){if(depth<maxDepth)queue.push({dir:p,depth:depth+1});else truncated=true;}
    else if(entry.isFile()&&EXTS.has(path.extname(entry.name).toLowerCase())){const file=localPath(p);if(file)files.push(file);else skipped++;}
   }
  }catch{skipped++;}finally{if(handle)await handle.close().catch(()=>{});}
  if(examined>maxEntries||files.length>=maxFiles){truncated=true;break;}
 }
 files.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));
 return {files,examined:Math.min(examined,maxEntries),truncated,skipped,cancelled:cancelled()};
}
module.exports={scanFolder};
