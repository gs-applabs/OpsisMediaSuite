'use strict';
// RAR support uses a separately installed 7-Zip CLI. No shell, no extraction
// directory, no auto-install, no arbitrary executable from renderer or PATH.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFile}=require('node:child_process');
const {localPath}=require('./local-media-policy');
const {canonicalSrt}=require('./subtitle-sidecar');
const {MAX_ARCHIVE,crc32}=require('./subtitle-archive');
const MAX_ENTRY=5*1024*1024,MAX_TOTAL=64*1024*1024;
const signature=b=>Buffer.isBuffer(b)&&(b.subarray(0,7).equals(Buffer.from('526172211a0700','hex'))||b.subarray(0,8).equals(Buffer.from('526172211a070100','hex')));
function run(exe,args,limit,timeout,cwd){
 return new Promise(resolve=>{
  try{const child=execFile(exe,args,{encoding:'buffer',cwd,windowsHide:true,timeout,maxBuffer:limit},(err,stdout)=>resolve(err?null:stdout));child.stdin?.end();}
  catch{resolve(null);}
 });
}
async function resolve7Zip(){
 if(process.platform!=='win32')return null;
 const roots=[process.env.ProgramW6432,process.env.ProgramFiles,process.env['ProgramFiles(x86)']];
 for(const root of new Set(roots)){
  if(typeof root!=='string'||!path.isAbsolute(root))continue;
  const exe=localPath(path.join(root,'7-Zip','7z.exe'));
  if(!exe)continue;
  const out=await run(exe,['i'],256*1024,3000,path.dirname(exe));
  const version=out?.toString('utf8').match(/(?:^|\n)7-Zip\s+(?:\([^)\r\n]+\)\s+)?(\d+)\.(\d+)\b/i);
  if(version&&(Number(version[1])>25||Number(version[1])===25&&Number(version[2])>=1))return {exe,version:version[1]+'.'+version[2]};
 }
 return null;
}
function parseListing(text){
 if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>256*1024)return null;
 // Preserve empty technical values ("Characteristics = ") at EOF.
 // Trimming whitespace changes valid key/value records into malformed ones.
 const blocks=text.replace(/^\uFEFF/,'').replace(/^(?:\r?\n)+|(?:\r?\n)+$/g,'').split(/\r?\n[ \t]*\r?\n/).filter(Boolean);
 if(blocks.length>128)return null;
 const seen=new Set(),out=[];let total=0;
 for(const block of blocks){
  const map=new Map();
  for(const line of block.split(/\r?\n/)){
   const eq=line.indexOf(' = ');if(eq<1)return null;
   const key=line.slice(0,eq),value=line.slice(eq+3);
   if(map.has(key))return null;map.set(key,value);
  }
  const name=map.get('Path'),sizeText=map.get('Size'),crc=map.get('CRC');
  if(!name||!/^\d+$/.test(sizeText||'')||map.get('Encrypted')!== '-')return null;
  const size=Number(sizeText);
  if(!Number.isSafeInteger(size)||size<0||size>MAX_TOTAL||(total+=size)>MAX_TOTAL)return null;
  const normalized=name.replace(/\\/g,'/');
  if(seen.has(normalized.toLowerCase()))return null;seen.add(normalized.toLowerCase());
  if(map.get('Folder')==='+'||/^D/i.test(map.get('Attributes')||''))continue;
  // Safe literal member names only; no path traversal, wildcard/listfile or
  // switch interpretation, no links or alternative streams.
  if(/^[\/@-]/.test(normalized)||/[:*?"<>|\x00-\x1f\x7f]/.test(normalized)||normalized.split('/').some(x=>!x||x==='.'||x==='..'||/^[ @-]/.test(x))||map.get('Symbolic Link')||map.get('Hard Link')||map.get('Alternate Stream')==='+')continue;
  const leaf=normalized.split('/').pop(),ext=path.extname(leaf).slice(1).toLowerCase();
  if(!['srt','vtt','ass','ssa'].includes(ext))continue;
  if(!size||size>MAX_ENTRY||!/^[a-f0-9]{8}$/i.test(crc||'')||name.length>512||out.length>=16)return null;
  out.push({member:name,name:leaf,ext,size,crc:parseInt(crc,16)>>>0});
 }
 return out;
}
async function withRar({archive,exe,decode,choose,approved=()=>true}){
 if(!signature(archive)||archive.length>MAX_ARCHIVE||!exe||!approved())return {ok:false,code:'invalid-rar'};
 // Only the selected, bounded bytes enter an isolated scratch folder.
 // Missing sibling volumes cannot be read from the original directory.
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'opsis-rar-'));
 try{
  const file=path.join(dir,'archive.rar');await fs.writeFile(file,archive,{flag:'wx',mode:0o600});
  const common=['-bd','-sccUTF-8','-pOPSIS_NO_PASSWORD'];
  const list=await run(exe,['l','-slt','-ba',...common,'--',file],256*1024,10000,dir);
  const candidates=list&&parseListing(list.toString('utf8'));
  if(!candidates)return {ok:false,code:'rar-list-failed-or-unsupported'};
  if(!candidates.length)return {ok:false,code:'no-subtitles-in-rar'};
  if(candidates.length>8)return {ok:false,code:'too-many-subtitles-extract-manually'};
  const index=await choose(candidates);
  if(!Number.isInteger(index)||index<0||index>=candidates.length||!approved())return {ok:false,code:'cancelled'};
  const item=candidates[index];
  // 7-Zip emits only the selected entry to stdout; validate actual size/CRC.
  const bytes=await run(exe,['x','-so','-spd','-y','-bso2','-bsp0','-bse2',...common,'--',file,item.member],MAX_ENTRY,15000,dir);
  if(!bytes||bytes.length!==item.size||crc32(bytes)!==item.crc)return {ok:false,code:'rar-extract-failed'};
  const subtitle={name:item.name,ext:item.ext,text:decode(bytes)};
  return canonicalSrt(subtitle)&&approved()?{ok:true,subtitle}:{ok:false,code:'invalid-subtitle'};
 }finally{try{await fs.rm(dir,{recursive:true,force:true});}catch{}}
}
module.exports={resolve7Zip,parseListing,signature,withRar};
