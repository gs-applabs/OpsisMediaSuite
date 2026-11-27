'use strict';
// Unit tests for renderer/audiolib.js — run with `npm test` (node's built-in test runner, no extra dependencies).
const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../renderer/audiolib.js');

function sine(freq, seconds, fs, amplitude) {
  const a = new Float32Array(Math.round(seconds * fs));
  for (let i = 0; i < a.length; i++) a[i] = amplitude * Math.sin(2 * Math.PI * freq * i / fs);
  return a;
}
const dbfs = (db) => Math.pow(10, db / 20);

test('K-weighting coefficients at 48 kHz match the BS.1770-4 reference table', () => {
  const [shelf, high] = lib.kWeighting(48000);
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);
  near(shelf.b[0], 1.53512485958697); near(shelf.b[1], -2.69169618940638); near(shelf.b[2], 1.19839281085285);
  near(shelf.a[1], -1.69065929318241); near(shelf.a[2], 0.73248077421585);
  near(high.a[1], -1.99004745483398); near(high.a[2], 0.99007225036621);
});

test('stereo 997 Hz sine at -23 dBFS measures -23.0 LUFS (EBU Tech 3341 calibration)', () => {
  const fs = 48000, s = sine(997, 10, fs, dbfs(-23));
  const l = lib.integratedLufs([s, s], fs);
  assert.ok(Math.abs(l - -23.0) < 0.1, `got ${l}`);
});

test('measurement is sample-rate independent (44.1 kHz, same -23 LUFS)', () => {
  const fs = 44100, s = sine(997, 10, fs, dbfs(-23));
  const l = lib.integratedLufs([s, s], fs);
  assert.ok(Math.abs(l - -23.0) < 0.15, `got ${l}`);
});

test('a mono sine reads 3 LU lower than the same sine on both channels', () => {
  const fs = 48000, s = sine(997, 10, fs, dbfs(-20));
  const stereo = lib.integratedLufs([s, s], fs), mono = lib.integratedLufs([s], fs);
  assert.ok(Math.abs((stereo - mono) - 3.01) < 0.05, `diff ${stereo - mono}`);
});

test('loudness follows level: +6 dB of amplitude = +6 LU', () => {
  const fs = 48000;
  const quiet = sine(997, 8, fs, dbfs(-30)), loud = sine(997, 8, fs, dbfs(-24));
  const d = lib.integratedLufs([loud, loud], fs) - lib.integratedLufs([quiet, quiet], fs);
  assert.ok(Math.abs(d - 6) < 0.05, `diff ${d}`);
});

test('the relative gate ignores a very quiet passage (gated, not averaged in)', () => {
  const fs = 48000;
  const loud = sine(997, 6, fs, dbfs(-20)), quiet = sine(997, 6, fs, dbfs(-60));
  const both = new Float32Array(loud.length + quiet.length); both.set(loud, 0); both.set(quiet, loud.length);
  const gated = lib.integratedLufs([both, both], fs), loudOnly = lib.integratedLufs([loud, loud], fs);
  assert.ok(Math.abs(gated - loudOnly) < 0.2, `gated ${gated} vs ${loudOnly}`);
});

test('silence and too-short material return -Infinity (never NaN)', () => {
  const fs = 48000;
  assert.equal(lib.integratedLufs([new Float32Array(fs * 3)], fs), -Infinity);
  assert.equal(lib.integratedLufs([new Float32Array(1000)], fs), -Infinity);
  assert.equal(lib.integratedLufs([], fs), -Infinity);
});

test('lufsToGainDb moves a track to the target and clamps', () => {
  assert.equal(lib.lufsToGainDb(-24, -18), 6);
  assert.equal(lib.lufsToGainDb(-10, -18), -8);
  assert.equal(lib.lufsToGainDb(-50, -18), 12);     // clamp +12
  assert.equal(lib.lufsToGainDb(0, -18), -12);      // clamp -12
  assert.equal(lib.lufsToGainDb(-Infinity, -18), 0);
});

