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
// Read-only recovery of Greek text mislabelled as Latin-1/Windows-1252 in ID3.
 // Keep original tags untouched. Ambiguous legacy Greek code-page guessing is
 // deliberately excluded from automatic display/lookup; it needs explicit review.
function readTrackText(metadata){
 const common=metadata?.common||{},native=metadata?.native||{};
 const id3Values=new Set();
 for(const [format,tags] of Object.entries(native)){
  if(!/^ID3v/i.test(format)||!Array.isArray(tags))continue;
  for(const tag of tags)if(typeof tag?.value==='string'&&tag.value.length<=4096)id3Values.add(tag.value);
 }
 const utf8=new TextDecoder('utf-8',{fatal:true}),latin=new TextDecoder('windows-1252');
 const latinBytes=new Map(Array.from({length:256},(_,byte)=>[latin.decode(Uint8Array.of(byte)),byte]));
 const repair=value=>{
  if(typeof value!=='string')return null;
  if(value.length>4096)return value.slice(0,4096);
  if(!id3Values.has(value)||/\p{Script=Greek}/u.test(value)||/[\u0000-\u001f\u007f]/u.test(value))return value;
  const bytes=[];
  for(const c of value){const cp=c.codePointAt(0),b=cp<256?cp:latinBytes.get(c);if(b===undefined)return value;bytes.push(b);}
  try{
   const decoded=utf8.decode(Uint8Array.from(bytes));
   if((decoded.match(/\p{Script=Greek}/gu)||[]).length>=2&&!/[\u0000-\u001f\u007f-\u009f\ufffd]/u.test(decoded))return decoded.normalize('NFC');
  }catch{}
  return value;
 };
 return {title:repair(common.title),artist:repair(common.artist),album:repair(common.album)};
}
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
// Conservative RIFF/WAVE extension: append ID3, preserving existing chunks.
async function readWave(h,stat,values,common,cover){
 const header=Buffer.alloc(12);
 if((await h.read(header,0,12,0)).bytesRead!==12||header.toString('ascii',0,4)!=='RIFF'||header.toString('ascii',8,12)!=='WAVE'||header.readUInt32LE(4)!==stat.size-8)throw Error('unsupported WAV container');
 let at=12,fmt=0,data=0,count=0;
 while(at<stat.size){
  if(++count>4096||at+8>stat.size)throw Error('invalid WAV chunk layout');
  const chunk=Buffer.alloc(8);if((await h.read(chunk,0,8,at)).bytesRead!==8)throw Error('truncated WAV chunk');
  const id=chunk.toString('ascii',0,4),n=chunk.readUInt32LE(4),end=at+8+n+(n&1);
  if(end>stat.size)throw Error('truncated WAV chunk');
  if(id.toLowerCase()==='id3 ')throw Error('WAV with existing ID3 is not supported for writing');
  if(id==='fmt '){if(n<16)throw Error('invalid WAV format');fmt++;}
  if(id==='data'){if(!n)throw Error('empty WAV data');data++;}
  at=end;
 }
 if(at!==stat.size||fmt!==1||data!==1)throw Error('unsupported WAV chunk layout');
 const tag=patchTag(Buffer.alloc(10),Buffer.alloc(0),values,common,cover);
 if(!tag)return {skip:12,patch:null};
 const chunk=Buffer.alloc(8);chunk.write('id3 ');chunk.writeUInt32LE(tag.bytes.length,4);
 const suffix=Buffer.concat([chunk,tag.bytes,Buffer.alloc(tag.bytes.length&1)]);
 header.writeUInt32LE(stat.size-8+suffix.length,4);
 return {skip:12,patch:{...tag,bytes:header,suffix}};
}
// Ogg: rewrite only the existing comment page, with the original page
// sequence/granule and remaining packet laces intact. No audio repagination.
function oggCRC(buf){
 let crc=0;for(let i=0;i<buf.length;i++){crc^=(i>=22&&i<26?0:buf[i])<<24;for(let j=0;j<8;j++)crc=(crc<<1)^((crc>>>31)?0x04c11db7:0);}return crc>>>0;
}
async function oggPage(h,at,limit){
 const b=Buffer.alloc(27);if(at+27>limit||(await h.read(b,0,27,at)).bytesRead!==27||b.toString('ascii',0,4)!=='OggS'||b[4]!==0)throw Error('invalid Ogg page');
 const laces=Buffer.alloc(b[26]);if(!laces.length||(await h.read(laces,0,laces.length,at+27)).bytesRead!==laces.length)throw Error('invalid Ogg lacing');
 const size=laces.reduce((a,x)=>a+x,0),payload=Buffer.alloc(size),end=at+27+laces.length+size;
 if(end>limit||(await h.read(payload,0,size,at+27+laces.length)).bytesRead!==size)throw Error('truncated Ogg page');
 const bytes=Buffer.concat([b,laces,payload]);if(oggCRC(bytes)!==b.readUInt32LE(22))throw Error('Ogg CRC mismatch');
 return {b,laces,payload,bytes,end};
}
function pictureBlock(cover){
 const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;},mime=Buffer.from(cover.mime,'ascii');
 return Buffer.concat([u32(3),u32(mime.length),mime,u32(0),u32(cover.width),u32(cover.height),u32(0),u32(0),u32(cover.data.length),cover.data]);
}
async function readOgg(h,stat,ext,values,common,cover){
 const first=await oggPage(h,0,stat.size),page=await oggPage(h,first.end,stat.size);
 const opus=ext==='.opus',ident=opus?Buffer.from('OpusHead'):Buffer.concat([Buffer.from([1]),Buffer.from('vorbis')]),magic=opus?Buffer.from('OpusTags'):Buffer.concat([Buffer.from([3]),Buffer.from('vorbis')]);
 if(first.b[5]!==2||first.b.readUInt32LE(18)!==0||first.laces.filter(n=>n<255).length!==1||first.laces.at(-1)===255||!first.payload.subarray(0,ident.length).equals(ident)||page.b[5]&3||page.b.readUInt32LE(14)!==first.b.readUInt32LE(14)||page.b.readUInt32LE(18)!==1||!page.payload.subarray(0,magic.length).equals(magic))throw Error('unsupported Ogg comment layout');
 const last=page.laces.findIndex(n=>n<255);if(last<0)throw Error('Ogg comment spans pages');
 const length=page.laces.subarray(0,last+1).reduce((a,x)=>a+x,0),packet=page.payload.subarray(0,length);
 if(!opus&&packet.at(-1)!==1)throw Error('invalid Vorbis framing');
 const {vendor,comments}=parseComments(packet.subarray(magic.length,opus?packet.length:packet.length-1));
 const keys=new Set(comments.map(c=>c.toString('utf8').split('=',1)[0].toUpperCase())),applied={};
 for(const [k,v] of Object.entries(clean(values))){const key=flacFields[k];if(common[k]||keys.has(key)||(k==='year'&&keys.has('YEAR')))continue;comments.push(Buffer.from(key+'='+v));applied[k]=v;}
 const coverApplied=!!(cover&&!common.picture?.length&&!keys.has('METADATA_BLOCK_PICTURE')&&!keys.has('COVERART'));
 if(coverApplied)comments.push(Buffer.from('METADATA_BLOCK_PICTURE='+pictureBlock(cover).toString('base64')));
 if(!Object.keys(applied).length&&!coverApplied)return {skip:page.end,patch:null};
 const next=Buffer.concat([magic,commentBlock(vendor,comments),opus?Buffer.alloc(0):Buffer.from([1])]);
 const laces=[];for(let n=next.length;n>=255;n-=255)laces.push(255);laces.push(next.length%255);
 const tail=page.laces.subarray(last+1);if(laces.length+tail.length>255)throw Error('Ogg metadata exceeds single-page limit');
 const header=Buffer.from(page.b);header[26]=laces.length+tail.length;
 const replacement=Buffer.concat([header,Buffer.from(laces),tail,next,page.payload.subarray(length)]);
 replacement.writeUInt32LE(oggCRC(replacement),22);
 if(page.end>=stat.size)throw Error('Ogg audio pages missing');
 return {skip:page.end,patch:{bytes:Buffer.concat([first.bytes,replacement]),applied,coverApplied}};
}
// M4A: only conventional nonfragmented, moov-last iTunes metadata layout.
// All original bytes preceding moov (including mdat) remain at the same offsets.
function atoms(b,start=0){
 const out=[];for(let at=start;at<b.length;){if(at+8>b.length||out.length>=4096)throw Error('invalid MP4 atoms');const n=b.readUInt32BE(at);if(n<8||at+n>b.length)throw Error('unsupported MP4 atom size');out.push({type:b.toString('latin1',at+4,at+8),raw:b.subarray(at,at+n),body:b.subarray(at+8,at+n)});at+=n;}return out;
}
function atom(type,body){const h=Buffer.alloc(8);h.writeUInt32BE(body.length+8);h.write(type,4,4,'latin1');return Buffer.concat([h,body]);}
function single(rows,type){const found=rows.filter(r=>r.type===type);if(found.length!==1)throw Error('unsupported MP4 '+type+' layout');return found[0];}
function replaceAtom(rows,old,next){return Buffer.concat(rows.map(r=>r===old?next:r.raw));}
function patchMp4(moov,values,common,cover){
 const rows=atoms(moov,8);if(rows.some(r=>r.type==='mvex'))throw Error('fragmented MP4');
 const udta=single(rows,'udta'),u=atoms(udta.body),meta=single(u,'meta');
 if(meta.body.length<4||meta.body.readUInt32BE(0)!==0)throw Error('unsupported MP4 meta');
 const m=atoms(meta.body,4),handler=single(m,'hdlr'),ilst=single(m,'ilst');
 if(handler.body.toString('ascii',8,12)!=='mdir')throw Error('unsupported MP4 metadata handler');
 const entries=atoms(ilst.body),keys=new Set(entries.map(r=>r.type)),applied={},added=[];
 const fields={title:'©nam',artist:'©ART',album:'©alb',genre:'©gen',year:'©day',composer:'©wrt',albumartist:'aART'};
 const data=(kind,body)=>{const h=Buffer.alloc(8);h.writeUInt32BE(kind);return atom('data',Buffer.concat([h,body]));};
 for(const [k,v] of Object.entries(clean(values))){const key=fields[k];if(!key||common[k]||keys.has(key)||(k==='genre'&&keys.has('gnre')))continue;added.push(atom(key,data(1,Buffer.from(v))));applied[k]=v;}
 const coverApplied=!!(cover&&!common.picture?.length&&!keys.has('covr'));if(coverApplied)added.push(atom('covr',data(cover.mime==='image/jpeg'?13:14,cover.data)));
 if(!added.length)return null;
 const nextList=atom('ilst',Buffer.concat([ilst.body,...added])),nextMeta=atom('meta',Buffer.concat([meta.body.subarray(0,4),replaceAtom(m,ilst,nextList)])),nextUdta=atom('udta',replaceAtom(u,meta,nextMeta));
 const suffix=atom('moov',replaceAtom(rows,udta,nextUdta));if(suffix.length>maxTag)throw Error('MP4 metadata too large');
 return {bytes:Buffer.alloc(0),suffix,applied,coverApplied};
}
async function readMp4(h,stat,values,common,cover){
 let at=0,mdat=0,count=0;
 while(at<stat.size){
  if(++count>4096||at+8>stat.size)throw Error('invalid MP4 layout');
  const b=Buffer.alloc(8);if((await h.read(b,0,8,at)).bytesRead!==8)throw Error('truncated MP4 atom');
  const n=b.readUInt32BE(0),type=b.toString('ascii',4,8);if(n<8||at+n>stat.size)throw Error('unsupported MP4 atom');
  if(at===0&&type!=='ftyp')throw Error('invalid MP4 signature');
  if(type==='mdat')mdat++;
  if(type==='moov'){
   if(mdat!==1||at+n!==stat.size||n>maxTag)throw Error('only nonfragmented moov-last M4A supported');
   const b=Buffer.alloc(n);if((await h.read(b,0,n,at)).bytesRead!==n)throw Error('truncated MP4 moov');
   const patch=patchMp4(b,values,common,cover);if(patch){patch.copyEnd=at-1;patch.expectedSize=at+patch.suffix.length;}
   return {skip:0,patch};
  }
  if(!['ftyp','mdat','free','skip','wide'].includes(type))throw Error('unsupported MP4 top-level atom');
  at+=n;
 }
 throw Error('missing MP4 moov');
}
async function complete(file,values,{cover:inputCover=null,cancelled=()=>false}={}){
 const cover=inputCover?validateCover(inputCover):null;if(inputCover&&!cover)throw Error('invalid cover');
 const checkCancelled=()=>{if(cancelled())throw Object.assign(Error('cancelled'),{code:'cancelled'});};checkCancelled();
 const ext=path.extname(file).toLowerCase();if(!path.isAbsolute(file)||!['.mp3','.flac','.wav','.m4a','.ogg','.opus'].includes(ext)||/^(\\\\|\/\/)/.test(file))throw Error('unsupported local audio format');
 if(!require('./local-media-policy').localPath(file))throw Error('unsafe local path');
 const stat=await fs.lstat(file);if(!stat.isFile()||stat.nlink!==1||stat.size>maxFile||stat.size<10)throw Error('unsupported file');
 const real=await fs.realpath(file);if(path.resolve(file).toLowerCase()!==real.toLowerCase())throw Error('redirected path');
 const mm=await import('music-metadata');const meta=await mm.parseFile(file,{duration:false,skipCovers:!cover});
 if(ext==='.mp3'&&!/layer 3/i.test(meta.format.codec||''))throw Error('not verified MP3');if(ext==='.flac'&&!/FLAC/i.test(meta.format.codec||'')&&meta.format.container!=='FLAC')throw Error('not verified FLAC');
 const h=await fs.open(file,'r');let header,body,skip,patch;
 try{if(ext==='.flac'){({skip,patch}=await readFlac(h,stat,values,meta.common,cover));}else if(ext==='.wav'){({skip,patch}=await readWave(h,stat,values,meta.common,cover));}else if(ext==='.ogg'||ext==='.opus'){({skip,patch}=await readOgg(h,stat,ext,values,meta.common,cover));}else if(ext==='.m4a'){({skip,patch}=await readMp4(h,stat,values,meta.common,cover));}else{header=Buffer.alloc(10);await h.read(header,0,10,0);const has=header.subarray(0,3).toString()==='ID3';const size=has?syncRead(header.subarray(6)):0;if(size>maxTag||size+10>stat.size)throw Error('tag too large');body=Buffer.alloc(size);if(size&&(await h.read(body,0,size,10)).bytesRead!==size)throw Error('truncated tag');skip=has?10+size:0;patch=patchTag(header,body,values,meta.common,cover);}}finally{await h.close();}
 if(!patch)return {status:'skipped'};
 const tmp=path.join(path.dirname(file),'.opsis-'+randomUUID()+ext);
 const backup=file+'.opsis-'+randomUUID()+'.bak';
 try{
  const originalHash=createHash('sha256'),copyEnd=patch.copyEnd??stat.size-1;
  async function* bytes(){checkCancelled();yield patch.bytes;for await(const chunk of F.createReadStream(file,{start:skip,end:copyEnd})){checkCancelled();originalHash.update(chunk);yield chunk;}if(patch.suffix)yield patch.suffix;}
  await pipeline(Readable.from(bytes()),F.createWriteStream(tmp,{flags:'wx',mode:stat.mode}));
  const copiedHash=createHash('sha256');for await(const chunk of F.createReadStream(tmp,{start:patch.bytes.length,end:patch.bytes.length+copyEnd-skip}))copiedHash.update(chunk);
  if(originalHash.digest('hex')!==copiedHash.digest('hex'))throw Error('audio byte verification failed');
  if(patch.suffix){const out=await fs.stat(tmp);if(out.size!==(patch.expectedSize??stat.size+patch.suffix.length))throw Error('metadata output size mismatch');}
  const check=await mm.parseFile(tmp,{duration:false,skipCovers:!patch.coverApplied});
  if(patch.coverApplied&&!check.common.picture?.some(p=>Buffer.from(p.data).equals(cover.data)))throw Error('cover verification failed');
  for(const [k,v] of Object.entries(patch.applied))if(Array.isArray(check.common[k])?!check.common[k].includes(v):String(check.common[k])!==v)throw Error('tag verification failed: '+k);
  const same=async()=>{const s=await fs.lstat(file);if(s.size!==stat.size||s.mtimeMs!==stat.mtimeMs||s.ino!==stat.ino||!s.isFile())throw Error('file changed during operation');};
  checkCancelled();await same();await fs.copyFile(file,backup,F.constants.COPYFILE_EXCL);await same();checkCancelled();
  await fs.rename(tmp,file);
  return {status:'updated',backup,applied:patch.applied,coverApplied:patch.coverApplied};
 }finally{await fs.unlink(tmp).catch(()=>{});}
}
module.exports={infer,clean,readTrackText,patchTag,complete,syncWrite,patchFlac,validateCover,oggCRC,patchMp4};
