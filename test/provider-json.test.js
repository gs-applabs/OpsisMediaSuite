'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{Readable}=require('node:stream');
const T=require('../provider-json');
function response(body,code=200,headers={}){const stream=Readable.from([Buffer.from(body)]);stream.statusCode=code;stream.headers={'content-type':'application/json',...headers};return stream;}
test('bounded metadata transport validates status, UTF-8, MIME and bytes',async()=>{
 assert.deepEqual(await T.readJson(response('{"ok":true}'),{maxBytes:100}),{ok:true});
 await assert.rejects(T.readJson(response('{}',302),{maxBytes:100,statusError:c=>'http-'+c}),/http-302/);
 await assert.rejects(T.readJson(response('{}',200,{'content-type':'text/html'}),{maxBytes:100}),/invalid-response/);
 await assert.rejects(T.readJson(response('{}',200,{'content-length':'3'}),{maxBytes:100}),/invalid-response/);
 await assert.rejects(T.readJson(response('{}',200,{'content-encoding':'gzip'}),{maxBytes:100}),/invalid-response/);
 await assert.rejects(T.readJson(response('abcd'),{maxBytes:2}),/response-limit/);
 await assert.rejects(T.readJson(response(Buffer.from([0xff])),{maxBytes:100}));
});
test('origin allowlist blocks credential forwarding and rejects abort before network',async()=>{
 const opts={origins:['https://api.example.test'],maxBytes:100,lib:{get(){throw Error('unexpected network');}}};
 for(const url of ['http://api.example.test/x','https://other.example.test/x','https://u:p@api.example.test/x','https://api.example.test/x#fragment'])await assert.rejects(T.requestJson(url,opts),/invalid-request/);
 const controller=new AbortController();controller.abort();await assert.rejects(T.requestJson('https://api.example.test/x',{...opts,signal:controller.signal}),/abort/i);
});
