'use strict';
// M3U / M3U8 playlist reading for the video tab: only absolute drive-letter Windows paths (no UNC) and http(s) URLs are kept; relative entries are resolved against the playlist folder.
const fs = require('fs');
const path = require('path');
const {decodeText}=require('./decode-text');
const MAX_LINES = 5000, MAX_PATH = 2048, MAX_BYTES=8*1024*1024;

function validRef(p) {
  if (typeof p !== 'string' || !p || p.length > MAX_PATH || /[\x00-\x1f\x7f]/.test(p)) return false;
  if (/^https?:\/\/[^\s]+$/i.test(p)) return true;
  return /^[A-Za-z]:[\\/]/.test(p) && !p.slice(2).includes(':'); // drive-letter paths only: UNC is refused (NTLM leak risk via a malicious .m3u)
}
function* lines(text) {
  // Avoid allocating an array of every line in a comment-heavy playlist.
  const source=String(text||'');
  if(source.length>MAX_BYTES)return;
  for(let offset=0;offset<source.length;){
    const lf=source.indexOf('\n',offset),end=lf===-1?source.length:lf;
    const line=source.slice(offset,end).trim();offset=end+1;
    if(line)yield line;
  }
}
function parseM3u(text, baseDir) {
  const items = []; let skipped = 0;
  for (const l of lines(text)) {
    // Count media entries, not EXTINF/comment lines, towards the playlist limit.
    if (items.length >= MAX_LINES) break;
    if (l.startsWith('#')) continue;
    let ref = l;
    if (!validRef(ref) && typeof baseDir==='string' && /^[a-z]:[\\/]/i.test(baseDir) &&
        ref.length<=MAX_PATH && !/[\x00-\x1f\x7f]/.test(ref) && !/^[a-z][a-z0-9+.-]*:/i.test(ref) && !/^[\\/]{2}/.test(ref)) ref = path.win32.resolve(baseDir, ref); // refs are Windows paths: win32 rules keep this deterministic on any OS
    if (validRef(ref)) items.push(ref); else skipped++;
  }
  return { items, skipped };
}
function readM3uFile(file) {
  try {
    if (!path.isAbsolute(file) || !/\.m3u8?$/i.test(file)) return null;
    const safe=require('./local-media-policy').localPath(file);
    if(!safe||! /\.m3u8?$/i.test(safe))return null;
    const fd=fs.openSync(safe,'r');
    let bytes;
    try{
      const st=fs.fstatSync(fd);
      if(!st.isFile()||st.size>MAX_BYTES)return null;
      const buffer=Buffer.alloc(st.size+1);let n=0,k;
      while(n<buffer.length&&(k=fs.readSync(fd,buffer,n,buffer.length-n,null))>0)n+=k;
      const after=fs.fstatSync(fd);
      if(n!==st.size||after.size!==st.size||after.mtimeMs!==st.mtimeMs)return null;
      bytes=buffer.subarray(0,n);
    }finally{fs.closeSync(fd);}
    // M3U8 is UTF-8 by definition; legacy M3U can use Greek Windows encoding.
    const decoded=/\.m3u8$/i.test(safe)?new TextDecoder('utf-8',{fatal:true}).decode(bytes):decodeText(bytes);
    const r=parseM3u(decoded,path.dirname(safe));
    const name = path.basename(file).replace(/\.m3u8?$/i, '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) || 'Playlist';
    return { name, ...r };
  } catch (_) { return null; }
}
// Portable UTF-8 extended M3U, no injected tags or line breaks.
function serializeM3u(items){
 if(!Array.isArray(items)||items.length>2000)throw Error('playlist-limit');
 if(items.some(p=>!validRef(p)||/[\x00-\x1f\x7f]/.test(p)))throw Error('invalid-playlist-entry');
 return '#EXTM3U\r\n'+items.join('\r\n')+'\r\n';
}
module.exports = { validRef, parseM3u, readM3uFile, serializeM3u };
