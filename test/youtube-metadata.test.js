'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Y=require('../youtube-metadata');
const key='a'.repeat(39),id='abcdefghijk';
test('official YouTube URL admission',()=>{
 assert.deepEqual(Y.identify('https://music.youtube.com/watch?v='+id+'&list=PLabc'),{kind:'playlist',id:'PLabc'});
 assert.deepEqual(Y.identify('https://youtu.be/'+id),{kind:'video',id});
 for(const u of ['https://youtube.com.evil.test/watch?v='+id,'https://u:p@youtube.com/watch?v='+id,'http://youtube.com/watch?v='+id,'https://youtube.com/watch?v=x'])assert.equal(Y.identify(u),null);
});
test('metadata preview uses fixed Google API and bounded pagination, never media URLs',async()=>{
 let calls=0;
 const result=await Y.preview('https://youtube.com/playlist?list=PLabc',key,{transport:async(u,k)=>{
  assert.equal(u.origin,'https://www.googleapis.com');assert.equal(u.pathname,'/youtube/v3/playlistItems');assert.equal(k,key);
  assert.equal(u.searchParams.has('key'),false);calls++;
  return {nextPageToken:'page'+calls,items:[{snippet:{title:'Track '+calls,resourceId:{videoId:id},position:calls-1,channelTitle:'Artist',downloadUrl:'https://example.test/a.mp3'}}]};
 }});
 assert.equal(calls,4);assert.equal(result.truncated,true);assert.equal(result.items.length,4);assert.equal(result.items[0].downloadUrl,undefined);
});
test('rejects repeated pagination token, invalid key and cancelled request',async()=>{
 const url='https://youtube.com/playlist?list=PLabc';
 await assert.rejects(Y.preview(url,key,{transport:async()=>({items:[],nextPageToken:'same'})}),/page-token/);
 await assert.rejects(Y.preview(url,'bad'),/key/);
 const controller=new AbortController();controller.abort();await assert.rejects(Y.preview(url,key,{signal:controller.signal,transport:async()=>{throw Error('unexpected network');}}),/abort/i);
});
