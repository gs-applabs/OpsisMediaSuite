'use strict';
// Lossless MP3 tag completion: append only missing simple ID3 frames, preserving
// every existing frame and all audio bytes. Refuse exotic or ambiguous headers.
const fs=require('node:fs/promises'), F=require('node:fs'), path=require('node:path');
const {randomUUID,createHash}=require('node:crypto'),{pipeline}=require('node:stream/promises');
const {Readable}=require('node:stream');
const fields={title:'TIT2',artist:'TPE1',album:'TALB',genre:'TCON',year:'TYER',composer:'TCOM',lyricist:'TEXT',albumartist:'TPE2'};
const maxTag=8*1024*1024, maxFile=512*1024*1024;
function syncRead(b){if(b.length!==4||b.some(x=>x>127))throw Error('invalid synchsafe size');return b.reduce((a,x)=>a*128+x,0);}
function syncWrite(n){return Buffer.from([(n>>>21)&127,(n>>>14)&127,(n>>>7)&127,n&127]);}
function infer(file){const parts=path.basename(file,path.extname(file)).split(' - ');return parts.length===2&&parts.every(x=>x.trim())?{artist:parts[0].trim(),title:parts[1].trim()}:{};}
function clean(values){const out={};for(const k of Object.keys(fields)){const v=values?.[k];if(typeof v==='string'&&v.trim()&&v.length<=250&&!/[\u0000-\u001f\u007f]/.test(v)&&(k!=='year'||/^\d{4}$/.test(v.trim())))out[k]=v.trim();}return out;}
// Local cover only: bounded JPEG/PNG, no overwrite of any existing picture.
function validateCover(cover){
 if(!cover||!Buffer.isBuffer(cover.data)||cover.data.length>2*1024*1024)return null;
 const b=cover.data, mime=b[0]===255&&b[1]===216?'image/jpeg':b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':null;
 const size=mime&&require('./renderer/photolib').headerSize(b);
 if(!size||!Number.isSafeInteger(size.width)||!Number.isSafeInteger(size.height)||size.width<1||size.height<1||size.width>4096||size.height>4096||size.width*size.height>16000000)return null;
 return {data:b,mime,width:size.width,height:size.height};
}
function patchTag(header,body,values,common={},cover=null){
 const has=header.subarray(0,3).toString()==='ID3';
 const version=has?header[3]:3;
 if(has&&(header.length!==10||![3,4].includes(version)||header[4]!==0||header[5]!==0||syncRead(header.subarray(6,10))!==body.length))throw Error('unsupported ID3 header');
 let offset=0;const ids=new Set();
 while(offset<body.length){
  if(body[offset]===0){if(body.subarray(offset).some(x=>x!==0))throw Error('invalid tag padding');break;}
  if(offset+10>body.length)throw Error('truncated frame');
  const id=body.toString('ascii',offset,offset+4);
  if(!/^[A-Z0-9]{4}$/.test(id))throw Error('invalid frame');
  const size=version===4?syncRead(body.subarray(offset+4,offset+8)):body.readUInt32BE(offset+4);
  if(!size||offset+10+size>body.length)throw Error('invalid frame size');
  ids.add(id);offset+=10+size;
 }
 const additions=[],applied={};
 for(const [k,v] of Object.entries(clean(values))){
  const id=k==='year'&&version===4?'TDRC':fields[k];
  if(common[k]||ids.has(id)||(k==='year'&&(ids.has('TYER')||ids.has('TDRC'))))continue;
  const data=Buffer.concat([Buffer.from([1,255,254]),Buffer.from(v,'utf16le')]);
  const frame=Buffer.alloc(10);frame.write(id);if(version===4)syncWrite(data.length).copy(frame,4);else frame.writeUInt32BE(data.length,4);
  additions.push(frame,data);applied[k]=v;
 }
 let coverApplied=false;
 if(cover&&!common.picture?.length&&!ids.has('APIC')){
  const data=Buffer.concat([Buffer.from([0]),Buffer.from(cover.mime+'\0','ascii'),Buffer.from([3,0]),cover.data]);
  const frame=Buffer.alloc(10);frame.write('APIC');if(version===4)syncWrite(data.length).copy(frame,4);else frame.writeUInt32BE(data.length,4);
  additions.push(frame,data);coverApplied=true;
 }
 if(!additions.length)return null;
 const next=Buffer.concat([body.subarray(0,offset),...additions,body.subarray(offset)]);
 if(next.length>maxTag)throw Error('tag too large');
 return {bytes:Buffer.concat([Buffer.from([73,68,51,version,0,0]),syncWrite(next.length),next]),applied,coverApplied};
}
// FLAC metadata blocks are copied verbatim except for the Vorbis comment block.
const flacFields={title:'TITLE',artist:'ARTIST',album:'ALBUM',genre:'GENRE',year:'DATE',composer:'COMPOSER',lyricist:'LYRICIST',albumartist:'ALBUMARTIST'};
function parseComments(b){
 let i=0;function u32(){if(i+4>b.length)throw Error('truncated comment');const n=b.readUInt32LE(i);i+=4;return n;}
 function take(n){if(n>b.length-i)throw Error('truncated comment');const x=b.subarray(i,i+n);i+=n;return x;}
 const vendor=take(u32()),count=u32();if(count>10000)throw Error('too many comments');
 const comments=[];for(let j=0;j<count;j++)comments.push(take(u32()));if(i!==b.length)throw Error('unexpected comment suffix');
 return {vendor,comments};
}
function commentBlock(vendor,comments){
 const len=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
 return Buffer.concat([len(vendor.length),vendor,len(comments.length),...comments.flatMap(c=>[len(c.length),c])]);
}
function patchFlac(blocks,values,common={},cover=null){
 if(!blocks.length||blocks[0].type!==0||blocks[0].data.length!==34||blocks.slice(1).some(b=>b.type===0)||blocks.filter(b=>b.type===4).length>1)throw Error('invalid FLAC metadata layout');
 const index=blocks.findIndex(b=>b.type===4);
 const {vendor,comments}=index<0?{vendor:Buffer.from('Opsis Media Suite'),comments:[]}:parseComments(blocks[index].data);
 const keys=new Set(comments.map(c=>c.toString('utf8').split('=',1)[0].toUpperCase()));
 const applied={};
 for(const [k,v] of Object.entries(clean(values))){const key=flacFields[k];if(common[k]||keys.has(key)||(k==='year'&&keys.has('YEAR')))continue;comments.push(Buffer.from(key+'='+v));applied[k]=v;}
 const coverApplied=!!(cover&&!common.picture?.length&&!blocks.some(b=>b.type===6)&&!keys.has('METADATA_BLOCK_PICTURE')&&!keys.has('COVERART'));
 if(!Object.keys(applied).length&&!coverApplied)return null;
 const next=blocks.slice();
 if(Object.keys(applied).length){const replacement={type:4,data:commentBlock(vendor,comments)};if(index<0)next.splice(1,0,replacement);else next[index]=replacement;}
 if(coverApplied){
  const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
  const mime=Buffer.from(cover.mime,'ascii');
  next.push({type:6,data:Buffer.concat([u32(3),u32(mime.length),mime,u32(0),u32(cover.width),u32(cover.height),u32(0),u32(0),u32(cover.data.length),cover.data])});
 }
 const pieces=[Buffer.from('fLaC')];let total=4;
 next.forEach((b,i)=>{if(b.type<0||b.type>6||b.data.length>0xffffff)throw Error('unsupported FLAC block');const h=Buffer.alloc(4);h[0]=b.type|(i===next.length-1?128:0);h.writeUIntBE(b.data.length,1,3);pieces.push(h,b.data);total+=4+b.data.length;});
 if(total>maxTag)throw Error('FLAC metadata too large');
 return {bytes:Buffer.concat(pieces),applied,coverApplied};
}
async function readFlac(h,stat,values,common,cover){
 const magic=Buffer.alloc(4);if((await h.read(magic,0,4,0)).bytesRead!==4||magic.toString()!=='fLaC')throw Error('invalid FLAC signature');
 let skip=4,done=false;const blocks=[];
 while(!done){
  const b=Buffer.alloc(4);if((await h.read(b,0,4,skip)).bytesRead!==4)throw Error('truncated FLAC block');
  const type=b[0]&127,n=b.readUIntBE(1,3);done=!!(b[0]&128);skip+=4;
  if(type>6||skip+n>maxTag||skip+n>=stat.size||blocks.length>=256)throw Error('unsupported FLAC metadata');
  const data=Buffer.alloc(n);if((await h.read(data,0,n,skip)).bytesRead!==n)throw Error('truncated FLAC block');
  blocks.push({type,data});skip+=n;
 }
 return {skip,patch:patchFlac(blocks,values,common,cover)};
}
async function complete(file,values,{cover:inputCover=null,cancelled=()=>false}={}){
 const cover=inputCover?validateCover(inputCover):null;if(inputCover&&!cover)throw Error('invalid cover');
 const checkCancelled=()=>{if(cancelled())throw Object.assign(Error('cancelled'),{code:'cancelled'});};checkCancelled();
 const ext=path.extname(file).toLowerCase();if(!path.isAbsolute(file)||!['.mp3','.flac'].includes(ext)||/^(\\\\|\/\/)/.test(file))throw Error('local MP3 or FLAC only');
 if(!require('./local-media-policy').localPath(file))throw Error('unsafe local path');
 const stat=await fs.lstat(file);if(!stat.isFile()||stat.nlink!==1||stat.size>maxFile||stat.size<10)throw Error('unsupported file');
 const real=await fs.realpath(file);if(path.resolve(file).toLowerCase()!==real.toLowerCase())throw Error('redirected path');
 const mm=await import('music-metadata');const meta=await mm.parseFile(file,{duration:false,skipCovers:!cover});
 if(ext==='.mp3'&&!/layer 3/i.test(meta.format.codec||''))throw Error('not verified MP3');if(ext==='.flac'&&!/FLAC/i.test(meta.format.codec||'')&&meta.format.container!=='FLAC')throw Error('not verified FLAC');
 const h=await fs.open(file,'r');let header,body,skip,patch;
 try{if(ext==='.flac'){({skip,patch}=await readFlac(h,stat,values,meta.common,cover));}else{header=Buffer.alloc(10);await h.read(header,0,10,0);const has=header.subarray(0,3).toString()==='ID3';const size=has?syncRead(header.subarray(6)):0;if(size>maxTag||size+10>stat.size)throw Error('tag too large');body=Buffer.alloc(size);if(size&&(await h.read(body,0,size,10)).bytesRead!==size)throw Error('truncated tag');skip=has?10+size:0;patch=patchTag(header,body,values,meta.common,cover);}}finally{await h.close();}
 if(!patch)return {status:'skipped'};
 const tmp=path.join(path.dirname(file),'.opsis-'+randomUUID()+ext);
 const backup=file+'.opsis-'+randomUUID()+'.bak';
 try{
  const originalHash=createHash('sha256');
  async function* bytes(){checkCancelled();yield patch.bytes;for await(const chunk of F.createReadStream(file,{start:skip})){checkCancelled();originalHash.update(chunk);yield chunk;}}
  await pipeline(Readable.from(bytes()),F.createWriteStream(tmp,{flags:'wx',mode:stat.mode}));
  const copiedHash=createHash('sha256');for await(const chunk of F.createReadStream(tmp,{start:patch.bytes.length}))copiedHash.update(chunk);
  if(originalHash.digest('hex')!==copiedHash.digest('hex'))throw Error('audio byte verification failed');
  const check=await mm.parseFile(tmp,{duration:false,skipCovers:!patch.coverApplied});
  if(patch.coverApplied&&!check.common.picture?.some(p=>Buffer.from(p.data).equals(cover.data)))throw Error('cover verification failed');
  for(const [k,v] of Object.entries(patch.applied))if(Array.isArray(check.common[k])?!check.common[k].includes(v):String(check.common[k])!==v)throw Error('tag verification failed: '+k);
  const same=async()=>{const s=await fs.lstat(file);if(s.size!==stat.size||s.mtimeMs!==stat.mtimeMs||s.ino!==stat.ino||!s.isFile())throw Error('file changed during operation');};
  checkCancelled();await same();await fs.copyFile(file,backup,F.constants.COPYFILE_EXCL);await same();checkCancelled();
  await fs.rename(tmp,file);
  return {status:'updated',backup,applied:patch.applied,coverApplied:patch.coverApplied};
 }finally{await fs.unlink(tmp).catch(()=>{});}
}
module.exports={infer,clean,patchTag,complete,syncWrite,patchFlac,validateCover};
