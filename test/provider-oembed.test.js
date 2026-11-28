'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../provider-oembed');
test('canonical public URLs for supported providers, no private query or arbitrary host forwarding',()=>{
 assert.equal(P.identify('https://vimeo.com/123?secret=hidden').link,'https://vimeo.com/123');
 assert.equal(P.identify('https://dai.ly/x123').link,'https://www.dailymotion.com/video/x123');
 assert.equal(P.identify('https://soundcloud.com/artist/sets/album').kind,'playlist');
 for(const url of ['http://vimeo.com/123','https://vimeo.com.evil.test/123','https://u:p@vimeo.com/123','https://vimeo.com/123/privatehash','https://soundcloud.com/a','https://bandcamp.com/track/a'])assert.equal(P.identify(url),null);
});
test('fixed official endpoints and data-only results; no markup or media links',async()=>{
 for(const [input,origin] of [['https://vimeo.com/123','https://vimeo.com'],['https://dai.ly/x123','https://www.dailymotion.com'],['https://soundcloud.com/artist/track','https://soundcloud.com']]){
 const result=await P.preview(input,{transport:async url=>{assert.equal(url.origin,origin);assert.equal(url.searchParams.get('url'),P.identify(input).link);return {title:'Example',author_name:'Artist',html:'<script>bad</script>',thumbnail_url:'https://unknown.test/image',download_url:'https://unknown.test/file'};}});
 assert.equal(result.items[0].title,'Example');assert.equal(result.items[0].html,undefined);assert.equal(result.items[0].download_url,undefined);assert.equal(result.collectionOnly,false);
 }
});
test('collection preview does not pretend to enumerate tracks; cancellation and errors',async()=>{
 const result=await P.preview('https://soundcloud.com/a/sets/b',{transport:async()=>({title:'Set'})});assert.equal(result.collectionOnly,true);
 await assert.rejects(P.preview('https://vimeo.com/123',{transport:async()=>({html:'bad'})}),/invalid-response/);
 const ctrl=new AbortController();ctrl.abort();await assert.rejects(P.preview('https://vimeo.com/123',{signal:ctrl.signal,transport:async()=>{throw Error('unexpected');}}),/abort/i);
});
