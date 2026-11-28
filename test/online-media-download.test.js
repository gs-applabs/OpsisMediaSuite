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
