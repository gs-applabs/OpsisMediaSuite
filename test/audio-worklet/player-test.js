'use strict';
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..','..'),user=fs.mkdtempSync(path.join(os.tmpdir(),'opsis-worklet-'));
const electron=require(path.join(root,'node_modules','electron'));
const child=spawn(electron,['.'],{cwd:root,env:{...process.env,WAVEFRAME_USER_DATA:user,WAVEFRAME_NO_SPLASH:'1'},stdio:'inherit'});
const timeout=setTimeout(()=>{child.kill();},90000);
child.on('exit',code=>{clearTimeout(timeout);try{fs.rmSync(user,{recursive:true,force:true});}catch{}process.exit(code===0?0:1);});
child.on('error',()=>process.exit(1));
