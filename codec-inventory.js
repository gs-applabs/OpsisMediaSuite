'use strict';
const {execFile}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const {localPath}=require('./local-media-policy');
const LAV=Object.freeze({
 '{B98D13E7-55DB-4385-A33D-09FD1BA26338}':{name:'LAV Splitter Source',file:'lavsplitter.ax',role:'source'},
 '{171252A0-8820-4AFE-9DF8-5C92B2D66B04}':{name:'LAV Splitter',file:'lavsplitter.ax',role:'splitter'},
 '{EE30215D-164F-4A92-A4EB-9D4C13390F9F}':{name:'LAV Video Decoder',file:'lavvideo.ax',role:'video'},
 '{E8E73B6B-4CB3-44A4-BE99-4F7BCB96E491}':{name:'LAV Audio Decoder',file:'lavaudio.ax',role:'audio'}
});
function peMachine(p){
 let fd;
 try{fd=fs.openSync(p,'r');const h=Buffer.alloc(64);if(fs.readSync(fd,h,0,64,0)!==64||h.readUInt16LE(0)!==0x5a4d)return null;
 const offset=h.readUInt32LE(60);if(offset<64||offset>1048576)return null;const pheader=Buffer.alloc(24);if(fs.readSync(fd,pheader,0,24,offset)!==24||pheader.readUInt32LE(0)!==0x4550||!(pheader.readUInt16LE(22)&0x2000))return null;
 return ({332:'x86',34404:'x64',43620:'arm64'})[pheader.readUInt16LE(4)]||null;
 }catch{return null;}finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}
}
function classifyLav(raw,arch=process.arch,inspect=p=>{const f=localPath(p);return f?{file:f,machine:peMachine(f)}:null;}){
 const rows=Array.isArray(raw)?raw.slice(0,32):[];
 return rows.flatMap(x=>{
 const id=typeof x?.clsid==='string'?x.clsid.toUpperCase():'',known=LAV[id];if(!known||!['32','64'].includes(String(x.view))||!['LocalMachine','CurrentUser'].includes(x.hive))return [];
 const expected=String(x.view)==='32'?'x86':arch==='arm64'?'arm64':'x64';
 const p=typeof x.server==='string'&&x.server.length<32768?x.server.trim().replace(/^"([^"]+)"$/,'$1'):'';
 const candidate=p&&path.win32.isAbsolute(p)&&path.win32.basename(p).toLowerCase()===known.file?inspect(p):null;
 const status=!candidate?'missing-or-invalid-file':candidate.machine!==expected?'architecture-mismatch':candidate.machine!==arch?'other-architecture':x.hive==='CurrentUser'?'user-override-review':'identity-review-required';
 // Identity and architecture checks are not trust or permission to instantiate COM.
 return [{clsid:id,name:known.name,role:known.role,view:String(x.view),hive:x.hive,machine:candidate?.machine||null,status}];
 });
}

