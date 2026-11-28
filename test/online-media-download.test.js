'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../online-media-download');
test('direct file candidates require HTTPS and reject provider pages and playlists',()=>{
 assert.equal(D.candidate('https://example.test/a.mp4?token=abc').ext,'.mp4');
 for(const url of ['http://example.test/a.mp4','https://example.test:444/a.mp4','https://open.spotify.com/track/x','https://example.test/x.m3u8','https://u:p@example.test/x.mp4','https://youtube.com/watch?v=x'])assert.equal(D.candidate(url),null);
});
test('rejects private and special IPs and IPv6 pending explicit support',()=>{
 for(const a of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.1.2.3','::1','::ffff:127.0.0.1'])assert.equal(D.publicAddress(a),false);
 assert.equal(D.publicAddress('8.8.8.8'),true);
});

const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{Readable}=require('node:stream');
function fixture(chunks,headers={},statusCode=200){const stream=Readable.from(chunks.map(x=>Buffer.from(x)));stream.headers={'content-type':'video/mp4',...headers};stream.statusCode=statusCode;return stream;}
test('stream writer persists exact bytes and emits progress without partial leftovers',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'opsis-online-'));
 try{const updates=[];const file=await D.saveResponse(fixture(['ab','cd'],{'content-length':'4'}),dir,'.mp4',{maxBytes:8,onProgress:x=>updates.push(x)});
 assert.equal(await fs.readFile(file,'utf8'),'abcd');assert.deepEqual(await fs.readdir(dir),[path.basename(file)]);assert.equal(updates.at(-1).received,4);assert.equal(updates.at(-1).total,4);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('stream writer removes partial on oversized, truncated, wrong MIME, redirect and abort',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'opsis-online-'));
 try{
 for(const [response,opts] of [[fixture(['123456']),{maxBytes:4}],[fixture(['ab'],{'content-length':'4'}),{}],[fixture(['ab'],{'content-type':'text/html'}),{}],[fixture(['ab'],{},302),{}],[fixture([]),{}]]){
 await assert.rejects(D.saveResponse(response,dir,'.mp4',opts));assert.deepEqual(await fs.readdir(dir),[]);
 }
 const controller=new AbortController();controller.abort();await assert.rejects(D.saveResponse(fixture(['ab']),dir,'.mp4',{signal:controller.signal}));assert.deepEqual(await fs.readdir(dir),[]);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
