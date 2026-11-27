'use strict';
const path=require('node:path');
const {execFile}=require('node:child_process');
const {localPath}=require('./local-media-policy');
const GREEK=new Set(['el','ell','gre','gr','greek']);
function run(exe,args,timeout=3000){
 return new Promise(resolve=>execFile(exe,args,{cwd:path.dirname(exe),windowsHide:true,timeout,maxBuffer:256*1024},(err,stdout)=>resolve(err?null:stdout)));
}
async function resolveProbe(ffmpeg){
 if(!ffmpeg||!path.isAbsolute(ffmpeg))return null;
 const exe=localPath(path.join(path.dirname(ffmpeg),process.platform==='win32'?'ffprobe.exe':'ffprobe'));
 if(!exe)return null;
 const version=await run(exe,['-version']);
 return version&&/^ffprobe version /i.test(version)?exe:null;
}
function parseTracks(text){
 try{
  const data=JSON.parse(text);
  if(!Array.isArray(data.streams)||data.streams.length>128)return null;
  const tracks=[];
  for(const row of data.streams){
   if(!Number.isSafeInteger(row?.index)||row.index<0||row.index>65535)return null;
   const language=typeof row.tags?.language==='string'?row.tags.language.toLowerCase().split(/[-_]/)[0].slice(0,20):'';
   tracks.push({index:row.index,codec:typeof row.codec_name==='string'?row.codec_name.slice(0,50):'',language:GREEK.has(language)?'el':language});
  }
  return tracks;
 }catch{return null;}
}
async function probeMkv(exe,file){
 if(!exe||!file||path.extname(file).toLowerCase()!=='.mkv'||localPath(file)!==file)return null;
 // Fixed Matroska demuxer, no arbitrary protocol/format or external URL.
 // Still native parsing of untrusted media, not a sandbox.
 const output=await run(exe,['-v','error','-protocol_whitelist','file,pipe','-f','matroska','-probesize','1048576','-analyzeduration','1000000','-select_streams','s','-show_entries','stream=index,codec_name:stream_tags=language','-of','json','-i',file]);
 return output===null?null:parseTracks(output);
}
const TEXT_CODECS=new Set(['subrip','ass','ssa','webvtt','text','mov_text']);
function canExtract(track){return !!track&&TEXT_CODECS.has(track.codec)&&Number.isSafeInteger(track.index)&&track.index>=0&&track.index<=65535;}
async function extractMkv(ffmpeg,file,track){
 if(!ffmpeg||!canExtract(track)||path.extname(file).toLowerCase()!=='.mkv'||localPath(file)!==file)return null;
 // One explicitly chosen text stream, output only to stdout, bounded by size/time.
 const text=await new Promise(resolve=>execFile(ffmpeg,['-hide_banner','-nostdin','-v','error','-protocol_whitelist','file,pipe','-f','matroska','-i',file,'-map','0:'+track.index,'-vn','-an','-dn','-c:s','srt','-f','srt','pipe:1'],{cwd:path.dirname(ffmpeg),windowsHide:true,timeout:30000,maxBuffer:5*1024*1024},(err,stdout)=>resolve(err?null:stdout)));
 if(!text)return null;
 const body=require('./subtitle-sidecar').canonicalSrt({ext:'srt',text});
 return body?{name:path.basename(file,path.extname(file))+'.embedded-'+track.index+'.srt',ext:'srt',text:body}:null;
}
module.exports={resolveProbe,parseTracks,probeMkv,canExtract,extractMkv};
