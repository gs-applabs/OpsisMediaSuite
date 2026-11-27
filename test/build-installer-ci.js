'use strict';
// Build the actual Inno Setup script, using disposable synthetic version fixtures.
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {build,Platform,Arch}=require('electron-builder');
const pkg=require('../package.json');
const version=process.argv[2];
if(!['2.4.2','3.0.0'].includes(version))throw Error('fixture version');
const from=path.resolve('native-player/publish');
if(!fs.existsSync(path.join(from,'Opsis.NativePlayer.exe')))throw Error('missing native publish');
if(!process.env.OPSIS_ISCC)throw Error('Inno Setup 7 compiler required');
(async()=>{
 await build({targets:Platform.WINDOWS.createTarget('dir',Arch.x64),publish:'never',
 config:{...pkg.build,extraMetadata:{version},directories:{...pkg.build.directories,output:'release'},
 extraResources:[{from,to:'native-player',filter:['**/*']}],win:{...pkg.build.win,signAndEditExecutable:false}}});
 const output=path.resolve('release-installer-ci',version);fs.mkdirSync(output,{recursive:true});
 execFileSync(process.env.OPSIS_ISCC,['/Qp','/DMyAppVersion='+version,'/O'+output,'/FOpsisMediaSuite-CI-'+version,path.resolve('installer/OpsisMediaSuite.iss')],{stdio:'inherit'});
})().catch(e=>{console.error(e);process.exitCode=1;});
