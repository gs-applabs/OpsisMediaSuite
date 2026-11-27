'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {allowedFile,localDirectory,localPath}=require('./local-media-policy');
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
// Compare only bounded, validated existing sibling files; no arbitrary reads.
async function sameSubtitle(target,body){
 const safe=localPath(target);if(!safe)return false;
 let fd;
 try{
  fd=await fs.open(safe,'r');const st=await fd.stat();
  if(!st.isFile()||st.size>MAX||st.size===0)return false;
  const data=Buffer.alloc(st.size);let offset=0;
  while(offset<data.length){const rr=await fd.read(data,offset,data.length-offset,offset);if(!rr.bytesRead)return false;offset+=rr.bytesRead;}
  const text=new TextDecoder('utf-8',{fatal:true}).decode(data);
  return canonicalSrt({ext:'srt',text})===body;
 }catch{return false;}finally{try{await fd?.close();}catch{}}
}
function sidecarStem(source){
 const stem=path.basename(source,path.extname(source));
 // Windows uses UTF-16 filename units, POSIX commonly uses UTF-8 bytes.
 let base='';for(const ch of stem){if(base.length+ch.length>200||Buffer.byteLength(base+ch,'utf8')>200)break;base+=ch;}
 return base.replace(/[. ]+$/,'')||'video';
}
async function saveBesideVideo({video,subtitle,language,extensions,approved,synced=false}){
 const source=allowedFile(video,extensions);
 if(!source||!approved(source))return {ok:false,code:'video-not-approved'};
 const parent=localDirectory(path.dirname(source));
 if(!parent)return {ok:false,code:'invalid-directory'};
 const body=canonicalSrt(subtitle);
 if(!body)return {ok:false,code:'invalid-subtitle'};
 const lang=LANGS.has(language)?language:'und';
 const base=sidecarStem(source),suffix=lang+(synced===true?'.synced':'');
 // Search all existing numbered copies first, even if an earlier slot was removed.
 for(let i=1;i<=30;i++){
  const name=base+'.'+suffix+(i===1?'':'.'+i)+'.srt';
  if(!approved(source)||allowedFile(source,extensions)!==source)return {ok:false,code:'video-no-longer-approved'};
  if(await sameSubtitle(path.join(parent,name),body))return {ok:true,name,reused:true};
 }
 for(let i=1;i<=30;i++){
  const name=base+'.'+suffix+(i===1?'':'.'+i)+'.srt';
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
// Filename-only audit: an unlabeled track is unknown, not proof of Greek.
const TEXT_EXTS=new Set(['srt','vtt','ass','ssa','sub','ttml','dfxp']);
function classifyName(video,name){
 const ext=path.extname(name).slice(1).toLowerCase();if(!TEXT_EXTS.has(ext))return null;
 const original=path.basename(video,path.extname(video)).toLowerCase(),base=sidecarStem(video).toLowerCase();
 const stem=path.basename(name,path.extname(name)).toLowerCase();
 if(stem===original||stem===base)return 'unknown';
 const prefix=stem.startsWith(original+'.')?original:stem.startsWith(base+'.')?base:null;
 if(!prefix)return null;
 const tokens=stem.slice(prefix.length+1).split(/[. _-]+/);
 if(tokens.some(t=>['el','ell','gre','gr','greek','ελληνικά','ελληνικα'].includes(t)))return 'greek';
 if(tokens.some(t=>LANGS.has(t)&&t!=='und'||['eng','english','fra','fre','ger','deu','ita','spa'].includes(t)))return 'other';
 return 'unknown';
}
async function auditSubtitles({videos,extensions,approved}){
 const rows=[],dirs=new Map(),seen=new Set();
 for(const input of videos.slice(0,200)){
  const source=allowedFile(input,extensions);
  if(!source||!approved(source)){rows.push({path:input,status:'not-approved'});continue;}
  if(seen.has(source))continue;seen.add(source);
  const dir=path.dirname(source);
  if(!dirs.has(dir)){
   let entries=[],complete=true,handle;
   try{
    handle=await fs.opendir(dir);
    for await(const e of handle){
     if(entries.length>=10000){complete=false;break;}
     entries.push(e);
    }
   }catch{complete=false;}
   dirs.set(dir,{entries,complete});
  }
  const {entries,complete}=dirs.get(dir);let greek=false,unknown=false,other=false;
  for(const entry of entries){
   if(!entry.isFile())continue;
   const kind=classifyName(source,entry.name);if(!kind)continue;
   const safe=localPath(path.join(dir,entry.name));if(!safe)continue;
   try{const st=await fs.stat(safe);if(!st.size||st.size>MAX)continue;}catch{continue;}
   if(kind==='greek')greek=true;else if(kind==='unknown')unknown=true;else other=true;
  }
  rows.push({path:input,status:greek?'greek':!complete?'incomplete':unknown?'unknown':other?'other-language':'missing'});
 }
 return {rows,truncated:videos.length>200};
}
module.exports={saveBesideVideo,canonicalSrt,website,sidecarStem,classifyName,auditSubtitles};
