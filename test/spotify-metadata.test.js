'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),S=require('../spotify-metadata');
const id='11dFghVXANMlKmJXsNCbNl',token='a'.repeat(50),url='https://open.spotify.com/playlist/'+id;
const track={id,type:'track',name:'Title',artists:[{name:'Artist'}],duration_ms:1000,preview_url:'https://example.test/a.mp3'};
test('Spotify validates exact origin and track/album/playlist IDs',()=>{
 assert.deepEqual(S.identify('https://open.spotify.com/intl-el/track/'+id+'?si=abc'),{kind:'track',id});
 for(const x of ['https://open.spotify.com.evil.test/track/'+id,'http://open.spotify.com/track/'+id,'https://u:p@open.spotify.com/track/'+id,'https://open.spotify.com/track/x'])assert.equal(S.identify(x),null);
 assert.equal(S.validToken('bad token'),false);
});
test('Spotify new playlist endpoint handles item and legacy track fields, bounded pagination and no audio URL',async()=>{
 let calls=0;
 const r=await S.preview(url,token,{transport:async(u,k)=>{
  assert.equal(u.origin,'https://api.spotify.com');assert.equal(u.pathname,'/v1/playlists/'+id+'/items');assert.equal(k,token);assert.equal(u.searchParams.has('token'),false);assert.equal(Number(u.searchParams.get('offset')),calls*3);calls++;
  return {next:'https://untrusted.invalid/never-followed',items:[{item:track},{track},{is_local:true,item:track}]};
 }});
 assert.equal(calls,4);assert.equal(r.truncated,true);assert.equal(r.items.length,8);assert.equal(r.skipped,4);assert.equal(r.items[2].position,3);assert.equal(r.items[0].preview_url,undefined);assert.equal(r.items[0].link,'https://open.spotify.com/track/'+id);
});
test('single track and album paths, abort and denied responses',async()=>{
 const one=await S.preview('https://open.spotify.com/track/'+id,token,{transport:async u=>{assert.equal(u.pathname,'/v1/tracks/'+id);return track;}});
 assert.equal(one.items.length,1);
 const album=await S.preview('https://open.spotify.com/album/'+id,token,{transport:async u=>{assert.equal(u.pathname,'/v1/albums/'+id+'/tracks');return {items:[track],next:null};}});
 assert.equal(album.items.length,1);
 await assert.rejects(S.preview(url,token,{transport:async()=>{throw Error('access-denied');}}),/access-denied/);
 const ctrl=new AbortController();ctrl.abort();await assert.rejects(S.preview(url,token,{signal:ctrl.signal,transport:async()=>{throw Error('unexpected');}}),/abort/i);
});
