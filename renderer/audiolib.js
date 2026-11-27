/* Waveframe audio library — pure functions, no DOM / Web Audio dependency, so they run both in the renderer
 * (<script src="audiolib.js"> exposes window.WaveframeAudio) and in node (require) for the unit tests.
 *
 *  - integratedLufs():   ITU-R BS.1770-4 integrated loudness (K-weighting + 400 ms blocks, 75 % overlap, absolute -70 LUFS
 *                        and relative -10 LU gates). Replaces the old RMS estimate for loudness normalisation.
 *  - lufsToGainDb():     gain that brings a track to the target loudness, clamped.
 *  - toEqualizerApo():   waveframe EQ -> Equalizer APO config text (also understood by Opsis "Audio Enhancement").
 *  - parseEqualizerApo() the reverse, for the lines we generate (Preamp / Filter n: ON PK|LSC|HSC ...).
 *  - sleepFadeGain():    master-gain factor for the sleep timer's fade-out.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WaveframeAudio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EQ_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  /** K-weighting biquad coefficients for any sample rate (BS.1770-4 filter re-derived from its analogue prototype). */
  function kWeighting(fs) {
    // Stage 1: high shelf (+4 dB above ~1.7 kHz) — models the head's acoustic effect.
    const G = 3.999843853973347, Q1 = 0.7071752369554196, fc1 = 1681.9744509555319;
    let K = Math.tan(Math.PI * fc1 / fs);
    const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    let a0 = 1 + K / Q1 + K * K;
    const shelf = {
      b: [(Vh + Vb * K / Q1 + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q1 + K * K) / a0],
      a: [1, 2 * (K * K - 1) / a0, (1 - K / Q1 + K * K) / a0],
    };
    // Stage 2: revised low-frequency B-curve (high-pass at ~38 Hz).
    const Q2 = 0.5003270373238773, fc2 = 38.13547087613982;
    K = Math.tan(Math.PI * fc2 / fs);
    a0 = 1 + K / Q2 + K * K;
    const high = { b: [1, -2, 1], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q2 + K * K) / a0] };
    return [shelf, high];
  }

  /**
   * Integrated loudness in LUFS. Keep the existing K-weighting and gates,
   * but accumulate overlapping block energies with a bounded 400 ms ring.
   * For multichannel inputs the legacy weighting is retained until an explicit
   * channel layout is supplied; this is not layout-aware 5.1/7.1 metering.
   */
  function integratedLufs(channels, sampleRate) {
    if(!Array.isArray(channels)||!channels.length||channels.length>32||
       !Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)return -Infinity;
    const n=channels[0]?.length;
    if(!Number.isSafeInteger(n)||channels.some(ch=>!ch||ch.length!==n))return -Infinity;
    const block=Math.round(.4*sampleRate),step=Math.round(.1*sampleRate);
    if(n<block)return -Infinity;
    const [shelf,high]=kWeighting(sampleRate);
    const [b0,b1,b2]=shelf.b,[,a1,a2]=shelf.a;
    const [c0,c1,c2]=high.b,[,d1,d2]=high.a;
    const blocks=new Float64Array(1+Math.floor((n-block)/step)),ring=new Float64Array(block);
    for(let c=0;c<channels.length;c++){
      const ch=channels[c],weight=channels.length>=5&&(c===3||c===4)?1.41:1;
      let x1=0,x2=0,y1=0,y2=0,z1=0,z2=0,sum=0,index=0,next=block,slot=0;
      ring.fill(0);
      // Process only through the last complete block.
      const stop=block+(blocks.length-1)*step;
      for(let i=0;i<stop;i++){
        const x=ch[i];if(!Number.isFinite(x))return -Infinity;
        const y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;
        const z=c0*y+c1*y1+c2*y2-d1*z1-d2*z2;
        x2=x1;x1=x;y2=y1;y1=y;z2=z1;z1=z;
        const energy=z*z;if(!Number.isFinite(energy))return -Infinity;
        sum+=energy-ring[index];ring[index]=energy;
        if(++index===block)index=0;
        if(i+1===next){
          // Rebase occasionally to limit subtractive drift on long quiet tails.
          if((slot&255)===0){sum=0;for(let k=0;k<block;k++)sum+=ring[k];}
          blocks[slot++]+=weight*Math.max(0,sum)/block;
          next+=step;
        }
      }
    }
    const lufs=z=>-.691+10*Math.log10(z);
    const absolute=Math.pow(10,(-70+.691)/10);
    let sum=0,count=0;
    for(const z of blocks)if(z>absolute){sum+=z;count++;}
    if(!count)return -Infinity;
    const gate=Math.max(absolute,sum/count*.1);
    sum=0;count=0;
    for(const z of blocks)if(z>gate){sum+=z;count++;}
    return count?lufs(sum/count):-Infinity;
  }

  /** Linear gain that moves a track at `lufs` to `targetLufs`, limited to ±clampDb (default ±12 dB). */
  function lufsToGainDb(lufs, targetLufs = -18, clampDb = 12) {
    if (!Number.isFinite(lufs)) return 0;
    return Math.max(-clampDb, Math.min(clampDb, targetLufs - lufs));
  }

  const dbToLinear = (db) => Math.pow(10, db / 20);

  /** Waveframe EQ -> Equalizer APO text. state: { bands:[10 dB values], bassBoost: dB (optional) }. */
  function toEqualizerApo(state, name = 'Waveframe EQ') {
    const bands = (state.bands || []).slice(0, EQ_FREQS.length);
    while (bands.length < EQ_FREQS.length) bands.push(0);
    const bass = Number(state.bassBoost) || 0;
    // Headroom: the largest boost anywhere (band + bass shelf) is cancelled by the preamp so the output cannot clip.
    const maxBoost = Math.max(0, ...bands, bass, ...bands.map((g, i) => g + (i <= 2 ? bass : 0)));
    const preamp = -(Math.ceil(maxBoost * 10) / 10);
    const f = (v) => (Math.round(v * 10) / 10).toFixed(1);
    const lines = [`# ${String(name).replace(/[\r\n]+/g, ' ')} — exported by Waveframe (open with Equalizer APO or Opsis > Audio Enhancement)`, `Preamp: ${f(preamp)} dB`];
    let n = 1;
    EQ_FREQS.forEach((freq, i) => {
      if (Math.abs(bands[i]) < 0.05) return;
      const type = i === 0 ? 'LSC' : i === EQ_FREQS.length - 1 ? 'HSC' : 'PK';
      const q = type === 'PK' ? 1.41 : 0.70;
      lines.push(`Filter ${n++}: ON ${type} Fc ${freq} Hz Gain ${f(bands[i])} dB Q ${q.toFixed(2)}`);
    });
    if (Math.abs(bass) >= 0.05) lines.push(`Filter ${n++}: ON LSC Fc 100 Hz Gain ${f(bass)} dB Q 0.70`);
    return lines.join('\r\n') + '\r\n';
  }

  /** Parses the Equalizer APO lines we generate. Returns { preamp, filters:[{type,fc,gain,q}] } (unknown lines are ignored). */
  function parseEqualizerApo(text) {
    const out = { preamp: 0, filters: [] };
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim();
      let m = /^Preamp:\s*(-?\d+(?:\.\d+)?)\s*dB$/i.exec(line);
      if (m) { out.preamp = parseFloat(m[1]); continue; }
      m = /^Filter\s*\d*:\s*ON\s+(PK|LSC|HSC|LS|HS)\s+Fc\s+(\d+(?:\.\d+)?)\s*Hz\s+Gain\s+(-?\d+(?:\.\d+)?)\s*dB(?:\s+Q\s+(\d+(?:\.\d+)?))?/i.exec(line);
      if (m) out.filters.push({ type: m[1].toUpperCase(), fc: parseFloat(m[2]), gain: parseFloat(m[3]), q: m[4] ? parseFloat(m[4]) : 0.7 });
    }
    return out;
  }

  /** Fade-out factor (1 → 0) for the last `fadeMs` of the sleep timer. */
  function sleepFadeGain(remainingMs, fadeMs = 10000) {
    if (remainingMs <= 0) return 0;
    if (remainingMs >= fadeMs) return 1;
    return remainingMs / fadeMs;
  }

  // Independent presence and stereo balance; no external DSP implementation copied.
  function presenceParams(amount) {
    const n=Math.max(0,Math.min(100,Number(amount)||0))/100;
    return {frequency:2800,q:.85,gain:6*n};
  }
  function balanceValue(amount) {return Math.max(-1,Math.min(1,(Number(amount)||0)/100));}
  function impulseSamples(rate,duration=2.2,decay=2,channel=0){
    if(!Number.isFinite(rate)||rate<8000||rate>192000||!Number.isFinite(duration)||duration<=0||duration>4||!Number.isFinite(decay)||decay<.1||decay>8)throw Error('invalid impulse');
    const n=Math.floor(rate*duration),out=new Float32Array(n);let seed=(0x9e3779b9^(channel*0x85ebca6b))>>>0;
    for(let i=0;i<n;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;out[i]=((seed>>>0)/4294967296*2-1)*Math.pow(1-i/n,decay);}
    return out;
  }
  function effectMix(amount,legacy){return Math.max(0,Math.min(100,Number.isFinite(Number(amount))?Number(amount):100))/100*legacy;}
  function compressorParams(mode){
    const modes={gentle:{threshold:-18,knee:20,ratio:2,attack:.015,release:.35},standard:{threshold:-24,knee:30,ratio:8,attack:.003,release:.25},night:{threshold:-32,knee:24,ratio:12,attack:.005,release:.4}};
    return {...(Object.hasOwn(modes,mode)?modes[mode]:modes.standard)};
  }
  // Existing playback stays the sole owner until the native DSP is proven.
  // This versioned snapshot is the adapter contract, not a second live graph.
  function nativeDspConfig(state,mode='native',defaultIsFxSound=false){
    const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,Number.isFinite(v)?v:0));
    const bands=Array.isArray(state?.eqBands)?state.eqBands:[];
    return {version:1,enabled:state?.masterEnabled===true&&!routeBypass(mode,defaultIsFxSound)?1:0,
      eq_db:EQ_FREQS.map((_,i)=>clamp(bands[i],-12,12)),bass_db:clamp(state?.bassBoost,-12,12),
      presence_percent:clamp(state?.presence,0,100),balance_percent:clamp(state?.balance,-100,100),
      surround_percent:clamp(state?.surround,0,100),preamp_db:clamp(state?.volumeBoost,-24,12)};
  }
  function nativeDspConfigV2(state,mode='native',defaultIsFxSound=false){
    const percent=(v)=>Math.max(0,Math.min(100,Number.isFinite(v)?v:100));
    const modes={gentle:1,standard:2,night:3};
    return {version:2,base:nativeDspConfig(state,mode,defaultIsFxSound),
      compressor_mode:state?.compressor===true?(Object.hasOwn(modes,state.compressorMode)?modes[state.compressorMode]:2):0,
      ambience_percent:state?.reverb===true?percent(state.reverbAmount):0,
      exciter_percent:state?.exciter===true?percent(state.exciterAmount):0,
      limiter:1};
  }
  function routeBypass(mode,defaultIsFxSound) { return mode==='external'||(mode==='auto'&&defaultIsFxSound===true); }
  return { nativeDspConfig,nativeDspConfigV2,impulseSamples,effectMix,compressorParams,presenceParams,balanceValue,routeBypass, EQ_FREQS, kWeighting, integratedLufs, lufsToGainDb, dbToLinear, toEqualizerApo, parseEqualizerApo, sleepFadeGain };
});
