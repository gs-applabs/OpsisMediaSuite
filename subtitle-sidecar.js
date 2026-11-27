'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {allowedFile,localDirectory}=require('./local-media-policy');
const VP=require('./renderer/vplib');
const MAX=5*1024*1024;
const LANGS=new Set(['el','en','fr','de','it','es','pt','ru','tr','pl','nl','sv','da','no','fi','cs','sk','hu','ro','uk','und']);
const SITES=Object.freeze({subs4series:'https://www.subs4series.com/',subs4free:'https://www.subs4free.info/'});
function website(id){return typeof id==='string'&&Object.hasOwn(SITES,id)?SITES[id]:null;}
function canonicalSrt(sub){
 if(!sub||typeof sub.text!=='string'||Buffer.byteLength(sub.text,'utf8')>MAX||sub.text.includes('\0'))return null;
 if(!['srt','vtt','ass','ssa'].includes(sub.ext))return null;
 const result=VP.subtitleToVtt(sub.text,sub.ext,0);
 const body=VP.exportSubtitles(result.entries,'srt');
 return body&&Buffer.byteLength(body,'utf8')<=MAX?body:null;
}
async function saveBesideVideo({video,subtitle,language,extensions,approved}){
 const source=allowedFile(video,extensions);
 if(!source||!approved(source))return {ok:false,code:'video-not-approved'};
 const parent=localDirectory(path.dirname(source));
 if(!parent)return {ok:false,code:'invalid-directory'};
 const body=canonicalSrt(subtitle);
 if(!body)return {ok:false,code:'invalid-subtitle'};
 const lang=LANGS.has(language)?language:'und';
 const stem=path.basename(source,path.extname(source));
 // Leave room for language and numbered suffix on common filesystems.
 const base=Array.from(stem).slice(0,200).join('').replace(/[. ]+$/,'')||'video';
 for(let i=1;i<=30;i++){
  const name=base+'.'+lang+(i===1?'':'.'+i)+'.srt';
  const target=path.join(parent,name);
  if(localDirectory(path.dirname(source))!==parent||allowedFile(source,extensions)!==source||!approved(source))return {ok:false,code:'video-no-longer-approved'};
  let file;
  try{
   // Exclusive creation refuses an existing file or symlink; never overwrite.
   file=await fs.open(target,'wx',0o600);
  }catch(e){if(e.code==='EEXIST')continue;return {ok:false,code:'folder-not-writable'};}
  try{await file.writeFile(body,{encoding:'utf8'});await file.close();return {ok:true,name};}
  catch{try{await file.close();}catch{}return {ok:false,code:'write-failed'};}
 }
 return {ok:false,code:'filename-limit'};
}
module.exports={saveBesideVideo,canonicalSrt,website};
