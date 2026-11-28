'use strict';
// Original RAR4 stored-member fixture, generated without a proprietary encoder.
const {crc32}=require('../subtitle-archive');
function header(type,flags,body){
 const h=Buffer.alloc(7+body.length);
 h[2]=type;h.writeUInt16LE(flags,3);h.writeUInt16LE(h.length,5);body.copy(h,7);
 h.writeUInt16LE(crc32(h.subarray(2))&65535,0);return h;
}
function storedRar(entries){
 const chunks=[Buffer.from('526172211a0700','hex'),header(0x73,0,Buffer.alloc(6))];
 for(const item of entries){
  const name=Buffer.from(item.name,'ascii'),data=Buffer.from(item.data);
  const h=Buffer.alloc(25+name.length);
  h.writeUInt32LE(data.length,0);h.writeUInt32LE(data.length,4);h[8]=2;
  h.writeUInt32LE(crc32(data),9);h.writeUInt32LE(0,13);h[17]=20;h[18]=0x30;
  h.writeUInt16LE(name.length,19);h.writeUInt32LE(0x20,21);name.copy(h,25);
  chunks.push(header(0x74,0x8000,h),data);
 }
 chunks.push(header(0x7b,0,Buffer.alloc(0)));return Buffer.concat(chunks);
}
const text='1\n00:00:01,000 --> 00:00:02,000\nΚαλημέρα από το OPSIS\n';
async function run(){
 const assert=require('node:assert/strict'),{resolve7Zip,withRar}=require('../subtitle-rar');
 const installed=await resolve7Zip();
 assert.ok(installed,'7-Zip >=25.01 not installed in expected Windows path');
 const archive=storedRar([{name:'episode.el.srt',data:Buffer.from(text)},{name:'notes.txt',data:Buffer.from('not a subtitle')}]);
 let inspected=false;
 const result=await withRar({archive,exe:installed.exe,decode:b=>new TextDecoder('utf-8',{fatal:true}).decode(b),choose:rows=>{
   assert.equal(rows.length,1);assert.equal(rows[0].name,'episode.el.srt');inspected=true;return 0;
 }});
 if(!result.ok){
  // Synthetic fixture only: capture exact CLI evidence without exposing any
  // user archive, filesystem path, or provider credentials.
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const {execFileSync}=require('node:child_process');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'opsis-rar-ci-'));
  try{
   const file=path.join(dir,'fixture.rar');await fs.writeFile(file,archive);
   const args=['l','-slt','-ba','-bd','-sccUTF-8','-pOPSIS_NO_PASSWORD','--',file];
   try{const raw=execFileSync(installed.exe,args,{cwd:dir,timeout:10000,maxBuffer:256*1024});console.log('Synthetic 7-Zip listing: '+JSON.stringify(raw.toString('utf8')));}
   catch(e){console.log('Synthetic listing exit='+e.status+' stdout='+JSON.stringify(e.stdout?.toString('utf8'))+' stderr='+JSON.stringify(e.stderr?.toString('utf8')));}
  }finally{await fs.rm(dir,{recursive:true,force:true});}
 }
 assert.ok(inspected,JSON.stringify(result));assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.subtitle.text,text);
 const cancel=await withRar({archive,exe:installed.exe,decode:b=>b.toString('utf8'),choose:()=>-1});
 assert.deepEqual(cancel,{ok:false,code:'cancelled'});
 console.log('PASS actual RAR4 stored Greek subtitle listing, extraction, CRC and cancellation via 7-Zip '+installed.version);
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={storedRar};