const PACK=/^(K-Lite (?:Mega |Full |Standard |Basic )?Codec Pack|Shark007|ADVANCED Codecs|STANDARD Codecs|Combined Community Codec Pack|X Codec Pack|ffdshow|DivX|Xvid|LAV Filters|VLC media player)(?:\b|$)/i;
const FILTER=/\b(LAV (?:Video|Audio|Splitter)|DirectVobSub|VSFilter|ffdshow|Xvid|DivX)\b/i;
const MFT=/\b(decoder|encoder|video processor|transform|HEVC|H\.265|AV1|VP9|H\.264|AAC)\b/i;
function normalize(raw,arch=process.arch){
 const list=(value,re)=> (Array.isArray(value)?value:[]).slice(0,500).flatMap(x=>{
  if(!x||typeof x.name!=='string'||!re.test(x.name)||!['32','64'].includes(String(x.view)))return [];
  return [{name:x.name.slice(0,160),version:typeof x.version==='string'?x.version.slice(0,80):'',view:String(x.view),...(x.source==='product-registry'?{source:'product-registry'}:{})}];
 });
 const unique=rows=>[...new Map(rows.map(x=>[x.name.toLowerCase()+'|'+x.view,x])).values()].sort((a,b)=>a.name.localeCompare(b.name)).slice(0,100);
 return {status:'ok',arch,packs:unique(list(raw?.packs,PACK)),filters:unique(list(raw?.filters,FILTER)),transforms:unique(list(raw?.transforms,MFT)),lav:classifyLav(raw?.lav,arch)};
}
// Fixed read-only registry script. No COM activation, no DLL inspection/loading,
// no registry mutation, no renderer-controlled arguments. Registry metadata is not proof of compatibility.
const SCRIPT = String.raw`
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$packs=@();$filters=@();$transforms=@();$lav=@()
$ids=@('{B98D13E7-55DB-4385-A33D-09FD1BA26338}','{171252A0-8820-4AFE-9DF8-5C92B2D66B04}','{EE30215D-164F-4A92-A4EB-9D4C13390F9F}','{E8E73B6B-4CB3-44A4-BE99-4F7BCB96E491}')
foreach($v in @('Registry64','Registry32')){
 $view=[Microsoft.Win32.RegistryView][Enum]::Parse([Microsoft.Win32.RegistryView],$v)
 $label=if($v -eq 'Registry64'){'64'}else{'32'}
 foreach($h in @('LocalMachine','CurrentUser')){
  $root=[Microsoft.Win32.RegistryKey]::OpenBaseKey(([Microsoft.Win32.RegistryHive][Enum]::Parse([Microsoft.Win32.RegistryHive],$h)),$view)
  try {
   $u=$root.OpenSubKey('SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall')
   if($u){try{foreach($key in $u.GetSubKeyNames()){$k=$u.OpenSubKey($key);if($k){try{$n=[string]$k.GetValue('DisplayName');if($n -match '^(K-Lite (?:Mega |Full |Standard |Basic )?Codec Pack|Shark007|ADVANCED Codecs|STANDARD Codecs|Combined Community Codec Pack|X Codec Pack|ffdshow|DivX|Xvid|LAV Filters|VLC media player)\b'){$packs+=@{name=$n;version=[string]$k.GetValue('DisplayVersion');view=$label}}}finally{$k.Dispose()}}}}finally{$u.Dispose()}}
   # Some K-Lite releases register an uninstall key whose name contains
   # the product name even when DisplayName differs. Keep provenance explicit.
   $kl=$root.OpenSubKey('SOFTWARE\KLCodecPack')
   if($kl){try{
    $ver=[string]$kl.GetValue('Version')
    $variant=[string]$kl.GetValue('Pack')
    $n='K-Lite Codec Pack'
    if($variant -match '^(Mega|Full|Standard|Basic)
    $srv=$root.OpenSubKey('SOFTWARE\Classes\CLSID\'+$id+'\InprocServer32')
    if($srv){try{$lav+=@{clsid=$id;server=[string]$srv.GetValue('');hive=$h;view=$label}}finally{$srv.Dispose()}}
   }
   $cat=$root.OpenSubKey('SOFTWARE\Classes\CLSID\{083863F1-70DE-11D0-BD40-00A0C911CE86}\Instance')
   if($cat){try{foreach($key in $cat.GetSubKeyNames()){$k=$cat.OpenSubKey($key);if($k){try{$n=[string]$k.GetValue('FriendlyName');if($n -match '(LAV (Video|Audio|Splitter)|DirectVobSub|VSFilter|ffdshow|Xvid|DivX)'){$filters+=@{name=$n;view=$label}}}finally{$k.Dispose()}}}}finally{$cat.Dispose()}}
   $m=$root.OpenSubKey('SOFTWARE\Classes\MediaFoundation\Transforms')
   if($m){try{foreach($key in $m.GetSubKeyNames()){$k=$m.OpenSubKey($key);if($k){try{$n=[string]$k.GetValue('');if($n -match '(decoder|encoder|video processor|transform|HEVC|H\.265|AV1|VP9|H\.264|AAC)'){$transforms+=@{name=$n;view=$label}}}finally{$k.Dispose()}}}}finally{$m.Dispose()}}
  }finally{$root.Dispose()}
 }
}
@{lav=@($lav);packs=@($packs|Select-Object -First 500);filters=@($filters|Select-Object -First 500);transforms=@($transforms|Select-Object -First 500)}|ConvertTo-Json -Depth 4 -Compress
`;
let cached=null,expires=0,inflight=null;
function inventory(){
 if(process.platform!=='win32')return Promise.resolve({...normalize({}),status:'unsupported'});
 if(cached&&Date.now()<expires)return Promise.resolve(cached);
 if(inflight)return inflight;
 const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 inflight=new Promise(resolve=>{
  execFile(exe,['-NoProfile','-NonInteractive','-Command',SCRIPT],{windowsHide:true,timeout:12000,maxBuffer:512*1024},(err,out)=>{
   let report;
   try{if(err)throw err;report=normalize(JSON.parse(out.replace(/^\uFEFF/,'')));}
   catch(_){report={...normalize({}),status:'unavailable'};}
   cached=report;expires=Date.now()+60000;resolve(report);
  });
 }).finally(()=>{inflight=null;});
 return inflight;
}
module.exports={inventory,normalize,classifyLav,peMachine};
){$n+=' '+$variant}
    $packs+=@{name=$n;version=$ver;view=$label;source='product-registry'}
   }finally{$kl.Dispose()}}
   foreach($id in $ids){
    $srv=$root.OpenSubKey('SOFTWARE\Classes\CLSID\'+$id+'\InprocServer32')
    if($srv){try{$lav+=@{clsid=$id;server=[string]$srv.GetValue('');hive=$h;view=$label}}finally{$srv.Dispose()}}
   }
   $cat=$root.OpenSubKey('SOFTWARE\Classes\CLSID\{083863F1-70DE-11D0-BD40-00A0C911CE86}\Instance')
   if($cat){try{foreach($key in $cat.GetSubKeyNames()){$k=$cat.OpenSubKey($key);if($k){try{$n=[string]$k.GetValue('FriendlyName');if($n -match '(LAV (Video|Audio|Splitter)|DirectVobSub|VSFilter|ffdshow|Xvid|DivX)'){$filters+=@{name=$n;view=$label}}}finally{$k.Dispose()}}}}finally{$cat.Dispose()}}
   $m=$root.OpenSubKey('SOFTWARE\Classes\MediaFoundation\Transforms')
   if($m){try{foreach($key in $m.GetSubKeyNames()){$k=$m.OpenSubKey($key);if($k){try{$n=[string]$k.GetValue('');if($n -match '(decoder|encoder|video processor|transform|HEVC|H\.265|AV1|VP9|H\.264|AAC)'){$transforms+=@{name=$n;view=$label}}}finally{$k.Dispose()}}}}finally{$m.Dispose()}}
  }finally{$root.Dispose()}
 }
}
@{lav=@($lav);packs=@($packs|Select-Object -First 500);filters=@($filters|Select-Object -First 500);transforms=@($transforms|Select-Object -First 500)}|ConvertTo-Json -Depth 4 -Compress
`;
let cached=null,expires=0,inflight=null;
function inventory(){
 if(process.platform!=='win32')return Promise.resolve({...normalize({}),status:'unsupported'});
 if(cached&&Date.now()<expires)return Promise.resolve(cached);
 if(inflight)return inflight;
 const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 inflight=new Promise(resolve=>{
  execFile(exe,['-NoProfile','-NonInteractive','-Command',SCRIPT],{windowsHide:true,timeout:12000,maxBuffer:512*1024},(err,out)=>{
   let report;
   try{if(err)throw err;report=normalize(JSON.parse(out.replace(/^\uFEFF/,'')));}
   catch(_){report={...normalize({}),status:'unavailable'};}
   cached=report;expires=Date.now()+60000;resolve(report);
  });
 }).finally(()=>{inflight=null;});
 return inflight;
}
module.exports={inventory,normalize,classifyLav,peMachine};
