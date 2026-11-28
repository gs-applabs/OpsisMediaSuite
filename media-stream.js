'use strict';
const fs = require('node:fs');
const { Readable } = require('node:stream');
const MIME = Object.freeze({mp4:'video/mp4',m4v:'video/mp4',mkv:'video/x-matroska',webm:'video/webm',mov:'video/quicktime',avi:'video/x-msvideo',wmv:'video/x-ms-wmv',flv:'video/x-flv',mpg:'video/mpeg',mpeg:'video/mpeg',ts:'video/mp2t',m2ts:'video/mp2t',ogv:'video/ogg','3gp':'video/3gpp',mp3:'audio/mpeg',wav:'audio/wav',flac:'audio/flac',ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/ogg',m4a:'audio/mp4',aac:'audio/aac',wma:'audio/x-ms-wma',aiff:'audio/aiff',aif:'audio/aiff'});
function parseRange(value,size) {
  if (!Number.isSafeInteger(size) || size < 0) return null;
  if (!value) return {start:0,end:size-1,partial:false};
  const m=/^bytes=(\d*)-(\d*)$/.exec(value);
  if (!m || (!m[1]&&!m[2]) || size===0) return null;
  const first=m[1]===''?null:Number(m[1]), last=m[2]===''?null:Number(m[2]);
  if ((first!==null&&!Number.isSafeInteger(first)) || (last!==null&&!Number.isSafeInteger(last))) return null;
  if (first===null) { if(last===0)return null; return {start:Math.max(0,size-last),end:size-1,partial:true}; }
  if(first>=size || (last!==null&&last<first))return null;
  return {start:first,end:last===null?size-1:Math.min(last,size-1),partial:true};
}
async function serveFile(p,ext,req) {
  const h=await fs.promises.open(p,'r');
  let stream;
  try {
    const st=await h.stat(); if(!st.isFile())return new Response(null,{status:404});
    const range=parseRange(req.headers.get('range'),st.size);
    const headers=new Headers({'Content-Type':MIME[ext]||'application/octet-stream','Accept-Ranges':'bytes','Access-Control-Allow-Origin':'null','Access-Control-Expose-Headers':'Content-Range, Accept-Ranges, Content-Length','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    if(!range){headers.set('Content-Range','bytes */'+st.size);return new Response(null,{status:416,headers});}
    const len=Math.max(0,range.end-range.start+1);headers.set('Content-Length',String(len));
    if(range.partial)headers.set('Content-Range',`bytes ${range.start}-${range.end}/${st.size}`);
    const status=range.partial?206:200;
    if(req.method==='HEAD'||len===0)return new Response(null,{status,headers});
    stream=h.createReadStream({start:range.start,end:range.end,autoClose:true});
    const abort=()=>stream.destroy(); req.signal?.addEventListener('abort',abort,{once:true});
    stream.once('close',()=>req.signal?.removeEventListener('abort',abort));
    if(req.signal?.aborted)stream.destroy();
    return new Response(Readable.toWeb(stream),{status,headers});
  } finally { if(!stream)await h.close(); }
}
module.exports={parseRange,serveFile,MIME};