test('toEqualizerApo writes a preamp that cancels the largest boost and one filter per active band', () => {
  const txt = lib.toEqualizerApo({ bands: [8, 7, 5, 2, 0, 0, 0, 0, 0, -3], bassBoost: 0 }, 'Bass boost');
  assert.match(txt, /Preamp: -8\.0 dB/);
  assert.match(txt, /Filter 1: ON LSC Fc 32 Hz Gain 8\.0 dB Q 0\.70/);
  assert.match(txt, /Filter 4: ON PK Fc 250 Hz Gain 2\.0 dB Q 1\.41/);
  assert.match(txt, /ON HSC Fc 16000 Hz Gain -3\.0 dB/);
  assert.equal((txt.match(/^Filter /gm) || []).length, 5);        // 32, 64, 125, 250, 16000
  assert.ok(txt.endsWith('\r\n'));
});

test('a flat EQ exports a flat file (preamp 0, no filters)', () => {
  const txt = lib.toEqualizerApo({ bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
  assert.match(txt, /Preamp: 0\.0 dB/);
  assert.equal((txt.match(/^Filter /gm) || []).length, 0);
});

test('bass boost adds a shelf and is counted in the headroom', () => {
  const txt = lib.toEqualizerApo({ bands: [4, 0, 0, 0, 0, 0, 0, 0, 0, 0], bassBoost: 6 });
  assert.match(txt, /Preamp: -10\.0 dB/);                          // 4 (band) + 6 (shelf) overlap at the lowest band
  assert.match(txt, /ON LSC Fc 100 Hz Gain 6\.0 dB/);
});

test('export then parse round-trips every filter', () => {
  const bands = [3, 2, 1, 0, 1, 2, 1, 1, 2, 2];
  const parsed = lib.parseEqualizerApo(lib.toEqualizerApo({ bands }));
  assert.equal(parsed.preamp, -3);
  const byFc = Object.fromEntries(parsed.filters.map((f) => [f.fc, f.gain]));
  lib.EQ_FREQS.forEach((fc, i) => { if (bands[i]) assert.equal(byFc[fc], bands[i], `band ${fc}`); });
});

test('parse ignores comments, junk and OFF filters', () => {
  const p = lib.parseEqualizerApo('# hi\nInclude: evil.txt\nPreamp: -2 dB\nFilter 1: OFF PK Fc 1000 Hz Gain 3 dB Q 1\nFilter 2: ON PK Fc 1000 Hz Gain 3 dB Q 1\nrandom');
  assert.equal(p.preamp, -2);
  assert.equal(p.filters.length, 1);
});

test('sleep fade: full volume until the last 10 s, then linear to silence', () => {
  assert.equal(lib.sleepFadeGain(60000), 1);
  assert.equal(lib.sleepFadeGain(10000), 1);
  assert.equal(lib.sleepFadeGain(5000), 0.5);
  assert.equal(lib.sleepFadeGain(0), 0);
  assert.equal(lib.sleepFadeGain(-5), 0);
});

test('FxSound policy bypasses only explicit external mode or confirmed auto output',()=>{
 assert.equal(lib.routeBypass('native',true),false);
 assert.equal(lib.routeBypass('external',false),true);
 assert.equal(lib.routeBypass('auto',true),true);
 assert.equal(lib.routeBypass('auto',false),false);
 assert.equal(lib.routeBypass('auto',null),false);
 assert.equal(lib.routeBypass('unknown',true),false);
});

test('presence and stereo balance are bounded and neutral by default',()=>{
 assert.equal(lib.presenceParams(0).gain,0);assert.equal(lib.presenceParams(100).gain,6);assert.equal(lib.presenceParams(200).gain,6);assert.equal(lib.presenceParams(-10).gain,0);
 assert.equal(lib.balanceValue(-200),-1);assert.equal(lib.balanceValue(25),.25);assert.equal(lib.balanceValue(NaN),0);
});

test('compressor modes retain legacy standard and bound all parameters',()=>{assert.equal(lib.compressorParams('standard').ratio,8);assert.equal(lib.compressorParams('gentle').ratio,2);assert.equal(lib.compressorParams('night').threshold,-32);assert.deepEqual(lib.compressorParams('__proto__'),lib.compressorParams('standard'));});

test('effect mix is bounded and retains legacy defaults',()=>{assert.equal(lib.effectMix(100,.28),.28);assert.equal(lib.effectMix(50,.28),.14);assert.equal(lib.effectMix(-1,.35),0);assert.equal(lib.effectMix(200,.35),.35);assert.equal(lib.effectMix(undefined,.28),.28);});

test('reverb impulse is repeatable, stereo independent and correct for export sample rate',()=>{const a=lib.impulseSamples(8000,.1,2,0),b=lib.impulseSamples(8000,.1,2,0),r=lib.impulseSamples(8000,.1,2,1);assert.deepEqual(a,b);assert.notDeepEqual(a,r);assert.equal(a.length,800);assert.equal(lib.impulseSamples(48000,.1).length,4800);assert.ok(Math.abs(a.at(-1))<.001);assert.throws(()=>lib.impulseSamples(1));});


test('native DSP snapshot reuses existing settings and respects external bypass',()=>{
 const state={masterEnabled:true,eqBands:[2,NaN,30],bassBoost:6,presence:50,balance:-25,surround:40,volumeBoost:2,compressor:true};
 const before={...state,eqBands:state.eqBands.slice()};
 const cfg=lib.nativeDspConfig(state,'native',true);
 assert.equal(cfg.enabled,1);assert.deepEqual(cfg.eq_db,[2,0,12,0,0,0,0,0,0,0]);assert.equal(cfg.presence_percent,50);
 assert.equal(lib.nativeDspConfig(state,'external').enabled,0);
 assert.equal(lib.nativeDspConfig(state,'auto',true).enabled,0);
 assert.equal(lib.nativeDspConfig({...state,masterEnabled:false}).enabled,0);
 assert.deepEqual(state,before);
});


test('v2 native effects map existing toggles and preset amounts without new routing',()=>{
 const state={masterEnabled:true,compressor:true,compressorMode:'night',reverb:true,reverbAmount:45,exciter:false,exciterAmount:80};
 const cfg=lib.nativeDspConfigV2(state);
 assert.equal(cfg.base.version,1);assert.equal(cfg.version,2);assert.equal(cfg.compressor_mode,3);
 assert.equal(cfg.ambience_percent,45);assert.equal(cfg.exciter_percent,0);
 assert.equal(lib.nativeDspConfigV2(state,'external').base.enabled,0);
 assert.equal(lib.nativeDspConfigV2({...state,compressor:false}).compressor_mode,0);
});


test('native offline wire validates format, all settings and frame budget',()=>{
 const {makeRequest}=require('../native-dsp-bridge');
 const cfg=lib.nativeDspConfigV2({masterEnabled:true,eqBands:[0,0,0,0,0,6]});
 const pcm=new Uint8Array(8),packet=makeRequest(48000,2,pcm,cfg);
 assert.equal(packet.length,104);assert.equal(packet.toString('ascii',0,4),'ODP2');
 assert.equal(packet.readUInt32LE(12),1);assert.equal(packet.readFloatLE(40),6);
 assert.equal(makeRequest(8000,2,pcm,cfg),null);
 assert.equal(makeRequest(48000,6,pcm,cfg),null);
 assert.equal(makeRequest(48000,2,new Uint8Array(7),cfg),null);
 assert.equal(makeRequest(48000,2,pcm,{...cfg,ambience_percent:101}),null);
});
test('native offline adapter actually processes PCM when built by CI',async t=>{
 const {createDspBridge}=require('../native-dsp-bridge');
 const bridge=createDspBridge({app:{isPackaged:false}});
 if(!bridge.available()){
   if(process.platform==='win32'&&process.env.GITHUB_ACTIONS==='true')assert.fail('CI native DSP adapter absent');
   t.skip('native DSP developer build absent');return;
 }
 const rate=48000,frames=rate,bytes=new Uint8Array(frames*8),v=new DataView(bytes.buffer);
 for(let i=0;i<frames;i++){const x=.025*Math.sin(2*Math.PI*1000*i/rate);v.setFloat32(i*8,x,true);v.setFloat32(i*8+4,x,true);}
 const cfg=lib.nativeDspConfigV2({masterEnabled:true,eqBands:[0,0,0,0,0,6]});
 const out=await bridge.render(rate,2,bytes,cfg);assert.equal(out.ok,true,out.code);
 assert.equal(out.pcm.byteLength,bytes.byteLength);
 const view=new DataView(out.pcm.buffer,out.pcm.byteOffset,out.pcm.byteLength);let a=0,b=0;
 for(let i=rate/2;i<rate;i++){a+=v.getFloat32(i*8,true)**2;b+=view.getFloat32(i*8,true)**2;}
 assert.ok(Math.abs(10*Math.log10(b/a)-6)<.2);
 const bypass=await bridge.render(rate,2,bytes,{...cfg,base:{...cfg.base,enabled:0}});
 assert.equal(bypass.ok,true);assert.deepEqual(bypass.pcm,bytes);
});
