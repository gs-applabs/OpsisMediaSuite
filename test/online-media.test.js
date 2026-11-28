'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{onlineSource}=require('../renderer/vidlib');
test('recognizes online providers without fetching or granting downloads',()=>{
 for(const [url,provider,kind,capability] of [
 ['https://www.youtube.com/watch?v=abc','youtube','item','adapter-required'],
 ['https://music.youtube.com/watch?v=x&list=y','youtube-music','playlist','adapter-required'],
 ['https://youtu.be/abc','youtube','item','adapter-required'],
 ['https://open.spotify.com/playlist/abc','spotify','playlist','metadata-only'],
 ['https://open.spotify.com/track/abc','spotify','item','metadata-only'],
 ['https://soundcloud.com/a/sets/b','soundcloud','playlist','adapter-required'],
 ['https://artist.bandcamp.com/album/a','bandcamp','album','adapter-required'],
 ['https://vimeo.com/123','vimeo','item','adapter-required'],
 ['https://dai.ly/x','dailymotion','item','adapter-required'],
 ['https://example.test/a.mp4?token=x','direct','item','direct-candidate'],
 ['https://example.test/live.m3u8','direct','playlist','direct-candidate'],
 ['https://youtube.com.evil.test/watch?v=x','direct','unknown','unverified']
 ])assert.deepEqual(onlineSource(url),{provider,kind,capability});
});
test('rejects unsafe input and never returns credentials or raw URL',()=>{
 for(const url of ['file:///C:/test.mp4','javascript:alert(1)','https://u:p@example.test/a.mp4','https://','https://x.test/a\nb',null,'https://x.test/'+ 'x'.repeat(2048)])assert.equal(onlineSource(url),null);
 assert.deepEqual(Object.keys(onlineSource('https://x.test/a.mp4?secret=x')).sort(),['capability','kind','provider']);
});

test('playlist queue preserves occurrence order, requires explicit mapping, rejects duplicates and overflow',()=>{
 const {playlistQueuePlan}=require('../renderer/vidlib');
 const rows=[{id:'same'},{id:'same'},{id:'third'}],bindings=new Map([[0,'C:/music/a.mp3'],[1,'C:/music/b.mp3'],[2,'C:/music/c.mp3']]);
 assert.deepEqual(playlistQueuePlan(rows,[2,0],bindings),{ok:true,paths:['C:/music/a.mp3','C:/music/c.mp3']});
 assert.deepEqual(playlistQueuePlan(rows,[1],new Map()),{ok:false,code:'unmatched-item'});
 assert.deepEqual(playlistQueuePlan(rows,[0],bindings,['c:/music/a.mp3']),{ok:false,code:'duplicate-file'});
 assert.deepEqual(playlistQueuePlan(rows,[0,1],bindings,[],1),{ok:false,code:'queue-full'});
 assert.deepEqual(playlistQueuePlan(rows,[3],bindings),{ok:false,code:'invalid-selection'});
 assert.deepEqual(playlistQueuePlan(rows,[0,1],new Map([[0,'C:/a.mp3'],[1,'c:/A.mp3']])),{ok:false,code:'duplicate-file'});
 assert.deepEqual(playlistQueuePlan(rows,[0],new Map([[0,'https://example.test/a.mp3']])),{ok:false,code:'unmatched-item'});
});

test('playlist mapping shares case and separator identity with music and converter queues',()=>{
 const {playlistQueuePlan}=require('../renderer/vidlib'),rows=[{id:'one'},{id:'two'}];
 assert.deepEqual(playlistQueuePlan(rows,[0],new Map([[0,'C:\\Music\\A.mp3']]),['c:/music/a.mp3']),{ok:false,code:'duplicate-file'});
 assert.deepEqual(playlistQueuePlan(rows,[0,1],new Map([[0,'C:\\Music\\A.mp3'],[1,'c:/music/a.mp3']])),{ok:false,code:'duplicate-file'});
});
