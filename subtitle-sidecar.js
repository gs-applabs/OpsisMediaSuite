'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {allowedFile,localDirectory,localPath}=require('./local-media-policy');
const VP=require('./renderer/vplib');
const {createHash,randomBytes}=require('node:crypto');
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
 if(stem.length<=200&&Buffer.byteLength(stem,'utf8')<=200&&!/[. ]$/.test(stem)&&stem)return stem;
 // A shortened prefix alone aliases distinct long names. Use a digest of
 // the full original stem; discovery uses this same deterministic function.
 let base='';for(const ch of stem){if(base.length+ch.length>176||Buffer.byteLength(base+ch,'utf8')>176)break;base+=ch;}
 return (base.replace(/[. ]+$/,'')||'video')+'~'+createHash('sha256').update(stem).digest('hex').slice(0,20);
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
  // Stage a complete file in the same directory; publish by exclusive
  // hard link. No partial final .srt, no rename-over-existing fallback.
  const stage=path.join(parent,'.opsis-sub-'+randomBytes(16).toString('hex')+'.tmp');
  let file,created=false;
  try{
   file=await fs.open(stage,'wx',0o600);created=true;
   await file.writeFile(body,{encoding:'utf8'});await file.sync();await file.close();file=null;
   if(localDirectory(path.dirname(source))!==parent||allowedFile(source,extensions)!==source||!approved(source))return {ok:false,code:'video-no-longer-approved'};
   await fs.link(stage,target);
   return {ok:true,name};
  }catch(e){
   if(e.code==='EEXIST'&&created){
    if(await sameSubtitle(target,body))return {ok:true,name,reused:true};
    continue;
   }
   return {ok:false,code:!created?'folder-not-writable':'write-failed'};
  }finally{try{await file?.close();}catch{}if(created)try{await fs.unlink(stage);}catch{}}
 }
 return {ok:false,code:'filename-limit'};
}
// Adjacent filename tags and optional bounded text evidence; neither proves dialogue quality.
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
function detectGreekScript(sub){
 if(!sub||!['srt','vtt','ass','ssa'].includes(sub.ext)||typeof sub.text!=='string')return 'unknown';
 const cues=VP.subtitleToVtt(sub.text,sub.ext,0).entries;
 if(!cues.length)return 'invalid';
 const text=cues.slice(0,100).map(c=>c.text.replace(/<[^>]*>|\{[^}]*\}/g,'')).join(' ').slice(0,20000);
 let greek=0,letters=0;
 for(const ch of text){if(/\p{L}/u.test(ch)){letters++;if(/\p{Script=Greek}/u.test(ch))greek++;}}
 if(greek>=20&&greek/letters>=.8)return 'greek';
 if(letters>=50&&greek/letters<=.05)return 'non-greek';
 return 'unknown';
}
async function inspectText(file,decode){
 let fd;
 try{
  fd=await fs.open(file,'r');const st=await fd.stat();
  if(!st.isFile()||st.size<=0||st.size>MAX)return 'invalid';
  const size=Math.min(st.size,128*1024),data=Buffer.alloc(size);let offset=0;
  while(offset<size){const rr=await fd.read(data,offset,size-offset,offset);if(!rr.bytesRead)return 'unknown';offset+=rr.bytesRead;}
  // A partial sample may cut a cue or UTF-8 codepoint. Only accept positive
  // evidence; an invalid parse of a partial sample is inconclusive.
  const detected=detectGreekScript({ext:path.extname(file).slice(1).toLowerCase(),text:decode(data)});
  return size<st.size&&detected==='invalid'?'unknown':detected;
 }catch{return 'unknown';}finally{try{await fd?.close();}catch{}}
}
async function auditSubtitles({videos,extensions,approved,decode,embeddedProbe}){
 const started=Date.now();let textBudget=96,probeBudget=20,dirBudget=20000,compareBudget=200000,statBudget=1000;
 const rows=[],dirs=new Map(),seen=new Set();
 for(const input of videos.slice(0,200)){
  const source=allowedFile(input,extensions);
  if(!source||!approved(source)){rows.push({path:input,status:'not-approved'});continue;}
  if(seen.has(source))continue;seen.add(source);
  const dir=path.dirname(source);
  if(!dirs.has(dir)){
   let entries=[],complete=true,handle;
   try{
    if(dirBudget<=0||Date.now()-started>=35000){complete=false;}
    else{
      handle=await fs.opendir(dir);
      for await(const e of handle){
       if(dirBudget<=0||entries.length>=10000||Date.now()-started>=35000){complete=false;break;}
       dirBudget--;
       if(e.isFile()&&TEXT_EXTS.has(path.extname(e.name).slice(1).toLowerCase()))entries.push(e);
      }
    }
   }catch{complete=false;}
   dirs.set(dir,{entries,complete});
  }
  const {entries,complete}=dirs.get(dir);let scanComplete=complete,greek=false,unknown=false,other=false,greekContent=false,conflict=false;
  for(const entry of entries){
   if(compareBudget--<=0||Date.now()-started>=35000||!approved(source)){scanComplete=false;break;}
   if(!entry.isFile())continue;
   const kind=classifyName(source,entry.name);if(!kind)continue;
   if(statBudget--<=0){scanComplete=false;break;}
   const safe=localPath(path.join(dir,entry.name));if(!safe)continue;
   try{const st=await fs.stat(safe);if(!st.size||st.size>MAX)continue;}catch{continue;}
   let evidence='unknown';
   if(decode&&textBudget>0&&Date.now()-started<35000&&approved(source)&&['.srt','.vtt','.ass','.ssa'].includes(path.extname(safe).toLowerCase())){textBudget--;evidence=await inspectText(safe,decode);}
   if(evidence==='invalid'){unknown=true;continue;}
   if(evidence==='greek'){greekContent=true;break;}
   if(kind==='greek'&&evidence==='non-greek'){conflict=true;unknown=true;continue;}
   if(kind==='greek')greek=true;else if(kind==='unknown'&&evidence!=='non-greek')unknown=true;else other=true;
  }
  let embedded='not-requested',tracks=null;
  if(embeddedProbe&&path.extname(source).toLowerCase()==='.mkv'){
   embedded='unchecked';
   if(!greekContent&&!greek&&probeBudget>0&&Date.now()-started<35000&&approved(source)){
    probeBudget--;tracks=await embeddedProbe(source).catch(()=>null);
    if(Array.isArray(tracks))embedded=tracks.some(x=>x.language==='el')?'greek-tag':tracks.some(x=>!x.language||x.language==='und')?'unknown':tracks.length?'other':'none';
   }
  }
  const status=greekContent||greek?'greek':embedded==='greek-tag'?'embedded-greek':!scanComplete||embedded==='unchecked'?'incomplete':unknown||embedded==='unknown'?'unknown':other||embedded==='other'?'other-language':'missing';
  rows.push({path:input,status,evidence:greekContent?'text-script':greek?'filename-tag':embedded==='greek-tag'?'embedded-tag':conflict?'tag-text-conflict':null,embedded});
 }
 return {rows,truncated:videos.length>200};
}
module.exports={saveBesideVideo,canonicalSrt,website,sidecarStem,classifyName,auditSubtitles,detectGreekScript};
