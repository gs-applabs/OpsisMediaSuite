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
