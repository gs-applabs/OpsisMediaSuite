'use strict';
// Disposable CI installation lifecycle fixture, not a production release.
// Both versions use this commit's source; only package version differs.
const fs=require('node:fs'),path=require('node:path');
const {build,Platform,Arch}=require('electron-builder');
const pkg=require('../package.json');
const version=process.argv[2];
if(!['2.4.2','3.0.0-rc.1'].includes(version))throw Error('fixture version');
const from=path.resolve('native-player/publish');
if(!fs.existsSync(path.join(from,'Opsis.NativePlayer.exe')))throw Error('missing native publish');
build({targets:Platform.WINDOWS.createTarget('nsis',Arch.x64),publish:'never',
 config:{...pkg.build,extraMetadata:{version},
 directories:{...pkg.build.directories,output:'release-installer-ci/'+version},
 extraResources:[{from,to:'native-player',filter:['**/*']}],
 win:{...pkg.build.win,artifactName:'OpsisMediaSuite-CI-'+version+'.exe',signAndEditExecutable:false},
 nsis:{oneClick:true,perMachine:false,allowElevation:false,runAfterFinish:false,createDesktopShortcut:false,createStartMenuShortcut:false,deleteAppDataOnUninstall:false}}})
.catch(e=>{console.error(e);process.exitCode=1;});
