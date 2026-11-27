'use strict';
// Developer-only generated assets. Never modifies index.html.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..','..'),renderer=path.join(root,'renderer'),dest=path.join(renderer,'dsp-dev');
const src=path.join(root,'test','audio-worklet');
const wasm=fs.readFileSync(path.join(src,'opsis-dsp.wasm'));
if(wasm.length<8||wasm.length>4*1024*1024||wasm.readUInt32LE(0)!==0x6d736100)throw Error('invalid local WASM');
const html=fs.readFileSync(path.join(renderer,'index.html'),'utf8');
if(!html.includes("script-src 'self';"))throw Error('CSP anchor missing');
fs.mkdirSync(dest,{recursive:true});
for(const f of ['processor.mjs','wasm-dsp.mjs'])fs.copyFileSync(path.join(src,f),path.join(dest,f));
fs.writeFileSync(path.join(dest,'opsis-dsp.wasm'),wasm);
fs.writeFileSync(path.join(renderer,'index-dsp-dev.html'),html.replace("script-src 'self';","script-src 'self' 'wasm-unsafe-eval';"));
