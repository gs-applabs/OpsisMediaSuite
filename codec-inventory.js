'use strict';
const {execFile}=require('node:child_process');
const path=require('node:path');
const PACK=/^(K-Lite Codec Pack|Shark007|ADVANCED Codecs|STANDARD Codecs|Combined Community Codec Pack|X Codec Pack|ffdshow|DivX|Xvid|LAV Filters|VLC media player)(?:\b|$)/i;
const FILTER=/\b(LAV (?:Video|Audio|Splitter)|DirectVobSub|VSFilter|ffdshow|Xvid|DivX)\b/i;
const MFT=/\b(decoder|encoder|video processor|transform|HEVC|H\.265|AV1|VP9|H\.264|AAC)\b/i;
function normalize(raw,arch=process.arch){
 const list=(value,re)=> (Array.isArray(value)?value:[]).slice(0,500).flatMap(x=>{
  if(!x||typeof x.name!=='string'||!re.test(x.name)||!['32','64'].includes(String(x.view)))return [];
  return [{name:x.name.slice(0,160),version:typeof x.version==='string'?x.version.slice(0,80):'',view:String(x.view)}];
 });
 const unique=rows=>[...new Map(rows.map(x=>[x.name.toLowerCase()+'|'+x.view,x])).values()].sort((a,b)=>a.name.localeCompare(b.name)).slice(0,100);
 return {status:'ok',arch,packs:unique(list(raw?.packs,PACK)),filters:unique(list(raw?.filters,FILTER)),transforms:unique(list(raw?.transforms,MFT))};
}
// Fixed read-only registry script. No COM activation, no DLL inspection/loading,
// no registry mutation, no renderer-controlled arguments. Registry metadata is not proof of compatibility.
const SCRIPT = String.raw`
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$packs=@();$filters=@();$transforms=@()
foreach($v in @('Registry64','Registry32')){
 $view=[Microsoft.Win32.RegistryView][Enum]::Parse([Microsoft.Win32.RegistryView],$v)
 $label=if($v -eq 'Registry64'){'64'}else{'32'}
 foreach($h in @('LocalMachine','CurrentUser')){
  $root=[Microsoft.Win32.RegistryKey]::OpenBaseKey(([Microsoft.Win32.RegistryHive][Enum]::Parse([Microsoft.Win32.RegistryHive],$h)),$view)
  try {
   $u=$root.OpenSubKey('SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall')
   if($u){try{foreach($key in $u.GetSubKeyNames()){$k=$u.OpenSubKey($key);if($k){try{$n=[string]$k.GetValue('DisplayName');if($n -match '^(K-Lite Codec Pack|Shark007|ADVANCED Codecs|STANDARD Codecs|Combined Community Codec Pack|X Codec Pack|ffdshow|DivX|Xvid|LAV Filters|VLC media player)\b'){$packs+=@{name=$n;version=[string]$k.GetValue('DisplayVersion');view=$label}}}finally{$k.Dispose()}}}}finally{$u.Dispose()}}
   $cat=$root.OpenSubKey('SOFTWARE\Classes\CLSID\{083863F1-70DE-11D0-BD40-00A0C911CE86}\Instance')
   if($cat){try{foreach($key in $cat.GetSubKeyNames()){$k=$cat.OpenSubKey($key);if($k){try{$n=[string]$k.GetValue('FriendlyName');if($n -match '(LAV (Video|Audio|Splitter)|DirectVobSub|VSFilter|ffdshow|Xvid|DivX)'){$filters+=@{name=$n;view=$label}}}finally{$k.Dispose()}}}}finally{$cat.Dispose()}}
   $m=$root.OpenSubKey('SOFTWARE\Classes\MediaFoundation\Transforms')
   if($m){try{foreach($key in $m.GetSubKeyNames()){$k=$m.OpenSubKey($key);if($k){try{$n=[string]$k.GetValue('');if($n -match '(decoder|encoder|video processor|transform|HEVC|H\.265|AV1|VP9|H\.264|AAC)'){$transforms+=@{name=$n;view=$label}}}finally{$k.Dispose()}}}}finally{$m.Dispose()}}
  }finally{$root.Dispose()}
 }
}
@{packs=@($packs|Select-Object -First 500);filters=@($filters|Select-Object -First 500);transforms=@($transforms|Select-Object -First 500)}|ConvertTo-Json -Depth 4 -Compress
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
module.exports={inventory,normalize};
