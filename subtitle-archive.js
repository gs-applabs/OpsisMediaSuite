'use strict';
// Deliberately limited standard ZIP reader: no ZIP64, encryption, multi-disk
// archives or filesystem extraction. Bound actual inflation, not just metadata.
const {inflateRawSync}=require('node:zlib');
const MAX_ARCHIVE=20*1024*1024,MAX_ENTRY=5*1024*1024,MAX_TOTAL=20*1024*1024;
const {canonicalSrt}=require('./subtitle-sidecar');
const crcTable=Uint32Array.from({length:256},(_,i)=>{for(let j=0;j<8;j++)i=i&1?0xedb88320^(i>>>1):i>>>1;return i>>>0;});
function crc32(buf){let c=0xffffffff;for(const b of buf)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function zipSubtitles(buf,decode){
 if(!Buffer.isBuffer(buf)||buf.length<22||buf.length>MAX_ARCHIVE)throw Error('archive-size');
 let end=-1;
 for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--)if(buf.readUInt32LE(i)===0x06054b50&&i+22+buf.readUInt16LE(i+20)===buf.length){end=i;break;}
 if(end<0||buf.readUInt16LE(end+4)||buf.readUInt16LE(end+6))throw Error('unsupported-zip');
 const count=buf.readUInt16LE(end+10),size=buf.readUInt32LE(end+12),start=buf.readUInt32LE(end+16);
 if(count!==buf.readUInt16LE(end+8)||count>128||start+size!==end)throw Error('unsupported-zip');
 const out=[];let cursor=start,total=0;
 for(let i=0;i<count;i++){
  if(cursor+46>end||buf.readUInt32LE(cursor)!==0x02014b50)throw Error('invalid-zip');
  const flags=buf.readUInt16LE(cursor+8),method=buf.readUInt16LE(cursor+10),crc=buf.readUInt32LE(cursor+16);
  const compressed=buf.readUInt32LE(cursor+20),length=buf.readUInt32LE(cursor+24);
  const nl=buf.readUInt16LE(cursor+28),xl=buf.readUInt16LE(cursor+30),cl=buf.readUInt16LE(cursor+32),disk=buf.readUInt16LE(cursor+34);
  const attr=buf.readUInt32LE(cursor+38),offset=buf.readUInt32LE(cursor+42),next=cursor+46+nl+xl+cl;
  if(next>end||disk||!nl)throw Error('invalid-zip');
  const rawName=buf.subarray(cursor+46,cursor+46+nl);
  const name=rawName.toString('utf8').replace(/\\/g,'/');cursor=next;
  // Ignore directory entries, traversal, symlinks, executable or unrelated files.
  if(name.startsWith('/')||name.includes(':')||name.split('/').includes('..')||/[\x00-\x1f]/.test(name)||((attr>>>16)&0xf000)===0xa000)continue;
  const leaf=name.split('/').pop(),ext=leaf.split('.').pop().toLowerCase();
  if(!['srt','vtt','ass','ssa'].includes(ext)||!leaf.includes('.'))continue;
  if((flags&0x2041)||![0,8].includes(method)||!length||length>MAX_ENTRY||compressed>MAX_ARCHIVE||total+length>MAX_TOTAL||out.length>=16)throw Error('archive-limit');
  if(offset+30>start||buf.readUInt32LE(offset)!==0x04034b50)throw Error('invalid-zip');
  const localNameLength=buf.readUInt16LE(offset+26),localExtra=buf.readUInt16LE(offset+28);
  const data=offset+30+localNameLength+localExtra;
  if(data+compressed>start||buf.readUInt16LE(offset+6)!==flags||buf.readUInt16LE(offset+8)!==method||!buf.subarray(offset+30,offset+30+localNameLength).equals(rawName))throw Error('invalid-zip');
  const payload=buf.subarray(data,data+compressed);
  const bytes=method===0?payload:inflateRawSync(payload,{maxOutputLength:Math.min(length,MAX_ENTRY)});
  if(bytes.length!==length||crc32(bytes)!==crc)throw Error('invalid-zip-crc');
  total+=length;
  const sub={name:leaf.slice(0,250),ext,text:decode(bytes)};
  if(canonicalSrt(sub))out.push(sub);
 }
 if(cursor!==end)throw Error('invalid-zip');
 return out;
}
module.exports={zipSubtitles,MAX_ARCHIVE,crc32};
