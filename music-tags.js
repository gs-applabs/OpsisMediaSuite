'use strict';
// Lossless MP3 tag completion: append only missing simple ID3 frames, preserving
// every existing frame and all audio bytes. Refuse exotic or ambiguous headers.
const fs=require('node:fs/promises'), F=require('node:fs'), path=require('node:path');
const {randomUUID,createHash}=require('node:crypto'),{pipeline}=require('node:stream/promises');
const {Readable}=require('node:stream');
const fields={title:'TIT2',artist:'TPE1',album:'TALB',genre:'TCON',year:'TYER'};
const maxTag=8*1024*1024, maxFile=512*1024*1024;
function syncRead(b){if(b.length!==4||b.some(x=>x>127))throw Error('invalid synchsafe size');return b.reduce((a,x)=>a*128+x,0);}
function syncWrite(n){return Buffer.from([(n>>>21)&127,(n>>>14)&127,(n>>>7)&127,n&127]);}
function infer(file){const parts=path.basename(file,path.extname(file)).split(' - ');return parts.length===2&&parts.every(x=>x.trim())?{artist:parts[0].trim(),title:parts[1].trim()}:{};}
function clean(values){const out={};for(const k of Object.keys(fields)){const v=values?.[k];if(typeof v==='string'&&v.trim()&&v.length<=250&&!/[\u0000-\u001f\u007f]/.test(v)&&(k!=='year'||/^\d{4}$/.test(v.trim())))out[k]=v.trim();}return out;}
function patchTag(header,body,values,common={}){
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
 if(!additions.length)return null;
 const next=Buffer.concat([body.subarray(0,offset),...additions,body.subarray(offset)]);
 if(next.length>maxTag)throw Error('tag too large');
 return {bytes:Buffer.concat([Buffer.from([73,68,51,version,0,0]),syncWrite(next.length),next]),applied};
}
async function complete(file,values){
 if(!path.isAbsolute(file)||path.extname(file).toLowerCase()!=='.mp3'||/^(\\\\|\/\/)/.test(file))throw Error('local MP3 only');
 const stat=await fs.lstat(file);if(!stat.isFile()||stat.nlink!==1||stat.size>maxFile||stat.size<10)throw Error('unsupported file');
 const real=await fs.realpath(file);if(path.resolve(file).toLowerCase()!==real.toLowerCase())throw Error('redirected path');
 const mm=await import('music-metadata');const meta=await mm.parseFile(file,{duration:false,skipCovers:true});
 if(meta.format.codec!=='MPEG 1 Layer 3'&&!/layer 3/i.test(meta.format.codec||''))throw Error('not verified MP3');
 const h=await fs.open(file,'r');let header,body,skip;
 try{header=Buffer.alloc(10);await h.read(header,0,10,0);const has=header.subarray(0,3).toString()==='ID3';const size=has?syncRead(header.subarray(6)):0;if(size>maxTag||size+10>stat.size)throw Error('tag too large');body=Buffer.alloc(size);if(size&&(await h.read(body,0,size,10)).bytesRead!==size)throw Error('truncated tag');skip=has?10+size:0;}finally{await h.close();}
 const patch=patchTag(header,body,values,meta.common);if(!patch)return {status:'skipped'};
 const tmp=path.join(path.dirname(file),'.opsis-'+randomUUID()+'.mp3');
 const backup=file+'.opsis-'+randomUUID()+'.bak';
 try{
  const originalHash=createHash('sha256');
  async function* bytes(){yield patch.bytes;for await(const chunk of F.createReadStream(file,{start:skip})){originalHash.update(chunk);yield chunk;}}
  await pipeline(Readable.from(bytes()),F.createWriteStream(tmp,{flags:'wx',mode:stat.mode}));
  const copiedHash=createHash('sha256');for await(const chunk of F.createReadStream(tmp,{start:patch.bytes.length}))copiedHash.update(chunk);
  if(originalHash.digest('hex')!==copiedHash.digest('hex'))throw Error('audio byte verification failed');
  const check=await mm.parseFile(tmp,{duration:false,skipCovers:true});
  for(const [k,v] of Object.entries(patch.applied))if(k==='genre'?!(Array.isArray(check.common.genre)&&check.common.genre.includes(v)):String(check.common[k])!==v)throw Error('tag verification failed: '+k);
  const same=async()=>{const s=await fs.lstat(file);if(s.size!==stat.size||s.mtimeMs!==stat.mtimeMs||s.ino!==stat.ino||!s.isFile())throw Error('file changed during operation');};
  await same();await fs.copyFile(file,backup,F.constants.COPYFILE_EXCL);await same();
  await fs.rename(tmp,file);
  return {status:'updated',backup,applied:patch.applied};
 }finally{await fs.unlink(tmp).catch(()=>{});}
}
module.exports={infer,clean,patchTag,complete,syncWrite};
