'use strict';
// Private CI layout candidate only. No signing, installer or release upload.
// LibVLC redistribution review is a separate release gate.
const fs=require('node:fs'),path=require('node:path');
const {build,Platform,Arch}=require('electron-builder');
const pkg=require('../package.json');
const from=path.resolve('native-player/publish');
if(!fs.existsSync(path.join(from,'Opsis.NativePlayer.exe')))throw Error('missing native publish');
build({targets:Platform.WINDOWS.createTarget('dir',Arch.x64),publish:'never',
 config:{...pkg.build,directories:{...pkg.build.directories,output:'release-native-candidate'},
 extraResources:[{from,to:'native-player',filter:['**/*']}],win:{...pkg.build.win,signAndEditExecutable:false}}})
.catch(e=>{console.error(e);process.exitCode=1;});
