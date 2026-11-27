'use strict';

/* ------------------------------------------------------------------ */
/* Global error handling — crash overlay + local log file             */
/* ------------------------------------------------------------------ */
function handleFatalError(message, details) {
  window.waveframe?.logCrash?.(`${message}\n${details || ''}`);
  const overlay = document.getElementById('crashOverlay');
  const detailsEl = document.getElementById('crashDetails');
  if (!overlay || !detailsEl) return; // can happen if DOM isn't ready yet
  detailsEl.textContent = `${message}\n${details || ''}`.trim();
  overlay.classList.remove('dep-hidden');
}
window.addEventListener('error', (e) => {
  handleFatalError(e.message, e.error?.stack);
});
window.addEventListener('unhandledrejection', (e) => {
  handleFatalError('Unhandled promise rejection', e.reason?.stack || String(e.reason));
});

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

const EQ_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const PRESETS = [
  { key: 'flat', icon: '⚖️', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { key: 'music', icon: '🎵', bands: [3, 2, 1, 0, 1, 2, 1, 1, 2, 2] },
  { key: 'gaming', icon: '🎮', bands: [4, 3, 1, -1, -1, 0, 2, 3, 4, 4] },
  { key: 'movies', icon: '🎬', bands: [6, 5, 3, 1, 0, 0, 1, 2, 3, 4] },
  { key: 'voice', icon: '🎙️', bands: [-4, -3, -2, 0, 2, 4, 5, 3, 1, 0] },
  { key: 'bassBoost', icon: '🔊', bands: [8, 7, 5, 2, 0, 0, 0, 0, 0, 0] },
  { key: 'classical', icon: '🎻', bands: [1, 1, 0, 0, 0, 0, 0, 1, 2, 2] },
  { key: 'rock', icon: '🎸', bands: [3, 2, 1, -1, -1, 1, 2, 3, 3, 2] },
  { key: 'pop', icon: '⭐', bands: [-1, 0, 2, 4, 4, 2, 0, -1, -1, -1] },
  { key: 'jazz', icon: '🎷', bands: [2, 1, 0, 1, 2, 2, 1, 1, 2, 3] },
  { key: 'electronic', icon: '🎛️', bands: [5, 4, 1, 0, -1, 1, 1, 2, 4, 5] },
  { key: 'hiphop', icon: '🎤', bands: [6, 5, 3, 1, 0, -1, 0, 1, 2, 2] },
  { key: 'acoustic', icon: '🪕', bands: [2, 2, 1, 0, 0, 1, 2, 2, 1, 1] },
  { key: 'latin', icon: '💃', bands: [3, 2, 1, 0, 1, 2, 3, 3, 2, 1] },
  { key: 'smallSpeakers', icon: '🔈', bands: [4, 3, 2, 1, 0, 1, 2, 3, 3, 2] },
  { key: 'trebleBoost', icon: '✨', bands: [0, 0, 0, 0, 0, 1, 3, 5, 6, 6] },
];

const QUALITY = {
  low: { sampleRate: 22050, bitrate: 96 },
  medium: { sampleRate: 44100, bitrate: 128 },
  high: { sampleRate: 48000, bitrate: 320 },
  lossless: { sampleRate: 48000, bitrate: null },
};
// Opus is far more efficient than MP3/AAC at a given bitrate, so the shared
// QUALITY bitrates (up to 320k) would be wasteful for it — use its own,
// lower bitrate ladder instead (still forced to 48kHz, see main.js).
const OPUS_BITRATES = { low: 64, medium: 96, high: 160 };

const USER_PRESET_KEY = 'waveframe.userPresets';

/* ------------------------------------------------------------------ */
/* Audio engine                                                       */
/* ------------------------------------------------------------------ */

class AudioEngine {
  constructor() {
    this.ctx=null;
    this.workletPreference=false;this.workletReady=false;this.normalizationGain=1;

    this.slots = [
      { el: document.getElementById('audioSlotA'), source: null, gain: null, name: null },
      { el: document.getElementById('audioSlotB'), source: null, gain: null, name: null },
    ];
    this.activeSlot = 0;
    this.crossfadeSeconds = 0;
    this.transitionEpoch=0;this.transitionTimer=null;this.pendingTransition=null;

    this.micStream = null;
    this.micSource = null;
    this.testOsc = null;

    this.state = {
      eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      bassBoost: 0,
      reverbAmount:100,exciterAmount:100,
      compressorMode:'standard',
      presence:0,
      balance:0,
      volumeBoost: 0,
      surround: 0,
      compressor: false,
      reverb: false,
      exciter: false,
      tempo: 1,
      preservePitch: true,
      volume: 0.8,
      muted: false,
      normalizationEnabled: true,
      masterEnabled: true,
      routeBypass: false,
    };

  }

  // UI preferences exist independently of the real-time audio device.
  // Only actual playback, microphone, test tone or developer worklet needs it.
  ensureGraph(){
    if(this.ctx)return;
    this.ctx=new (window.AudioContext||window.webkitAudioContext)();
    this._buildGraph();
    const s=this.state;
    this.applyEqBands(s.eqBands.slice());this.setBassBoost(s.bassBoost);this.setVolumeBoostDb(s.volumeBoost);
    this.setPresence(s.presence);this.setBalance(s.balance);this.setSurround(s.surround);
    this.setCompressorMode(s.compressorMode);this.setCompressor(s.compressor);
    this.setReverb(s.reverb);this.setExciter(s.exciter);this.setNormalizationGain(this.normalizationGain);
    this.setMuted(s.muted);this.applyLiveBypass(true);
    window.dispatchEvent(new Event('waveframe:audio-graph-ready'));
  }

  _buildGraph() {
    const ctx = this.ctx;

    this.mixSum = ctx.createGain();
    this.mixSum.gain.value = 1;

    this.slots.forEach((slot) => {
      slot.source = ctx.createMediaElementSource(slot.el);
      slot.gain = ctx.createGain();
      slot.gain.gain.value = 0;
      slot.source.connect(slot.gain);
      slot.gain.connect(this.mixSum);
    });

    this.micGain = ctx.createGain();
    this.micGain.gain.value = 0;
    this.micGain.connect(this.mixSum);

    this.toneGain = ctx.createGain();
    this.toneGain.gain.value = 0;
    this.toneGain.connect(this.mixSum);

    this.eqNodes = EQ_FREQS.map((freq, i) => {
      const f = ctx.createBiquadFilter();
      if (i === 0) f.type = 'lowshelf';
      else if (i === EQ_FREQS.length - 1) f.type = 'highshelf';
      else f.type = 'peaking';
      f.frequency.value = freq;
      f.Q.value = 1.4;
      f.gain.value = 0;
      return f;
    });
    for (let i = 0; i < this.eqNodes.length - 1; i++) {
      this.eqNodes[i].connect(this.eqNodes[i + 1]);
    }
    // Loudness-normalization trim, applied before any EQ/FX coloring so
    // boosts behave consistently regardless of the source track's own level.
    this.normGain = ctx.createGain();
    this.normGain.gain.value = 1;
    this.mixSum.connect(this.normGain);
    this.normGain.connect(this.eqNodes[0]);
    const eqOut = this.eqNodes[this.eqNodes.length - 1];

    this.bassBoostNode = ctx.createBiquadFilter();
    this.bassBoostNode.type = 'lowshelf';
    this.bassBoostNode.frequency.value = 90;
    this.bassBoostNode.gain.value = 0;
    eqOut.connect(this.bassBoostNode);

    this.volumeBoostNode = ctx.createGain();
    this.volumeBoostNode.gain.value = 1;
    this.presenceNode=ctx.createBiquadFilter();this.presenceNode.type='peaking';this.presenceNode.frequency.value=2800;this.presenceNode.Q.value=.85;this.presenceNode.gain.value=0;
    this.bassBoostNode.connect(this.presenceNode);this.presenceNode.connect(this.volumeBoostNode);

    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    // Ensure mono inputs are duplicated before splitting rather than halved.
    const stereo = ctx.createGain(); stereo.channelCount = 2; stereo.channelCountMode = 'explicit'; stereo.channelInterpretation = 'speakers';
    this.volumeBoostNode.connect(stereo); stereo.connect(splitter);

    this.surroundInvert = ctx.createGain();
    this.surroundInvert.gain.value = -1;
    this.surroundMid = ctx.createGain();
    this.surroundMid.gain.value = 0.5;
    this.surroundSide = ctx.createGain();
    this.surroundSide.gain.value = 0.5; // neutral width preserves left/right stereo

    splitter.connect(this.surroundMid, 0);
    splitter.connect(this.surroundMid, 1);
    splitter.connect(this.surroundSide, 0);
    splitter.connect(this.surroundInvert, 1);
    this.surroundInvert.connect(this.surroundSide);

    this.surroundMid.connect(merger, 0, 0);
    this.surroundMid.connect(merger, 0, 1);
    this.surroundSide.connect(merger, 0, 0);
    const sideInvertR = ctx.createGain();
    sideInvertR.gain.value = -1;
    this.surroundSide.connect(sideInvertR);
    sideInvertR.connect(merger, 0, 1);

    this.compressorNode = ctx.createDynamicsCompressor();
    this.compressorNode.threshold.value = -24;
    this.compressorNode.knee.value = 30;
    this.compressorNode.ratio.value = 8;
    this.compressorNode.attack.value = 0.003;
    this.compressorNode.release.value = 0.25;
    this.compDry = ctx.createGain();
    this.compWet = ctx.createGain();
    this.compWet.gain.value = 0;
    this.compDry.gain.value = 1;
    this.balanceNode=ctx.createStereoPanner();this.balanceNode.pan.value=0;merger.connect(this.balanceNode);
    this.balanceNode.connect(this.compDry);
    this.balanceNode.connect(this.compressorNode);
    this.compressorNode.connect(this.compWet);
    this.compSum = ctx.createGain();
    this.compDry.connect(this.compSum);
    this.compWet.connect(this.compSum);

    this.reverbNode = ctx.createConvolver();
    // Allocate the convolution impulse only when reverb is first enabled.
    this.reverbDry = ctx.createGain();
    this.reverbWet = ctx.createGain();
    this.reverbWet.gain.value = 0;
    this.reverbDry.gain.value = 1;
    this.compSum.connect(this.reverbDry);
    this.compSum.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbWet);
    this.reverbSum = ctx.createGain();
    this.reverbDry.connect(this.reverbSum);
    this.reverbWet.connect(this.reverbSum);

    this.exciterNode = ctx.createWaveShaper();
    // Keep the disabled exciter unconfigured until first use.
    this.exciterDry = ctx.createGain();
    this.exciterWet = ctx.createGain();
    this.exciterWet.gain.value = 0;
    this.exciterDry.gain.value = 1;
    this.reverbSum.connect(this.exciterDry);
    this.reverbSum.connect(this.exciterNode);
    this.exciterNode.connect(this.exciterWet);
    this.exciterSum = ctx.createGain();
    this.exciterDry.connect(this.exciterSum);
    this.exciterWet.connect(this.exciterSum);

    this.masterBypassDry = ctx.createGain();
    this.masterBypassDry.gain.value = 0;
    this.masterBypassWet = ctx.createGain();
    this.masterBypassWet.gain.value = 1;
    this.mixSum.connect(this.masterBypassDry);
    this.exciterSum.connect(this.masterBypassWet);
    this.masterBypassSum = ctx.createGain();
    this.masterBypassDry.connect(this.masterBypassSum);
    this.masterBypassWet.connect(this.masterBypassSum);
    // One routing authority. The worklet is not registered in production yet.
    this.workletGain=ctx.createGain();this.workletGain.gain.value=0;
    this.workletGain.connect(this.masterBypassSum);
    this.dspRouteGate=new OpsisDspRouting.RouteGate(ctx,{web:this.masterBypassWet,dry:this.masterBypassDry,worklet:this.workletGain});
    this.workletNode=null;this.workletPreference=false;this.workletReady=false;this.workletEpoch=0;this.workletTimer=null;this.workletSent='';

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.state.volume;
    this.masterBypassSum.connect(this.masterGain);

    // Brick-wall-ish limiter at the very end of the chain, catching clipping
    // from any combination of EQ/boost/FX settings, regardless of source.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.05;
    this.masterGain.connect(this.limiter);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.limiter.connect(this.analyser);
    this.analyser.connect(ctx.destination);
  }

  _makeImpulseResponse(duration,decay,context=this.ctx) {
    const rate=context.sampleRate,impulse=context.createBuffer(2,Math.floor(rate*duration),rate);
    for(let ch=0;ch<2;ch++)impulse.copyToChannel(WaveframeAudio.impulseSamples(rate,duration,decay,ch),ch);
    return impulse;
  }

  _makeSaturationCurve() {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2) * 0.9 + x * 0.1;
    }
    return curve;
  }

  resume() {
    this.ensureGraph();
    // A previous suspend request may still be settling. Resume is queued after it.
    this.ctx.resume().catch(()=>{});
  }

  stopAlternateSources() {
    this.micEpoch=(this.micEpoch||0)+1;
    if(!this.ctx)return;
    this.micGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    this.toneGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    if (this.testOsc) {
      try { this.testOsc.stop(); } catch { /* already stopped */ }
      try{this.testOsc.disconnect();}catch{}
      this.testOsc = null;
    }
    if(this.micSource){try{this.micSource.disconnect();}catch{}}
    if (this.micStream) {
      this.micStream.getTracks().forEach((tr) => tr.stop());
      this.micStream = null;
      this.micSource = null;
    }
    window.dispatchEvent(new Event('waveframe:audio-activity'));
  }

  async startMic() {
    this.stopAlternateSources();
    this.pauseActive();
    const epoch=this.micEpoch;
    const stream=await navigator.mediaDevices.getUserMedia({ audio: true });
    if(epoch!==this.micEpoch){stream.getTracks().forEach(tr=>tr.stop());return false;}
    this.resume();
    this.micStream=stream;
    this.micSource = this.ctx.createMediaStreamSource(this.micStream);
    this.micSource.connect(this.micGain);
    this.micGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.05);
    window.dispatchEvent(new Event('waveframe:audio-activity'));
    return true;
  }

  playTestTone() {
    this.stopAlternateSources();
    this.pauseActive();
    this.resume();
    this.testOsc = this.ctx.createOscillator();
    this.testOsc.type = 'sine';
    this.testOsc.frequency.value = 440;
    this.testOsc.connect(this.toneGain);
    this.testOsc.start();
    this.toneGain.gain.setTargetAtTime(0.4, this.ctx.currentTime, 0.05);
    window.dispatchEvent(new Event('waveframe:audio-activity'));
  }

  get activeEl() { return this.slots[this.activeSlot].el; }

  play() {
    if(!this.activeEl.getAttribute('src'))return Promise.resolve();
    window.WaveframeVideoPlayer?.parkForAudio();
    this.resume();
    this.cancelCrossfade(true);
    this.stopAlternateSources();
    const slot = this.slots[this.activeSlot];
    slot.gain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.02);
    slot.el.playbackRate = this.state.tempo;
    slot.el.preservesPitch = this.state.preservePitch;
    return slot.el.play().catch((e) => { if (e && e.name !== 'AbortError') throw e; });
  }

  pauseActive() { this.cancelCrossfade(true);this.slots.forEach((s) => s.el.pause()); }

  togglePlay() {
    if (this.activeEl.paused) return this.play();
    this.pauseActive();
    return Promise.resolve();
  }

  seekTo(fraction) {
    const el = this.activeEl;
    if (el.duration) el.currentTime = fraction * el.duration;
  }

  setVolume(v) {
    this.state.volume = v;
    if (this.ctx&&!this.state.muted) this.masterGain.gain.setTargetAtTime(v * (this.sleepFactor ?? 1), this.ctx.currentTime, 0.02);
  }

  // Sleep timer fade-out: multiplies the user's volume without touching it (so cancelling the timer restores the exact level).
  setSleepFactor(f) {
    this.sleepFactor = f;
    if (this.ctx&&!this.state.muted) this.masterGain.gain.setTargetAtTime(this.state.volume * f, this.ctx.currentTime, 0.05);
  }

  setMasterEnable(on) {
    this.state.masterEnabled = !!on;
    this.applyLiveBypass();
  }

  setRouteBypass(on) {
    this.state.routeBypass=!!on;
    this.applyLiveBypass();
  }

  // Only a developer build can supply the fixed local WASM module.
  async enableExperimentalWorklet(bytes,compiled=null){
    this.ensureGraph();
    if(this.workletNode&&this.workletReady){this.workletPreference=true;this.applyLiveBypass();return true;}
    const epoch=++this.workletEpoch;
    let node=null;
    try{
      if(!(bytes instanceof Uint8Array)||bytes.length>4*1024*1024||this.ctx.sampleRate<44100||this.ctx.sampleRate>96000)throw Error('unsupported worklet');
      const module=compiled||await WebAssembly.compile(bytes);
      if(!this.workletModuleLoaded){await this.ctx.audioWorklet.addModule('dsp-dev/processor.mjs');this.workletModuleLoaded=true;}
      if(epoch!==this.workletEpoch)return false;
      const cfg=this.workletConfig();
      node=new AudioWorkletNode(this.ctx,'opsis-test-dsp',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{module,config:cfg}});
      this.workletNode=node;
      // Use normalized DRY source, never the processed Web Audio output.
      this.normGain.connect(node);node.connect(this.workletGain);
      await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(Error('worklet readiness timeout')),5000);
        const fail=()=>{clearTimeout(timeout);reject(Error('worklet failure'));if(this.workletNode===node)this.disableExperimentalWorklet(true);};
        node.onprocessorerror=fail;
        node.port.onmessage=({data})=>{
          if(data?.type==='ready'){clearTimeout(timeout);resolve();}
          else if(data?.type==='failed'||data?.type==='invalid-settings')fail();
        };
      });
      if(epoch!==this.workletEpoch||this.workletNode!==node)return false;
      this.workletReady=true;this.workletPreference=true;this.workletSent=JSON.stringify(cfg);
      this.syncWorkletSettings();this.applyLiveBypass();return true;
    }catch{
      if(epoch===this.workletEpoch)this.disableExperimentalWorklet(true);
      return false;
    }
  }

  workletConfig(){
    // Global master volume and output limiter remain common to every route.
    // Avoid a second dynamics limiter in the worklet; native sample clipping
    // protection is still intrinsic to the C++ core.
    return {...WaveframeAudio.nativeDspConfigV2(this.state,'native',false),limiter:0};
  }

  syncWorkletSettings(){
    if(!this.workletReady||!this.workletNode)return;
    clearTimeout(this.workletTimer);
    this.workletTimer=setTimeout(()=>{
      if(!this.workletReady||!this.workletNode)return;
      const cfg=this.workletConfig(),key=JSON.stringify(cfg);
      if(key===this.workletSent)return;
      try{this.workletNode.port.postMessage({type:'settings',config:cfg});this.workletSent=key;}
      catch{this.disableExperimentalWorklet(true);}
    },35);
  }

  disableExperimentalWorklet(failed=false){
    ++this.workletEpoch;clearTimeout(this.workletTimer);
    this.workletPreference=false;this.workletReady=false;
    const node=this.workletNode;this.workletNode=null;
    // On processor failure avoid fading from an already silent branch.
    this.applyLiveBypass(true);
    if(node){try{this.normGain.disconnect(node);node.disconnect();node.port.close();}catch{}}
    if(failed)window.dispatchEvent(new CustomEvent('waveframe:worklet-failed'));
  }

  applyLiveBypass(immediate=false) {
    if(this.dspRouteGate)this.dspRouteGate.select(OpsisDspRouting.selectRoute({masterEnabled:this.state.masterEnabled,externalBypass:this.state.routeBypass,preferWorklet:this.workletPreference,workletReady:this.workletReady}),immediate);
    this.syncWorkletSettings();
    window.dispatchEvent(new CustomEvent('waveframe:dsp-route-changed'));
  }

  setMuted(m) {
    this.state.muted = m;
    if(!this.ctx)return;
    this.masterGain.gain.setTargetAtTime(m ? 0 : this.state.volume * (this.sleepFactor ?? 1), this.ctx.currentTime, 0.02);
  }

  setTempo(rate) {
    this.state.tempo = rate;
    this.slots.forEach((s) => { s.el.playbackRate = rate; });
  }

  setPreservePitch(on) {
    this.state.preservePitch = on;
    this.slots.forEach((s) => { s.el.preservesPitch = on; });
  }

  cancelCrossfade(notify=false){
    ++this.transitionEpoch;
    clearTimeout(this.transitionTimer);this.transitionTimer=null;
    const pending=this.pendingTransition;this.pendingTransition=null;
    if(!this.ctx)return;
    const now=this.ctx.currentTime;
    this.slots.forEach((slot,i)=>{
      slot.gain.gain.cancelScheduledValues(now);
      slot.gain.gain.setValueAtTime(i===this.activeSlot?1:0,now);
      if(i!==this.activeSlot)slot.el.pause();
    });
    if(notify&&pending?.onReady)pending.onReady(this.slots[this.activeSlot],false);
  }

  switchTrack(loader, onReady) {
    this.ensureGraph();
    this.cancelCrossfade();
    const epoch=this.transitionEpoch,prevSlotIndex=this.activeSlot;
    const dur=Math.max(0,Math.min(30,Number(this.crossfadeSeconds)||0));
    const nextSlotIndex=dur>0&&!this.activeEl.paused?1-prevSlotIndex:prevSlotIndex;
    const nextSlot=this.slots[nextSlotIndex],prevSlot=this.slots[prevSlotIndex];
    const now=this.ctx.currentTime;
    loader(nextSlotIndex);
    nextSlot.gain.gain.setValueAtTime(nextSlotIndex===prevSlotIndex?1:0,now);
    this.resume();
    nextSlot.el.playbackRate=this.state.tempo;
    nextSlot.el.preservesPitch=this.state.preservePitch;
    if(nextSlotIndex===prevSlotIndex){
      this.pendingTransition={onReady};
      Promise.resolve(nextSlot.el.play()).then(()=>{
        if(epoch!==this.transitionEpoch)return;
        this.pendingTransition=null;
        if(onReady)onReady(nextSlot,true);
      },()=>{
        if(epoch!==this.transitionEpoch)return;
        this.pendingTransition=null;
        if(onReady)onReady(nextSlot,false);
      });
      return;
    }
    this.pendingTransition={onReady};
    // Never commit a rejected or superseded play promise.
    Promise.resolve(nextSlot.el.play()).then(()=>{
      if(epoch!==this.transitionEpoch)return;
      this.pendingTransition=null;
      const at=this.ctx.currentTime;
      nextSlot.gain.gain.cancelScheduledValues(at);
      nextSlot.gain.gain.setValueAtTime(0,at);
      nextSlot.gain.gain.linearRampToValueAtTime(1,at+dur);
      prevSlot.gain.gain.cancelScheduledValues(at);
      prevSlot.gain.gain.setValueAtTime(1,at);
      prevSlot.gain.gain.linearRampToValueAtTime(0,at+dur);
      this.activeSlot=nextSlotIndex;
      this.transitionTimer=setTimeout(()=>{
        if(epoch===this.transitionEpoch&&this.activeSlot!==prevSlotIndex){
          prevSlot.el.pause();this.transitionTimer=null;
        }
      },dur*1000+50);
      if(onReady)onReady(nextSlot,true);
    },()=>{
      if(epoch!==this.transitionEpoch)return;
      this.cancelCrossfade();
      if(onReady)onReady(prevSlot,false);
    });
  }

  setEqBand(index, db) {
    this.state.eqBands[index] = db;
    if(!this.ctx)return;
    this.eqNodes[index].gain.setTargetAtTime(db, this.ctx.currentTime, 0.02);
    this.syncWorkletSettings();
  }
  applyEqBands(bands) { bands.forEach((db, i) => this.setEqBand(i, db)); }

  setNormalizationEnabled(on) {
    this.state.normalizationEnabled = on;
  }
  setNormalizationGain(linearGain) {
    this.normalizationGain=linearGain;
    if(!this.ctx)return;
    const target = this.state.normalizationEnabled ? linearGain : 1;
    this.normGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.15);
  }
  setPresence(value) {
    const n=Math.max(0,Math.min(100,Number(value)||0));
    this.state.presence=n;
    if(!this.ctx){window.dispatchEvent(new CustomEvent('waveframe:dsp-route-changed'));return;}
    this.presenceNode.gain.setTargetAtTime(WaveframeAudio.presenceParams(n).gain,this.ctx.currentTime,.03);
    this.syncWorkletSettings();
    window.dispatchEvent(new CustomEvent('waveframe:dsp-route-changed'));
  }
  setBalance(value) {
    const n=Math.max(-100,Math.min(100,Number(value)||0));
    this.state.balance=n;
    if(!this.ctx){window.dispatchEvent(new CustomEvent('waveframe:dsp-route-changed'));return;}
    this.balanceNode.pan.setTargetAtTime(WaveframeAudio.balanceValue(n),this.ctx.currentTime,.03);
    this.syncWorkletSettings();
    window.dispatchEvent(new CustomEvent('waveframe:dsp-route-changed'));
  }
  setBassBoost(db) {
    this.state.bassBoost = db;
    if(!this.ctx)return;
    this.bassBoostNode.gain.setTargetAtTime(db, this.ctx.currentTime, 0.02);
    this.syncWorkletSettings();
  }
  setVolumeBoostDb(db) {
    this.state.volumeBoost = db;
    if(!this.ctx)return;
    this.volumeBoostNode.gain.setTargetAtTime(Math.pow(10, db / 20), this.ctx.currentTime, 0.02);
    this.syncWorkletSettings();
  }
  setSurround(pct) {
    this.state.surround = pct;
    if(!this.ctx)return;
    const w = 1 + (Math.max(0,Math.min(100,Number(pct)||0)) / 100) * 0.6;
    this.surroundSide.gain.setTargetAtTime(0.5 * w, this.ctx.currentTime, 0.02);
    this.syncWorkletSettings();
  }
  setCompressorMode(mode){
    this.state.compressorMode=['gentle','standard','night'].includes(mode)?mode:'standard';
    if(!this.ctx)return;
    const p=WaveframeAudio.compressorParams(this.state.compressorMode),tt=this.ctx.currentTime;
    for(const k of Object.keys(p))this.compressorNode[k].setTargetAtTime(p[k],tt,.03);
    this.syncWorkletSettings();
  }
  setCompressor(on) {
    this.state.compressor = on;
    if(!this.ctx)return;
    const tt = this.ctx.currentTime;
    this.compWet.gain.setTargetAtTime(on ? 1 : 0, tt, 0.05);
    this.compDry.gain.setTargetAtTime(on ? 0 : 1, tt, 0.05);
    this.syncWorkletSettings();
  }
  setEffectAmount(kind,value){
    if(!['reverb','exciter'].includes(kind))return;
    this.state[kind+'Amount']=Math.max(0,Math.min(100,Number.isFinite(Number(value))?Number(value):100));
    if(kind==='reverb')this.setReverb(this.state.reverb);else this.setExciter(this.state.exciter);
  }
  setReverb(on) {
    this.state.reverb=on;
    if(!this.ctx)return;
    if(on&&!this.reverbNode.buffer)this.reverbNode.buffer=this._makeImpulseResponse(2.2,2.0);
    const tt = this.ctx.currentTime;
    this.reverbWet.gain.setTargetAtTime(on ? WaveframeAudio.effectMix(this.state.reverbAmount,.28) : 0, tt, 0.05);
    this.reverbDry.gain.setTargetAtTime(1, tt, 0.05);
    this.syncWorkletSettings();
  }
  setExciter(on) {
    this.state.exciter=on;
    if(!this.ctx)return;
    if(on&&!this.exciterNode.curve){this.exciterNode.curve=this._makeSaturationCurve();this.exciterNode.oversample='4x';}
    const tt = this.ctx.currentTime;
    this.exciterWet.gain.setTargetAtTime(on ? WaveframeAudio.effectMix(this.state.exciterAmount,.35) : 0, tt, 0.05);
    this.exciterDry.gain.setTargetAtTime(1, tt, 0.05);
    this.syncWorkletSettings();
  }
  resetEffects() {
    this.setBassBoost(0);this.setPresence(0);this.setBalance(0);
    this.setVolumeBoostDb(0);
    this.setSurround(0);
    this.setCompressor(false);this.setCompressorMode('standard');
    this.setReverb(false);this.setEffectAmount('reverb',100);
    this.setExciter(false);this.setEffectAmount('exciter',100);
  }

  // opts.tempo / opts.rate override the live tempo and the buffer's rate (the converter renders at tempo 1 and at the chosen sample rate).
  async renderOffline(buffer, opts = {}) {
    const rate = opts.rate || buffer.sampleRate;
    const tempo = opts.tempo || this.state.tempo;
    const frames = Math.ceil(buffer.duration / tempo * rate) + rate;
    if (!Number.isSafeInteger(frames) || frames < 1 || frames * 8 > 600 * 1024 * 1024) throw new Error('offline-render-too-large');
    const offline = new OfflineAudioContext(2, frames, rate);

    const src = offline.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = tempo;

    if (!this.state.masterEnabled) {
      src.connect(offline.destination);
      src.start();
      return offline.startRendering();
    }

    const eqNodes = EQ_FREQS.map((freq, i) => {
      const f = offline.createBiquadFilter();
      if (i === 0) f.type = 'lowshelf'; else if (i === EQ_FREQS.length - 1) f.type = 'highshelf'; else f.type = 'peaking';
      f.frequency.value = freq;
      f.Q.value = 1.4;
      f.gain.value = this.state.eqBands[i];
      return f;
    });
    for (let i = 0; i < eqNodes.length - 1; i++) eqNodes[i].connect(eqNodes[i + 1]);

    const bassBoost = offline.createBiquadFilter();
    bassBoost.type = 'lowshelf';
    bassBoost.frequency.value = 90;
    bassBoost.gain.value = this.state.bassBoost;

    const volBoost = offline.createGain();
    volBoost.gain.value = Math.pow(10, this.state.volumeBoost / 20);

    let chainEnd = volBoost;
    src.connect(eqNodes[0]);
    eqNodes[eqNodes.length - 1].connect(bassBoost);
    const presence=offline.createBiquadFilter(), pp=WaveframeAudio.presenceParams(this.state.presence);presence.type='peaking';presence.frequency.value=pp.frequency;presence.Q.value=pp.q;presence.gain.value=pp.gain;
    bassBoost.connect(presence);presence.connect(volBoost);

    if (this.state.surround > 0) {
      const stereo = offline.createGain(); stereo.channelCount = 2; stereo.channelCountMode = 'explicit'; stereo.channelInterpretation = 'speakers';
      const split = offline.createChannelSplitter(2), merge = offline.createChannelMerger(2);
      const mid = offline.createGain(), side = offline.createGain(), invert = offline.createGain(), invertR = offline.createGain();
      mid.gain.value=.5; side.gain.value=.5*(1+Math.max(0,Math.min(100,this.state.surround))/100*.6); invert.gain.value=-1; invertR.gain.value=-1;
      chainEnd.connect(stereo); stereo.connect(split); split.connect(mid,0); split.connect(mid,1); split.connect(side,0); split.connect(invert,1); invert.connect(side);
      mid.connect(merge,0,0); mid.connect(merge,0,1); side.connect(merge,0,0); side.connect(invertR); invertR.connect(merge,0,1); chainEnd=merge;
    }
    if(this.state.balance){const balance=offline.createStereoPanner();balance.pan.value=WaveframeAudio.balanceValue(this.state.balance);chainEnd.connect(balance);chainEnd=balance;}
    if (this.state.compressor) {
      const comp = offline.createDynamicsCompressor();
      const cp=WaveframeAudio.compressorParams(this.state.compressorMode);for(const k of Object.keys(cp))comp[k].value=cp[k];
      chainEnd.connect(comp);
      chainEnd = comp;
    }
    if (this.state.reverb) {
      const conv = offline.createConvolver();
      conv.buffer = this._makeImpulseResponse(2.2, 2.0,offline);
      const dry = offline.createGain(); dry.gain.value = 1;
      const wet = offline.createGain(); wet.gain.value = WaveframeAudio.effectMix(this.state.reverbAmount,.28);
      const sum = offline.createGain();
      chainEnd.connect(dry); dry.connect(sum);
      chainEnd.connect(conv); conv.connect(wet); wet.connect(sum);
      chainEnd = sum;
    }
    if (this.state.exciter) {
      const shaper = offline.createWaveShaper();
      shaper.curve = this._makeSaturationCurve();
      shaper.oversample = '4x';
      const dry = offline.createGain(); dry.gain.value = 1;
      const wet = offline.createGain(); wet.gain.value = WaveframeAudio.effectMix(this.state.exciterAmount,.35);
      const sum = offline.createGain();
      chainEnd.connect(dry); dry.connect(sum);
      chainEnd.connect(shaper); shaper.connect(wet); wet.connect(sum);
      chainEnd = sum;
    }

    const limiter = offline.createDynamicsCompressor();
    limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.001; limiter.release.value = 0.05;
    chainEnd.connect(limiter);
    limiter.connect(offline.destination);
    src.start();
    return offline.startRendering();
  }
}

/* ------------------------------------------------------------------ */
/* WAV encoder (used as the lossless intermediate for every export)   */
/* ------------------------------------------------------------------ */

function encodeWavBuffer(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels = [];
  for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* UI wiring                                                           */
/* ------------------------------------------------------------------ */

const engine = new AudioEngine();

/* ---- generic modal (replaces window.prompt/alert, unsupported in Electron) ---- */
const inputModalOverlay = document.getElementById('inputModalOverlay');
const inputModalTitle = document.getElementById('inputModalTitle');
const inputModalMessage = document.getElementById('inputModalMessage');
const inputModalField = document.getElementById('inputModalField');
const inputModalCancel = document.getElementById('inputModalCancel');
const inputModalOk = document.getElementById('inputModalOk');
let modalResolver = null;

function closeModal(value) {
  inputModalOverlay.classList.remove('open');
  if (modalResolver) { modalResolver(value); modalResolver = null; }
}
inputModalOk.addEventListener('click', () => closeModal(inputModalField.style.display === 'none' ? true : inputModalField.value));
inputModalCancel.addEventListener('click', () => closeModal(null));
inputModalField.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') closeModal(inputModalField.value);
  else if (e.key === 'Escape') closeModal(null);
});

function showInputDialog(title, initial = '') {
  if(modalResolver)return Promise.resolve(null);
  inputModalTitle.textContent = title;
  inputModalMessage.style.display = 'none';
  inputModalField.style.display = 'block';
  inputModalField.value = initial;
  inputModalCancel.style.display = 'inline-block';
  inputModalOverlay.classList.add('open');
  setTimeout(() => inputModalField.focus(), 50);
  return new Promise((resolve) => { modalResolver = resolve; });
}

function showConfirmDialog(title,message){
  if(modalResolver)return Promise.resolve(false);
  inputModalTitle.textContent=title;inputModalMessage.textContent=message;
  inputModalMessage.style.display='block';inputModalField.style.display='none';
  inputModalCancel.style.display='inline-block';inputModalOverlay.classList.add('open');
  inputModalCancel.focus();
  return new Promise(resolve=>{modalResolver=value=>resolve(value===true);});
}
function showAlertDialog(title, message) {
  if(modalResolver)return Promise.resolve();
  inputModalTitle.textContent = title;
  inputModalMessage.textContent = message;
  inputModalMessage.style.display = 'block';
  inputModalField.style.display = 'none';
  inputModalCancel.style.display = 'none';
  inputModalOverlay.classList.add('open');
  return new Promise((resolve) => { modalResolver = () => resolve(); });
}

const els = {
  trackName: document.getElementById('trackName'),
  trackSub: document.getElementById('trackSub'),
  albumArt: document.getElementById('albumArt'),
  albumArtImg: document.getElementById('albumArtImg'),
  seek: document.getElementById('seek'),
  timeLabel: document.getElementById('timeLabel'),
  btnPlay: document.getElementById('btnPlay'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  btnShuffle: document.getElementById('btnShuffle'),
  btnRepeat: document.getElementById('btnRepeat'),
  btnMute: document.getElementById('btnMute'),
  volume: document.getElementById('volume'),
  fileInput: document.getElementById('fileInput'),
  btnUrl: document.getElementById('btnUrl'),
  btnMic: document.getElementById('btnMic'),
  btnTestTone: document.getElementById('btnTestTone'),
  btnTogglePlaylist: document.getElementById('btnTogglePlaylist'),
  playlistDrawer: document.getElementById('playlistDrawer'),
  presetGrid: document.getElementById('presetGrid'),
  userPresetList: document.getElementById('userPresetList'),
  btnSavePreset: document.getElementById('btnSavePreset'),
  crossfade: document.getElementById('crossfade'),
  playlist: document.getElementById('playlist'),
  playlistEmptyHint: document.getElementById('playlistEmptyHint'),
  eqRack: document.getElementById('eqRack'),
  bassBoost: document.getElementById('bassBoost'),
  bassBoostVal: document.getElementById('bassBoostVal'),
  knobBassBoost: document.getElementById('knobBassBoost'),
  surround: document.getElementById('surround'),
  surroundVal: document.getElementById('surroundVal'),
  knobSurround: document.getElementById('knobSurround'),
  volBoost: document.getElementById('volBoost'),
  volBoostVal: document.getElementById('volBoostVal'),
  knobVolBoost: document.getElementById('knobVolBoost'),
  btnResetFx: document.getElementById('btnResetFx'),
  swMasterEnable: document.getElementById('swMasterEnable'),
  miniMeter: document.getElementById('miniMeter'),
  swCompressor: document.getElementById('swCompressor'),
  swReverb: document.getElementById('swReverb'),
  swExciter: document.getElementById('swExciter'),
  tempo: document.getElementById('tempo'),
  tempoVal: document.getElementById('tempoVal'),
  swPreservePitch: document.getElementById('swPreservePitch'),
  formatGrid: document.getElementById('formatGrid'),
  qualityGrid: document.getElementById('qualityGrid'),
  btnExport: document.getElementById('btnExport'),
  exportTrackList: document.getElementById('exportTrackList'),
  exportStatus: document.getElementById('exportStatus'),
  destPath: document.getElementById('destPath'),
  btnChooseFolder: document.getElementById('btnChooseFolder'),
  progressTrack: document.getElementById('progressTrack'),
  progressFill: document.getElementById('progressFill'),
  visualizer: document.getElementById('visualizer'),
  skinGrid: document.getElementById('skinGrid'),
  bgGrid: document.getElementById('bgGrid'),
  btnShowTutorial: document.getElementById('btnShowTutorial'),
  btnOpenHelp: document.getElementById('btnOpenHelp'),
  btnBackupExport: document.getElementById('btnBackupExport'),
  btnBackupImport: document.getElementById('btnBackupImport'),
  backupStatus: document.getElementById('backupStatus'),
};

let playlist = [];
let currentTrackIndex = -1;
let selectedForExport = new Set();
let exportSelectionInitialized = false;
let shuffleOn = false;
let repeatOn = false;
let selectedFormat = 'wav';
let selectedQuality = 'medium';
let activePresetKey = 'flat';
let availableFormats = {};

/* ---- window chrome ---- */
document.getElementById('btnMinimize').addEventListener('click', () => window.waveframe.minimize());
document.getElementById('btnCloseWin').addEventListener('click', () => window.waveframe.close());
const btnMaximize = document.getElementById('btnMaximize');
btnMaximize.addEventListener('click', () => window.waveframe.maximizeToggle());
window.waveframe?.onMaximizedState?.((isMaximized) => {
  btnMaximize.innerHTML = isMaximized ? '&#10064;' : '&#9633;';
  btnMaximize.title = isMaximized ? 'Επαναφορά' : 'Μεγιστοποίηση';
});
document.getElementById('brandVersion').textContent = `v${window.waveframe.version}`;
document.getElementById('aboutVersion').textContent = `v${window.waveframe.version}`;

/* ---- Mini/compact always-on-top mode ---- */
function syncMiniBar() {
  const item = playlist[currentTrackIndex];
  const nameEl = document.getElementById('miniBarName');
  const artEl = document.getElementById('miniBarArt');
  const artImg = document.getElementById('miniBarArtImg');
  if (!nameEl) return;
  nameEl.textContent = (item && item.name) || t('player.noTrack');
  if (item && item.picture) { artImg.src = item.picture; artEl.classList.add('has-art'); }
  else { artImg.removeAttribute('src'); artEl.classList.remove('has-art'); }
}
// In mini mode the live visualization replaces the animated page background: the SAME canvas is moved into the mini bar
// (so there is only ever one drawing loop) and the page background is switched off while it is compact.
function enterMiniMode() {
  document.body.classList.add('mini-mode');
  window.waveframe.setMiniMode(true);
  document.getElementById('miniVis').appendChild(canvas);
  Backgrounds.setMode('none');
  syncMiniBar();
  requestAnimationFrame(resizeCanvas);
}
function leaveMiniMode() {
  document.body.classList.remove('mini-mode');
  window.waveframe.setMiniMode(false);
  visualizerWrap.prepend(canvas);
  Backgrounds.setMode(localStorage.getItem('waveframe.bg') || 'equalizer');
  requestAnimationFrame(resizeCanvas);
}
document.getElementById('btnMiniMode').addEventListener('click', enterMiniMode);
document.getElementById('miniBarExpand').addEventListener('click', leaveMiniMode);
// next visualization (skips the album-art-only entry); the choice is shared with the Player tab
document.getElementById('miniBarVis').addEventListener('click', () => {
  const modes = VIS_MODES.filter((m) => m.key !== 'none');
  const i = modes.findIndex((m) => m.key === visMode);
  const next = modes[(i + 1) % modes.length];
  visMode = next.key;
  window.dispatchEvent(new Event('waveframe:visual-changed'));
  OpsisFeatureGuide.setIfChanged(localStorage,'waveframe.visMode', visMode);
  [...visPickerGrid.children].forEach((c) => c.classList.toggle('active', c.dataset.mode === visMode));
  visualizerWrap.classList.toggle('mode-none', false);
  document.getElementById('miniBarVis').title = next.label;
});
document.getElementById('miniBarPlay').addEventListener('click', async () => {
  if (currentTrackIndex === -1 && playlist.length > 0) { playTrackAt(0); return; }
  await engine.togglePlay();
  syncPlayButton();
});
document.getElementById('miniBarPrev').addEventListener('click', goPrev);
document.getElementById('miniBarNext').addEventListener('click', goNext);
els.btnOpenHelp.addEventListener('click', () => window.waveframe.openHelp());

/* ---- tabs ---- */
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('active', p.id === `tab-${btn.dataset.tab}`));
    if (btn.dataset.tab === 'player') resizeCanvas();
    if (btn.dataset.tab === 'converter') loadConverter();
    if (btn.dataset.tab === 'video') loadVideoPlayer();
    if (btn.dataset.tab === 'photo') loadPhoto();
    if (btn.dataset.tab === 'settings') void refreshDepsStatus();
    window.dispatchEvent(new CustomEvent('waveframe:tab-selected',{detail:btn.dataset.tab}));
  });
});

/* Video player and photo editor are fetched the first time they are needed. */
const lazyScripts = {};
function loadScripts(key, files) {
  if (lazyScripts[key]) return lazyScripts[key];
  const load = (src) => new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = rej; document.head.appendChild(el); });
  lazyScripts[key] = files.reduce((p, f) => p.then(() => load(f)), Promise.resolve()).catch((e) => { delete lazyScripts[key]; throw e; });
  return lazyScripts[key];
}
function loadVideoPlayer() { return loadScripts('video', ['../playback-core.js', 'vplib.js', 'videoplayer.js']); }
function loadPhoto() { return loadScripts('photo', ['photolib.js', 'photo.js']); }
function showTab(name) { const b = document.querySelector(`.tab-btn[data-tab="${name}"]`); if (b) b.click(); }
function initFeatureGuide(){
 const input=document.getElementById('featureGuideQuery'), results=document.getElementById('featureGuideResults'),status=document.getElementById('featureGuideStatus');
 const lang=()=>localStorage.getItem('waveframe.lang')||'el';
 const gr=()=>lang()==='el';
 const group=document.getElementById('featureGuideGroup'),quick=document.getElementById('featureGuideQuick');
 const dictionary=()=>I18N[lang()]||I18N.en||{};
 let navGeneration=0;
 function renderGroups(){const chosen=group.value;group.replaceChildren();for(const [key,label] of [['',OpsisFeatureGuide.ui(lang()).all],...Object.entries(OpsisFeatureGuide.tabs).map(([k,v])=>[k,dictionary()['tab.'+k]||v[gr()?0:1]])]){const opt=document.createElement('option');opt.value=key;opt.textContent=label;group.append(opt);}group.value=chosen;}
 async function navigate(row){
  const generation=++navGeneration;
  showTab(row.tab);
  try{if(row.tab==='converter')await loadConverter();if(row.tab==='video')await loadVideoPlayer();if(row.tab==='photo')await loadPhoto();}
  catch{if(generation===navGeneration&&document.querySelector('.tab-btn.active')?.dataset.tab===row.tab){showTab('settings');status.textContent=OpsisFeatureGuide.ui(lang()).loadFailed;}return;}
  if(generation!==navGeneration||document.querySelector('.tab-btn.active')?.dataset.tab!==row.tab)return;
  if(row.tab==='player'&&(row.target?.startsWith('metadata')||row.target==='crossfade'))document.getElementById('playlistDrawer').classList.add('open');
  const target=row.target&&document.getElementById(row.target);
  if(row.tab==='video'&&target?.closest('#vpSubOnline'))document.getElementById('vpSubOnline').hidden=false;
  if(target)for(let p=target.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
  const visible=target&&target.getClientRects().length&&!target.closest('[hidden],.dep-hidden');
  const dest=visible?target:document.querySelector('.tab-btn[data-tab="'+row.tab+'"]');
  dest?.scrollIntoView({block:'nearest'});dest?.focus({preventScroll:true});
  if(visible){target.classList.add('feature-guide-highlight');setTimeout(()=>target.classList.remove('feature-guide-highlight'),1800);}
  else if(row.target)await showAlertDialog(OpsisFeatureGuide.ui(lang()).availability,row.description);
 }
 function render(){
  const labels=OpsisFeatureGuide.ui(lang());document.getElementById('featureGuideTitle').textContent=labels.title;
  document.getElementById('featureGuideHint').textContent=labels.hint;
  input.placeholder=labels.placeholder;
  const clear=document.getElementById('featureGuideClear');clear.title=labels.clear;clear.setAttribute('aria-label',labels.clear);clear.disabled=!input.value;
  document.getElementById('featureGuideQuickLabel').textContent=labels.find;
  document.getElementById('featureGuideGroupLabel').textContent=labels.tab;
  quick.title=labels.title;quick.setAttribute('aria-label',quick.title);
  const rows=OpsisFeatureGuide.list(lang(),input.value,dictionary()).filter(r=>!group.value||r.tab===group.value);results.replaceChildren();
  for(const row of rows){const btn=document.createElement('button');btn.type='button';btn.className='small-btn feature-guide-result';const name=document.createElement('strong');name.textContent=row.title;name.lang=row.descriptionLang;const category=document.createElement('span');category.className='feature-guide-category';category.textContent=row.category;btn.append(category,name);if(row.controlLabel&&row.controlLabel!==row.title){const alias=document.createElement('span');alias.textContent=row.controlLabel;btn.append(alias);}const d=document.createElement('span');d.textContent=row.description;d.lang=row.descriptionLang;btn.append(d);btn.addEventListener('click',()=>navigate(row));results.append(btn);}
  status.textContent=rows.length?labels.results+': '+rows.length:labels.empty;
 }
 document.getElementById('featureGuideClear').addEventListener('click',()=>{input.value='';render();input.focus();});
 input.addEventListener('input',render);group.addEventListener('change',render);document.addEventListener('waveframe:language-changed',()=>{renderGroups();render();});renderGroups();render();
 // The same clearly labelled entry point works from every tab, without intercepting right-click.
 quick.addEventListener('click',()=>{const active=document.querySelector('.tab-btn.active')?.dataset.tab;showTab('settings');group.value=active==='settings'?'':active||'';input.value='';render();input.focus();});
}
initFeatureGuide();
document.getElementById('fileInputLabel').addEventListener('keydown',e=>{if(e.target.id==='fileInputLabel'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();document.getElementById('fileInput').click();}});
// "Open with" a video file (installer option / command line) or a video dropped on the window: show the video tab and play it
window.waveframe.onOpenVideo((filePath) => { showTab('video'); loadVideoPlayer().then(() => window.WaveframeVideoPlayer.open(filePath)); });
// only one thing plays at a time
window.addEventListener('waveframe:video-playing', () => { try { engine.pauseActive();engine.stopAlternateSources();syncPlayButton(); } catch (_) { /* nothing playing */ } });

/* The converter (UI + helpers) is only fetched and run the first time its tab is opened. */
let converterLoading = null;
function loadConverter() {
  if (converterLoading) return converterLoading;
  const load = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  converterLoading = load('convlib.js').then(() => load('vidlib.js')).then(() => load('converter.js')).then(() => load('video.js')).catch((e) => { converterLoading = null; throw e; });
  return converterLoading;
}

els.btnTogglePlaylist.addEventListener('click', () => {
  els.playlistDrawer.classList.toggle('open');
});

/* ---- resizable playlist ---- */
const playlistResizeHandle = document.getElementById('playlistResizeHandle');
let playlistDragStartY = null, playlistDragStartH = null;
let pendingPlaylistHeight=null;
function setPlaylistHeight(px) {
  const clamped = Math.round(Math.max(120, Math.min(500, px)));
  if(clamped===pendingPlaylistHeight)return;
  pendingPlaylistHeight=clamped;
  els.playlist.style.setProperty('--playlist-h', `${clamped}px`);
}
function commitPlaylistHeight(){
  if(pendingPlaylistHeight===null)return;
  try{const value=String(pendingPlaylistHeight);if(localStorage.getItem('waveframe.playlistHeight')!==value)localStorage.setItem('waveframe.playlistHeight',value);}catch{}
  pendingPlaylistHeight=null;
}
playlistResizeHandle.addEventListener('mousedown', (e) => {
  playlistDragStartY = e.clientY;
  playlistDragStartH = els.playlist.getBoundingClientRect().height;
  e.preventDefault();
});
window.addEventListener('mousemove', (e) => {
  if (playlistDragStartY === null) return;
  setPlaylistHeight(playlistDragStartH + (e.clientY - playlistDragStartY));
});
function finishPlaylistResize(){playlistDragStartY=null;commitPlaylistHeight();}
window.addEventListener('mouseup',finishPlaylistResize);
window.addEventListener('blur',finishPlaylistResize);
window.addEventListener('beforeunload',finishPlaylistResize);
const savedPlaylistH = localStorage.getItem('waveframe.playlistHeight');
if (savedPlaylistH) els.playlist.style.setProperty('--playlist-h', `${savedPlaylistH}px`);

/* ---- EQ rack ---- */
EQ_FREQS.forEach((freq, i) => {
  const wrap = document.createElement('div');
  wrap.className = 'eq-band';
  const val = document.createElement('span');
  val.className = 'band-val';
  val.textContent = '0';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '-12'; input.max = '12'; input.step = '0.5'; input.value = '0';
  input.addEventListener('input', () => {
    const db = parseFloat(input.value);
    engine.setEqBand(i, db);
    val.textContent = db.toFixed(1);
    activePresetKey = null;
    highlightActivePreset();
  });
  const label = document.createElement('span');
  label.className = 'band-freq';
  label.textContent = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
  wrap.appendChild(val); wrap.appendChild(input); wrap.appendChild(label);
  els.eqRack.appendChild(wrap);
  wrap._input = input; wrap._val = val;
});

/* ---- EQ curve (parametric-style draggable view) ---- */
const eqCurveCanvas = document.getElementById('eqCurveCanvas');
const eqCtx = eqCurveCanvas.getContext('2d');
const eqViewSeg = document.getElementById('eqViewSeg');

function resizeEqCurve() {
  const rect = eqCurveCanvas.getBoundingClientRect();
  if (rect.width === 0) return;
  eqCurveCanvas.width = rect.width * devicePixelRatio;
  eqCurveCanvas.height = rect.height * devicePixelRatio;
  drawEqCurve();
}
setTimeout(resizeEqCurve, 0);
window.addEventListener('resize', resizeEqCurve);

function eqBandX(i, w) { return (i / (EQ_FREQS.length - 1)) * w; }
function eqDbToY(db, h) { return h / 2 - (db / 12) * (h / 2 - 12 * devicePixelRatio); }
function eqYToDb(y, h) {
  const db = ((h / 2 - y) / (h / 2 - 12 * devicePixelRatio)) * 12;
  return Math.max(-12, Math.min(12, db));
}
function drawEqCurve() {
  const w = eqCurveCanvas.width, h = eqCurveCanvas.height;
  if (!w || !h) return;
  eqCtx.clearRect(0, 0, w, h);
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim() || '#7c6cf0';
  eqCtx.strokeStyle = 'rgba(148,148,171,0.25)';
  eqCtx.lineWidth = 1;
  eqCtx.beginPath(); eqCtx.moveTo(0, h / 2); eqCtx.lineTo(w, h / 2); eqCtx.stroke();

  const points = engine.state.eqBands.map((db, i) => ({ x: eqBandX(i, w), y: eqDbToY(db, h) }));
  eqCtx.strokeStyle = accent;
  eqCtx.lineWidth = 2.5 * devicePixelRatio;
  eqCtx.beginPath();
  eqCtx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1], p1 = points[i];
    eqCtx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
  }
  eqCtx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  eqCtx.stroke();

  eqCtx.fillStyle = accent;
  points.forEach((p) => {
    eqCtx.beginPath();
    eqCtx.arc(p.x, p.y, 4 * devicePixelRatio, 0, Math.PI * 2);
    eqCtx.fill();
  });
}

let draggingEqBand = null;
function eqPointFromEvent(e) {
  const rect = eqCurveCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * devicePixelRatio,
    y: (e.clientY - rect.top) * devicePixelRatio,
  };
}
function nearestEqBand(x, w) {
  let best = 0, bestDist = Infinity;
  EQ_FREQS.forEach((_, i) => {
    const d = Math.abs(eqBandX(i, w) - x);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return best;
}
function updateEqBandFromCurve(index, y) {
  const db = eqYToDb(y, eqCurveCanvas.height);
  engine.setEqBand(index, db);
  const band = els.eqRack.children[index];
  band._input.value = db;
  band._val.textContent = db.toFixed(1);
  activePresetKey = null;
  highlightActivePreset();
  drawEqCurve();
}
eqCurveCanvas.addEventListener('mousedown', (e) => {
  const { x, y } = eqPointFromEvent(e);
  draggingEqBand = nearestEqBand(x, eqCurveCanvas.width);
  updateEqBandFromCurve(draggingEqBand, y);
});
window.addEventListener('mousemove', (e) => {
  if (draggingEqBand === null) return;
  updateEqBandFromCurve(draggingEqBand, eqPointFromEvent(e).y);
});
window.addEventListener('mouseup', () => { draggingEqBand = null; });

eqViewSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-eq-view]');
  if (!btn) return;
  const view = btn.dataset.eqView;
  [...eqViewSeg.children].forEach((b) => b.classList.toggle('active', b === btn));
  els.eqRack.classList.toggle('dep-hidden', view === 'curve');
  eqCurveCanvas.classList.toggle('dep-hidden', view !== 'curve');
  if (view === 'curve') { resizeEqCurve(); drawEqCurve(); }
});

function setEqUi(bands) {
  bands.forEach((db, i) => {
    const band = els.eqRack.children[i];
    band._input.value = db;
    band._val.textContent = db.toFixed(1);
  });
}

/* ---- presets ---- */
function renderPresetGrid() {
  els.presetGrid.innerHTML = '';
  PRESETS.forEach((preset) => {
    const card = document.createElement('button');
    card.className = 'preset-card';
    card.innerHTML = `<h3><span class="preset-icon">${preset.icon}</span>${t(`preset.${preset.key}.name`)}</h3><p>${t(`preset.${preset.key}.desc`)}</p>`;
    card.addEventListener('click', () => {
      engine.applyEqBands(preset.bands);
      setEqUi(preset.bands);
      activePresetKey = preset.key;
      highlightActivePreset();
    });
    card._key = preset.key;
    els.presetGrid.appendChild(card);
  });
  highlightActivePreset();
}
function highlightActivePreset() {
  [...els.presetGrid.children].forEach((c) => c.classList.toggle('active', c._key === activePresetKey));
}

/* ---- user presets ---- */
function loadUserPresets() {
  try { return JSON.parse(localStorage.getItem(USER_PRESET_KEY)) || []; } catch { return []; }
}
function saveUserPresets(list) { localStorage.setItem(USER_PRESET_KEY, JSON.stringify(list)); }
function renderUserPresets() {
  const list = loadUserPresets();
  els.userPresetList.innerHTML = '';
  if (list.length === 0) {
    els.userPresetList.innerHTML = `<p class="empty-hint">${t('enhance.noUserPresets')}</p>`;
    return;
  }
  list.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'user-preset-item';
    const nameEl = document.createElement('span'); nameEl.textContent = p.name; // preset names are user/backup data: never markup
    row.appendChild(nameEl);
    const applyBtn = document.createElement('button');
    applyBtn.textContent = '▶';
    applyBtn.addEventListener('click', () => applyUserPreset(p));
    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      const l = loadUserPresets();
      l.splice(idx, 1);
      saveUserPresets(l);
      renderUserPresets();
    });
    row.appendChild(applyBtn);
    row.appendChild(delBtn);
    els.userPresetList.appendChild(row);
  });
}

function applyUserPreset(p) {
  engine.applyEqBands(p.bands);
  setEqUi(p.bands);
  engine.setPresence(p.presence??0);engine.setBalance(p.balance??0);engine.setCompressorMode(p.compressorMode);engine.setEffectAmount('reverb',p.reverbAmount??100);engine.setEffectAmount('exciter',p.exciterAmount??100);syncProfessionalFx();
  if (typeof p.bassBoost === 'number') {
    engine.setBassBoost(p.bassBoost);
    els.bassBoost.value = String(p.bassBoost);
    els.bassBoostVal.textContent = `${p.bassBoost.toFixed(1)} dB`;
    setKnobPct(els.knobBassBoost, p.bassBoost / 12);
  }
  if (typeof p.volumeBoost === 'number') {
    engine.setVolumeBoostDb(p.volumeBoost);
    els.volBoost.value = String(p.volumeBoost);
    els.volBoostVal.textContent = `${p.volumeBoost.toFixed(1)} dB`;
    setKnobPct(els.knobVolBoost, p.volumeBoost / 12);
  }
  if (typeof p.surround === 'number') {
    engine.setSurround(p.surround);
    els.surround.value = String(p.surround);
    els.surroundVal.textContent = `${Math.round(p.surround)}%`;
    setKnobPct(els.knobSurround, p.surround / 100);
  }
  if (typeof p.compressor === 'boolean') setSwitchState(els.swCompressor, p.compressor, (on) => engine.setCompressor(on));
  if (typeof p.reverb === 'boolean') setSwitchState(els.swReverb, p.reverb, (on) => engine.setReverb(on));
  if (typeof p.exciter === 'boolean') setSwitchState(els.swExciter, p.exciter, (on) => engine.setExciter(on));
  activePresetKey = null;
  highlightActivePreset();
}

els.btnSavePreset.addEventListener('click', async () => {
  const name = await showInputDialog(t('enhance.presetNamePromptTitle'));
  if (!name) return;
  const list = loadUserPresets();
  list.push({
    name,
    bands: [...engine.state.eqBands],
    bassBoost: engine.state.bassBoost,
    presence:engine.state.presence,balance:engine.state.balance,compressorMode:engine.state.compressorMode,reverbAmount:engine.state.reverbAmount,exciterAmount:engine.state.exciterAmount,
    volumeBoost: engine.state.volumeBoost,
    surround: engine.state.surround,
    compressor: engine.state.compressor,
    reverb: engine.state.reverb,
    exciter: engine.state.exciter,
  });
  saveUserPresets(list);
  renderUserPresets();
});

/* ---- transport ---- */
function updateTrackNameUi() {
  const slot = engine.slots[engine.activeSlot];
  const item = playlist[currentTrackIndex];
  els.trackName.textContent = (item && item.name) || slot.name || t('player.noTrack');
  const sub = item ? [item.artist, item.album].filter(Boolean).join(' — ') : '';
  els.trackSub.textContent = sub;
  if (item && item.picture) {
    els.albumArtImg.src = item.picture;
    els.albumArt.classList.add('has-art');
  } else {
    els.albumArtImg.removeAttribute('src');
    els.albumArt.classList.remove('has-art');
  }
  syncVisAlbumArt(item && item.picture);
  syncOsNowPlaying();
  syncMiniBar();
  syncMediaSession();
}
function syncMediaSession() {
  // Standard Web MediaSession API — Chromium wires this straight through to
  // Windows' System Media Transport Controls (volume flyout, lock screen,
  // Bluetooth headset buttons), no native module needed.
  if (!('mediaSession' in navigator)) return;
  const item = playlist[currentTrackIndex];
  if (item) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.name || '',
      artist: item.artist || '',
      album: item.album || '',
      artwork: item.picture ? [{ src: item.picture, sizes: '512x512', type: 'image/png' }] : [],
    });
  } else {
    navigator.mediaSession.metadata = null;
  }
}
let lastNowPlaying='';
function syncOsNowPlaying() {
  const item = playlist[currentTrackIndex];
  const title = item ? item.name : null;
  const playing = !!(engine.activeEl && !engine.activeEl.paused);
  const state=JSON.stringify([title,playing]);
  if(state!==lastNowPlaying){lastNowPlaying=state;window.waveframe?.updateNowPlaying?.({ title, playing });}
}
function audioVisualActive(){return !!(engine.testOsc||engine.micStream||engine.slots.some(s=>!s.el.paused&&!s.el.ended));}
let audioIdleTimer=0;
function scheduleAudioIdle(){
  clearTimeout(audioIdleTimer);audioIdleTimer=0;
  if(!engine.ctx||audioVisualActive()||engine.pendingTransition)return;
  audioIdleTimer=setTimeout(()=>{
    audioIdleTimer=0;
    if(engine.ctx&&!audioVisualActive()&&!engine.pendingTransition&&engine.ctx.state==='running')engine.ctx.suspend().catch(()=>{});
  },1500);
}
window.addEventListener('waveframe:audio-activity',scheduleAudioIdle);
window.addEventListener('waveframe:audio-graph-ready',scheduleAudioIdle);
function fmtTime(s) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
setInterval(() => {
  const el = engine.activeEl;
  if (!document.hidden&&document.getElementById('tab-player').classList.contains('active')&&el&&Number.isFinite(el.duration)&&el.duration>0) {
    const position=String(Math.round((el.currentTime/el.duration)*1000)),label=`${fmtTime(el.currentTime)} / ${fmtTime(el.duration)}`;
    if(els.seek.value!==position)els.seek.value=position;
    if(els.timeLabel.textContent!==label)els.timeLabel.textContent=label;
  }
}, 250);
els.seek.addEventListener('input', () => engine.seekTo(parseFloat(els.seek.value) / 1000));

els.btnPlay.addEventListener('click', async () => {
  if (currentTrackIndex === -1 && playlist.length > 0) { playTrackAt(0); return; }
  await engine.togglePlay();
  syncPlayButton();
});
function syncPlayButton() {
  window.dispatchEvent(new Event('waveframe:audio-activity'));
  els.btnPlay.textContent = engine.activeEl.paused ? '▶' : '⏸';
  syncOsNowPlaying();
  const miniPlay = document.getElementById('miniBarPlay');
  if (miniPlay) miniPlay.textContent = engine.activeEl.paused ? '▶' : '⏸';
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = engine.activeEl.paused ? 'paused' : 'playing';
  }
}
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => {if(engine.activeEl.paused)engine.play().then(syncPlayButton).catch(()=>{});});
  navigator.mediaSession.setActionHandler('pause', () => {engine.pauseActive();syncPlayButton();});
  navigator.mediaSession.setActionHandler('previoustrack', () => goPrev());
  navigator.mediaSession.setActionHandler('nexttrack', () => goNext());
}
engine.slots.forEach((s) => {
  s.el.addEventListener('loadedmetadata',()=>{if(s===engine.slots[engine.activeSlot])requestLoudness(s.item);});
  s.el.addEventListener('play', syncPlayButton);
  s.el.addEventListener('playing',()=>{syncPlayButton();if(s===engine.slots[engine.activeSlot])requestLoudness(s.item);});
  s.el.addEventListener('pause', syncPlayButton);
  s.el.addEventListener('ended', () => { syncPlayButton();if (engine.activeSlot === engine.slots.indexOf(s)) onTrackEnded(); });
  s.el.addEventListener('error', () => {
    if (!s.el.src || engine.activeSlot !== engine.slots.indexOf(s)) return;
    showAlertDialog(t('player.loadErrorTitle'), t('player.loadErrorMsg'));
  });
});
function onTrackEnded() {
  if (sleepWantsStopAtEnd()) return;
  if (repeatOn && playlist.length === 1) { playTrackAt(currentTrackIndex); return; }
  goNext();
}
// Real loudness (ITU-R BS.1770-4 integrated LUFS with gating, see audiolib.js) instead of a plain RMS estimate:
// quiet classical and loud masters now land on the same perceived level. Result: { gain (linear), lufs }.
function measureLoudness(buffer) {
  const channels = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
  const lufs = WaveframeAudio.integratedLufs(channels, buffer.sampleRate);
  const gainDb = WaveframeAudio.lufsToGainDb(lufs, -18, 12);
  return { gain: WaveframeAudio.dbToLinear(gainDb), lufs, gainDb };
}
function computeLoudnessGain(buffer) { return measureLoudness(buffer).gain; }
// Keep only the latest requested track waiting for one bounded analysis.
let loudnessBusy=false,loudnessNext=null;
function requestLoudness(item){
  if(!item||engine.activeEl.paused||playlist[currentTrackIndex]!==item||engine.slots[engine.activeSlot].item!==item||!engine.state.normalizationEnabled||typeof item.normGain==='number')return;
  const decision=OpsisFeatureGuide.loudnessEligibility({local:!!(item.file||item.path),size:item.file?.size,duration:engine.activeEl.duration});
  if(decision==='wait')return;
  if(decision!=='ok'){item.normStatus=decision;showLoudnessInfo(item);return;}
  loudnessNext=item;void drainLoudness();
}
async function drainLoudness(){
  if(loudnessBusy)return;loudnessBusy=true;
  try{while(loudnessNext){const item=loudnessNext;loudnessNext=null;
    if(playlist[currentTrackIndex]!==item||engine.slots[engine.activeSlot].item!==item||!engine.state.normalizationEnabled||typeof item.normGain==='number')continue;
    const gain=await analyzeLoudness(item);
    if(playlist[currentTrackIndex]===item&&engine.slots[engine.activeSlot].item===item){engine.setNormalizationGain(gain);showLoudnessInfo(item);}
  }}finally{loudnessBusy=false;}
}
async function boundedLoudnessBytes(item){
  const limit=32*1024*1024;
  if(item.file){if(item.file.size>limit)throw Error('size-limit');return item.file.arrayBuffer();}
  if(!item.path||!item.url?.startsWith('file:///'))throw Error('local-only');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  let reader;
  try{const response=await fetch(item.url,{signal:controller.signal});
    if(!response.ok||Number(response.headers.get('content-length'))>limit||!response.body)throw Error('read-limit');
    reader=response.body.getReader();const chunks=[];let total=0;
    for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit)throw Error('size-limit');chunks.push(value);}
    const bytes=new Uint8Array(total);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}return bytes.buffer;
  }finally{clearTimeout(timer);if(reader)await reader.cancel().catch(()=>{});}
}
async function analyzeLoudness(item) {
  if (typeof item.normGain === 'number') return item.normGain;
  try {
    const arrayBuf = await boundedLoudnessBytes(item);
    // OfflineAudioContext: no audio device / audio thread, and (unlike AudioContext) it never counts against Chromium's
    // limit of live contexts, so loudness analysis of many tracks cannot silently start failing.
    const analysisCtx = new OfflineAudioContext(1, 1, 44100);
    const buffer = await analysisCtx.decodeAudioData(arrayBuf);
    const m = measureLoudness(buffer);
    item.normGain = m.gain; item.lufs = m.lufs; item.normGainDb = m.gainDb;delete item.normStatus;
  } catch {
    item.normGain = 1;item.normStatus='unavailable';
  }
  return item.normGain;
}

function playTrackAt(index) {
  if (index < 0 || index >= playlist.length) return;
  engine.stopAlternateSources();
  window.WaveframeVideoPlayer?.parkForAudio();
  currentTrackIndex = index;
  const item = playlist[index];
  if(item.path&&!musicArtCache.has(item)&&!noArtwork.has(item))void enrichTrackMetadata(item,true);
  engine.switchTrack((slotIndex) => {
    const slot=engine.slots[slotIndex],old=slot.objectUrl;
    slot.el.pause();
    slot.objectUrl=item.file?URL.createObjectURL(item.file):null;
    slot.el.src=slot.objectUrl||item.url;
    slot.el.load();
    if(old)URL.revokeObjectURL(old);
    slot.item=item;slot.name=item.name;
  },(slot,ok)=>{
    // On failed or cancelled crossfade keep the previous active track.
    const selected=ok?item:slot.item;
    currentTrackIndex=playlist.indexOf(selected);
    engine.setNormalizationGain(typeof selected?.normGain==='number'?selected.normGain:1);
    showLoudnessInfo(selected);
    if(selected&&ok)requestLoudness(selected);
    updateTrackNameUi();syncPlayButton();renderPlaylist();
  });
}
function showLoudnessInfo(item) {
  const el = document.getElementById('loudnessInfo');
  if (!el) return;
  if(item?.normStatus){el.textContent=(document.documentElement.lang==='el'?'Η ανάλυση LUFS δεν εκτελέστηκε (τοπικά αρχεία έως 32 MiB / 10 λεπτά ή μη διαθέσιμη ανάλυση).':'LUFS analysis skipped (local files up to 32 MiB / 10 minutes, or analysis unavailable).');return;}
  if (!item || !Number.isFinite(item.lufs)) { el.textContent = t('enhance.loudnessNone'); return; }
  const sign = item.normGainDb > 0 ? '+' : '';
  el.textContent = t('enhance.loudnessInfo').replace('{lufs}', item.lufs.toFixed(1)).replace('{gain}', sign + item.normGainDb.toFixed(1));
}
function goNext() {
  if (playlist.length === 0) return;
  let next;
  if (shuffleOn) next = Math.floor(Math.random() * playlist.length);
  else { next = currentTrackIndex + 1; if (next >= playlist.length) next = repeatOn ? 0 : -1; }
  if (next === -1) return;
  playTrackAt(next);
}
function goPrev() {
  if (playlist.length === 0) return;
  playTrackAt(currentTrackIndex <= 0 ? playlist.length - 1 : currentTrackIndex - 1);
}
els.btnNext.addEventListener('click', goNext);
els.btnPrev.addEventListener('click', goPrev);
els.btnShuffle.addEventListener('click', () => { shuffleOn = !shuffleOn; els.btnShuffle.classList.toggle('active', shuffleOn); });
els.btnRepeat.addEventListener('click', () => { repeatOn = !repeatOn; els.btnRepeat.classList.toggle('active', repeatOn); });
els.btnMute.addEventListener('click', () => {
  const m = !engine.state.muted;
  engine.setMuted(m);
  els.btnMute.classList.toggle('active', m);
  els.btnMute.textContent = m ? '🔇' : '🔊';
});
els.volume.addEventListener('input', () => engine.setVolume(parseInt(els.volume.value, 10) / 100));

/* ---- sleep timer: Off -> 15 -> 30 -> 45 -> 60 -> 90 min -> end of track -> Off. Fades the volume out over the last 10 s ---- */
const SLEEP_STEPS = [0, 15, 30, 45, 60, 90, 'end'];
let sleepStep = 0, sleepEndAt = 0, sleepTick = null;
function sleepLabel() {
  const s = SLEEP_STEPS[sleepStep];
  if (s === 0) return t('player.sleepOff');
  if (s === 'end') return t('player.sleepEnd');
  return t('player.sleepOn').replace('{n}', String(s));
}
function refreshSleepButton() {
  const btn = document.getElementById('btnSleep');
  if (!btn) return;
  const s = SLEEP_STEPS[sleepStep];
  btn.classList.toggle('active', s !== 0);
  btn.title = btn.ariaLabel = sleepLabel();
  if (s === 0) btn.textContent = '⏾';
  else if (s === 'end') btn.textContent = '⏾ ⏭';
  else btn.textContent = `⏾ ${Math.max(1, Math.ceil((sleepEndAt - Date.now()) / 60000))}'`;
}
function stopSleepTick() { if (sleepTick) { clearInterval(sleepTick); sleepTick = null; } engine.setSleepFactor(1); }
function fireSleep() {
  stopSleepTick(); sleepStep = 0;
  engine.pauseActive();engine.stopAlternateSources();
  engine.setSleepFactor(1);            // restore the user's volume for the next time they press play
  refreshSleepButton(); syncPlayButton();
}
function setSleepStep(step) {
  sleepStep = step; stopSleepTick();
  const s = SLEEP_STEPS[sleepStep];
  if (typeof s === 'number' && s > 0) {
    sleepEndAt = Date.now() + s * 60000;
    sleepTick = setInterval(() => {
      const left = sleepEndAt - Date.now();
      engine.setSleepFactor(WaveframeAudio.sleepFadeGain(left));
      if (left <= 0) fireSleep(); else refreshSleepButton();
    }, 1000);
  }
  refreshSleepButton();
}
document.getElementById('btnSleep').addEventListener('click', () => setSleepStep((sleepStep + 1) % SLEEP_STEPS.length));
document.addEventListener('waveframe:language-changed', refreshSleepButton);
// "end of track": the existing ended handler asks us whether to stop instead of advancing
function sleepWantsStopAtEnd() { if (SLEEP_STEPS[sleepStep] === 'end') { fireSleep(); return true; } return false; }

/* ---- export the current EQ for Opsis / Equalizer APO (.txt) ---- */
function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
document.getElementById('btnExportApo').addEventListener('click', () => {
  const item = playlist[currentTrackIndex];
  const name = 'Waveframe EQ' + (item && item.name ? ' - ' + item.name : '');
  const txt = WaveframeAudio.toEqualizerApo({ bands: [...engine.state.eqBands], bassBoost: engine.state.bassBoost }, name);
  downloadText('waveframe-eq.txt', txt);
  showAlertDialog(t('enhance.exportApo'), t('enhance.exportedApo'));
});

/* ---- in-app keyboard shortcuts ---- */
window.addEventListener('keydown', (e) => {
  const interactive=!!e.target?.closest?.('input,textarea,select,button,a,[contenteditable="true"],[role="button"],[role="switch"],[role="slider"],summary');
  const modal=!!document.querySelector('.tutorial-overlay.open');
  if(!OpsisFeatureGuide.shortcutAllowed({defaultPrevented:e.defaultPrevented,ctrlKey:e.ctrlKey,altKey:e.altKey,metaKey:e.metaKey,interactive,modal},document.querySelector('.tab-btn.active')?.dataset.tab,'player'))return;
  switch (e.key) {
    case ' ':
      e.preventDefault();
      els.btnPlay.click();
      break;
    case 'ArrowRight':
      if (engine.activeEl.duration) engine.activeEl.currentTime = Math.min(engine.activeEl.duration, engine.activeEl.currentTime + 5);
      break;
    case 'ArrowLeft':
      if (engine.activeEl.duration) engine.activeEl.currentTime = Math.max(0, engine.activeEl.currentTime - 5);
      break;
    case 'ArrowUp':
      e.preventDefault();
      els.volume.value = String(Math.min(100, parseInt(els.volume.value, 10) + 5));
      els.volume.dispatchEvent(new Event('input'));
      break;
    case 'ArrowDown':
      e.preventDefault();
      els.volume.value = String(Math.max(0, parseInt(els.volume.value, 10) - 5));
      els.volume.dispatchEvent(new Event('input'));
      break;
    case 'm': case 'M':
      els.btnMute.click();
      break;
    case 'n': case 'N':
      goNext();
      break;
    case 'p': case 'P':
      goPrev();
      break;
    default:
      break;
  }
});
engine.setVolume(0.8);

/* ---- sources ---- */
els.fileInput.addEventListener('change', () => {
  addFilesToPlaylist([...els.fileInput.files]);
  els.fileInput.value = '';
});
function addFilesToPlaylist(files) {
  const wasEmpty = playlist.length === 0;
  const added = files.map((file) => {
    const item = { file, path: window.waveframe.pathForFile(file) || null, name: file.name.replace(/\.[^/.]+$/, '') };
    playlist.push(item);
    return item;
  });
  renderPlaylist();
  if (wasEmpty && playlist.length > 0) playTrackAt(0);
  scheduleMetadataScan();
}

let metadataUiBusy=false;
const metadataProgress=document.getElementById('metadataProgress');
const metadataCancel=document.getElementById('metadataCancel');
const inferDisplay=document.getElementById('metadataInferDisplay');
inferDisplay.checked=localStorage.getItem('waveframe.metadata.inferDisplay')==='true';
inferDisplay.addEventListener('change',()=>{OpsisFeatureGuide.setIfChanged(localStorage,'waveframe.metadata.inferDisplay',String(inferDisplay.checked));scheduleMetadataScan();});
metadataCancel.addEventListener('click',async()=>{metadataCancel.disabled=true;await window.waveframe.cancelMetadata();});
window.waveframe.onMetadataProgress(p=>{if(metadataUiBusy&&Number.isInteger(p.done)&&Number.isInteger(p.total))metadataProgress.textContent=p.done+' / '+p.total;});
async function completeMusicTags(mode){
  if(metadataUiBusy)return;
  metadataUiBusy=true;
  const buttons=['metadataAuto','metadataManual','metadataOnline','metadataFingerprint'].map(id=>document.getElementById(id));
  buttons.forEach(b=>b.disabled=true);
  try{
  const values={};
  if(mode==='manual'){
    for(const [key,label] of Object.entries({title:'Title / Τίτλος',artist:'Artist / Καλλιτέχνης',album:'Album / Άλμπουμ',genre:'Genre / Είδος',year:'Year / Έτος',composer:'Composer / Συνθέτης',lyricist:'Lyricist / Στιχουργός',albumartist:'Album artist / Καλλιτέχνης άλμπουμ'})){
      const value=await showInputDialog(label+' (blank = skip / κενό = παράλειψη)','');
      if(value===null||value===undefined)return;
      if(value)values[key]=value;
    }
  }
  metadataProgress.textContent='';
  metadataCancel.hidden=mode!=='auto';metadataCancel.disabled=false;
    const result=await window.waveframe.completeMetadata(mode,values);
    if(result.cancelled)return;
    if(result.error){await showAlertDialog('Metadata',result.error);return;}
    const rows=result.rows||[];
    for(const row of rows.filter(r=>r.status==='updated')){
      for(const item of playlist.filter(x=>x.path===row.file))await enrichTrackMetadata(item,true);
    }
    await showAlertDialog('Metadata',rows.map(r=>r.file+' — '+r.status+(r.error?': '+r.error:'')+(r.backup?' | Backup: '+r.backup:'')).join('\n'));
  }catch(err){await showAlertDialog('Metadata',String(err.message||err));}
  finally{metadataUiBusy=false;metadataCancel.hidden=true;buttons.forEach(b=>b.disabled=false);}
}
document.getElementById('metadataAuto').addEventListener('click',()=>completeMusicTags('auto'));
document.getElementById('metadataManual').addEventListener('click',()=>completeMusicTags('manual'));
document.getElementById('metadataOnline').addEventListener('click',()=>completeMusicTags('online'));
document.getElementById('metadataFingerprint').addEventListener('click',()=>completeMusicTags('fingerprint'));

const metadataReads=new WeakMap(),musicArtCache=new Map(),noArtwork=new WeakSet();
let metadataRenderTimer=0,metadataSaveTimer=0,metadataScanBusy=false,metadataScanRevision=0;
const metadataQueue=OpsisFeatureGuide.createSerialQueue(async item=>{
  if(!playlist.includes(item))return null;
  const meta=await window.waveframe.readMetadata(item.path);
  if(!meta||!playlist.includes(item))return null;
  if(meta.picture){noArtwork.delete(item);retainMusicArt(item,meta.picture);}else{noArtwork.add(item);musicArtCache.delete(item);}
  const {picture,...text}=meta;return text;
},64);
function scheduleMetadataScan(){
  metadataScanRevision++;
  if(metadataScanBusy)return;
  metadataScanBusy=true;
  void (async()=>{try{
    let revision;
    do{
      revision=metadataScanRevision;
      // One scan, no array of asynchronous jobs or repeated queued scans.
      for(let i=0;i<playlist.length;i++){
        if(revision!==metadataScanRevision)break;
        const item=playlist[i];if(item?.path)await enrichTrackMetadata(item);
      }
    }while(revision!==metadataScanRevision);
  }finally{metadataScanBusy=false;}})();
}
function retainMusicArt(item,picture){
  for(const key of musicArtCache.keys())if(!playlist.includes(key))musicArtCache.delete(key);
  if(picture)OpsisFeatureGuide.retainImage(musicArtCache,item,picture);
  // Items and resolved metadata promises must not retain evicted cover bytes.
  for(const track of playlist)if(track.picture&&!musicArtCache.has(track))track.picture=null;
  return musicArtCache.get(item)||null;
}
function scheduleMetadataRefresh(){
  if(!metadataRenderTimer)metadataRenderTimer=setTimeout(()=>{metadataRenderTimer=0;renderPlaylist(false);},200);
  clearTimeout(metadataSaveTimer);metadataSaveTimer=setTimeout(()=>{metadataSaveTimer=0;savePlaylist();},1000);
}
window.addEventListener('beforeunload',()=>{if(metadataSaveTimer)savePlaylist();});
async function enrichTrackMetadata(item,force=false) {
  if (!item.path||!playlist.includes(item)) return;
  let task=metadataReads.get(item);
  if(!task||force){
    task=metadataQueue.request(item,force);
    metadataReads.set(item,task);
  }
  const meta=await task;
  if(metadataReads.get(item)!==task||!playlist.includes(item))return;
  if(!meta){if(metadataReads.get(item)===task)metadataReads.delete(item);return;}
  const base=item.path.split(/[\\/]/).pop().replace(/\.[^/.]+$/, '');
  const parts=base.split(' - ');
  const guess=inferDisplay.checked&&parts.length===2&&parts.every(x=>x.trim());
  const title=meta.title||(guess?parts[1].trim():null);
  const artist=meta.artist||(guess?parts[0].trim():null);
  const name=title?(artist?artist+' - '+title:title):base;
  const picture=musicArtCache.get(item)||null;
  if(item.name===name&&item.artist===(artist||null)&&item.album===(meta.album||null)&&item.picture===picture)return;
  item.name=name;
  item.artist = artist || null;
  item.album = meta.album || null;
  item.picture = picture;
  scheduleMetadataRefresh();
  if (playlist[currentTrackIndex] === item) updateTrackNameUi();
}

const PLAYLIST_KEY = 'waveframe.playlist';
function pathToFileUrl(p) {
  return 'file:///' + p.replace(/\\/g, '/').replace(/^\/+/, '');
}

// "Open with Waveframe" from Explorer (file association) or double-clicking
// an audio file while the app is already running (forwarded via second-instance).
window.waveframe.onOpenFile((filePath) => {
  const name = filePath.split(/[\\/]/).pop().replace(/\.[^/.]+$/, '');
  const item = { path: filePath, url: pathToFileUrl(filePath), name };
  playlist.push(item);
  renderPlaylist();
  playTrackAt(playlist.length - 1);
  enrichTrackMetadata(item);
});
function savePlaylist() {
  const serializable = playlist
    .filter((item) => item.path || item.url)
    .map((item) => ({ path: item.path || null, url: item.path ? null : item.url || null, name: item.name }));
  try{const encoded=JSON.stringify(serializable);if(localStorage.getItem(PLAYLIST_KEY)!==encoded)localStorage.setItem(PLAYLIST_KEY,encoded);}catch{}
}
function restorePlaylist() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(PLAYLIST_KEY)) || []; } catch { saved = []; }
  if (!Array.isArray(saved)||saved.length === 0) return;
  saved.forEach((entry) => {
    if (!entry||typeof entry!=='object')return;
    if (typeof entry.path==='string'&&entry.path) playlist.push({ path: entry.path, url: pathToFileUrl(entry.path), name: entry.name });
    else if (typeof entry.url==='string'&&entry.url) playlist.push({ url: entry.url, name: entry.name });
  });
  renderPlaylist();
  // Refresh tags on restored local files in sequence to avoid unbounded disk IO.
  scheduleMetadataScan();
}
document.body.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('drag-over'); });
document.body.addEventListener('dragleave', () => document.body.classList.remove('drag-over'));
document.body.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('drag-over');
  const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('audio/'));
  if (files.length) addFilesToPlaylist(files);
});
els.btnUrl.addEventListener('click', async () => {
  const url = await showInputDialog(t('player.urlPromptTitle'));
  if (!url) return;
  const wasEmpty = playlist.length === 0;
  playlist.push({ url, name: url.split('/').pop() || url });
  renderPlaylist();
  if (wasEmpty) playTrackAt(playlist.length - 1);
});
els.btnMic.addEventListener('click', async () => {
  window.WaveframeVideoPlayer?.parkForAudio();
  try { if(await engine.startMic())els.trackName.textContent = t('player.micLabel'); }
  catch (err) { await showAlertDialog(t('player.micErrorTitle'), err.message); }
});
els.btnTestTone.addEventListener('click', () => {
  window.WaveframeVideoPlayer?.parkForAudio();
  engine.playTestTone();
  els.trackName.textContent = t('player.toneLabel');
});

function renderPlaylist(persist=true) {
  els.playlist.innerHTML = '';
  els.playlistEmptyHint.style.display = playlist.length ? 'none' : 'block';
  playlist.forEach((item, idx) => {
    const li = document.createElement('li');
    li.className = idx === currentTrackIndex ? 'active' : '';
    // built with the DOM, not innerHTML: file names, tags and restored/imported playlists must never be interpreted as markup
    const info = document.createElement('div'); info.className = 'playlist-track-info';
    if (item.picture && /^data:image\//.test(item.picture)) { const im = document.createElement('img'); im.className = 'playlist-thumb'; im.alt = ''; im.src = item.picture; info.appendChild(im); }
    else { const fb = document.createElement('span'); fb.className = 'playlist-thumb-fallback'; fb.textContent = '🎵'; info.appendChild(fb); }
    const nm = document.createElement('span'); nm.className = 'playlist-track-name'; nm.textContent = item.name;
    info.appendChild(nm); li.appendChild(info);
    li.addEventListener('click', () => playTrackAt(idx));
    const rm = document.createElement('button');
    rm.className = 'remove-track';
    rm.textContent = '✕';
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      const removed=playlist[idx];
      // A pending crossfade may still reference the removed item. Cancel its
      // callback before changing indices; keep the actual active slot's item.
      const wasSelected=playlist[currentTrackIndex]===removed;
      const isLoaded=engine.slots.some(slot=>slot.item===removed);
      if(isLoaded&&engine.pendingTransition)engine.cancelCrossfade(true);
      const activeItem=engine.slots[engine.activeSlot].item;
      if(activeItem===removed)engine.pauseActive();
      playlist.splice(idx, 1);
      musicArtCache.delete(removed);metadataReads.delete(removed);noArtwork.delete(removed);metadataQueue.remove(removed);metadataScanRevision++;
      if(activeItem===removed)currentTrackIndex=-1;
      else if(activeItem&&playlist.includes(activeItem))currentTrackIndex=playlist.indexOf(activeItem);
      else if(wasSelected)currentTrackIndex=-1;
      else if(idx<currentTrackIndex)currentTrackIndex--;
      // Release a removed file even if a paused crossfade slot still holds it.
      for(const slot of engine.slots)if(slot.item===removed){slot.el.pause();slot.el.removeAttribute('src');slot.el.load();if(slot.objectUrl)URL.revokeObjectURL(slot.objectUrl);slot.objectUrl=null;slot.item=null;slot.name='';}
      updateTrackNameUi();syncPlayButton();
      renderPlaylist();
    });
    li.appendChild(rm);
    els.playlist.appendChild(li);
  });
  if(persist)savePlaylist();
}

els.crossfade.addEventListener('input', () => { engine.crossfadeSeconds = parseFloat(els.crossfade.value); });

/* ---- effects ---- */
function setKnobPct(knobEl, pct) {
  if (knobEl) knobEl.style.setProperty('--pct', String(Math.max(0, Math.min(1, pct))));
}
els.bassBoost.addEventListener('input', () => {
  const db = parseFloat(els.bassBoost.value);
  engine.setBassBoost(db);
  els.bassBoostVal.textContent = `${db.toFixed(1)} dB`;
  setKnobPct(els.knobBassBoost, db / 12);
});
els.surround.addEventListener('input', () => {
  const pct = parseFloat(els.surround.value);
  engine.setSurround(pct);
  els.surroundVal.textContent = `${Math.round(pct)}%`;
  setKnobPct(els.knobSurround, pct / 100);
});
els.volBoost.addEventListener('input', () => {
  const db = parseFloat(els.volBoost.value);
  engine.setVolumeBoostDb(db);
  els.volBoostVal.textContent = `${db.toFixed(1)} dB`;
  setKnobPct(els.knobVolBoost, db / 12);
});
function syncProfessionalFx(){
  const p=document.getElementById('fxPresence'),b=document.getElementById('fxBalance');
  p.value=String(engine.state.presence);b.value=String(engine.state.balance);document.getElementById('fxCompressorMode').value=engine.state.compressorMode;for(const k of ['reverb','exciter']){document.getElementById('fx_'+k+'Amount').value=String(engine.state[k+'Amount']);document.getElementById('fx_'+k+'Value').textContent=engine.state[k+'Amount']+'%';}
  document.getElementById('fxPresenceValue').textContent=WaveframeAudio.presenceParams(engine.state.presence).gain.toFixed(1)+' dB';
  document.getElementById('fxBalanceValue').textContent=String(engine.state.balance);
}
for(const k of ['reverb','exciter'])document.getElementById('fx_'+k+'Amount').addEventListener('input',e=>{engine.setEffectAmount(k,e.target.value);syncProfessionalFx();});
document.getElementById('fxCompressorMode').addEventListener('change',e=>{engine.setCompressorMode(e.target.value);syncProfessionalFx();});
document.getElementById('fxPresence').addEventListener('input',e=>{engine.setPresence(e.target.value);syncProfessionalFx();});
document.getElementById('fxBalance').addEventListener('input',e=>{engine.setBalance(e.target.value);syncProfessionalFx();});
els.btnResetFx.addEventListener('click', () => {
  engine.resetEffects();syncProfessionalFx();
  els.bassBoost.value = '0'; els.bassBoostVal.textContent = '0 dB'; setKnobPct(els.knobBassBoost, 0);
  els.surround.value = '0'; els.surroundVal.textContent = '0%'; setKnobPct(els.knobSurround, 0);
  els.volBoost.value = '0'; els.volBoostVal.textContent = '0 dB'; setKnobPct(els.knobVolBoost, 0);
  for (const sw of [els.swCompressor, els.swReverb, els.swExciter]) sw.classList.remove('active');
  activePresetKey = null;
});
wireSwitch(els.swMasterEnable, (on) => engine.setMasterEnable(on), engine.state.masterEnabled);
// User-selected live DSP policy. Never switch OS devices or alter export settings.
(() => {
  const panel=document.getElementById('fxSoundNotice'),status=document.getElementById('fxSoundStatus'),bypass=document.getElementById('fxSoundBypass'),select=document.getElementById('fxSoundMode');
  let installed=null,running=null,route=false,deviceSeen=false,revision=0;
  let mode='native';try{const saved=localStorage.getItem('waveframe.fxSoundMode');if(['native','external','auto'].includes(saved))mode=saved;}catch{}
  select.value=mode;
  function show() {
    const el=document.documentElement.lang==='el';
    panel.hidden=false; // manual external processing remains available even without detected FxSound
    engine.setRouteBypass(WaveframeAudio.routeBypass(mode,route));
    const details=el?['Εγκατάσταση: '+(installed===true?'ναι':installed===false?'δεν εντοπίστηκε':'άγνωστη'),'Διεργασία: '+(running===true?'εντοπίστηκε':running===false?'δεν εντοπίστηκε':'άγνωστη'),'Προεπιλεγμένη έξοδος: '+(route?'FxSound (βάσει ονόματος)':'μη επιβεβαιωμένη')]:['Installed: '+(installed===true?'yes':installed===false?'not detected':'unknown'),'Process: '+(running===true?'detected':running===false?'not detected':'unknown'),'Default output: '+(route?'FxSound (label match)':'unconfirmed')];
    details.push(engine.state.routeBypass?(el?'Τα ζωντανά εφέ OPSIS παρακάμπτονται.':'OPSIS live effects bypassed.'):(el?'Η ρύθμιση Master DSP διατηρείται.':'Master DSP preference retained.'));
    details.push(el?'Δεν επιβεβαιώνεται ενεργή επεξεργασία FxSound. Η ένταση/limiter και οι ρυθμίσεις εξαγωγής δεν αλλάζουν.':'FxSound processing is not verified. Volume/limiter and export preferences are unchanged.');
    status.textContent=details.join(' · ');
    select.options[0].textContent=t('enhance.dspNative');
    select.options[1].textContent=t('enhance.dspExternal');
    select.options[2].textContent=t('enhance.dspAuto');
    bypass.textContent=t('enhance.dspBypass');
  }
  function change(){mode=select.value;try{localStorage.setItem('waveframe.fxSoundMode',mode);}catch{}show();}
  async function devices(){
    const n=++revision;const list=await navigator.mediaDevices?.enumerateDevices().catch(()=>[])||[];
    if(n!==revision)return;
    deviceSeen=list.some(d=>d.kind==='audiooutput'&&/fxsound/i.test(d.label));
    route=list.some(d=>d.kind==='audiooutput'&&d.deviceId==='default'&&/fxsound/i.test(d.label));show();
  }
  async function detect(){const r=await window.waveframe.fxSoundStatus().catch(()=>null);installed=r?.installed??null;running=r?.running??null;show();}
  const experimental=document.getElementById('experimentalWorklet'),workletStatus=document.getElementById('experimentalWorkletStatus');
  let wasmBytes=null;
  function showWorklet(failed=false){
    const el=document.documentElement.lang==='el';
    experimental.textContent=engine.workletPreference?(el?'Επιστροφή σε Web Audio':'Return to Web Audio'):(el?'Πειραματικός DSP WASM':'Experimental WASM DSP');
    workletStatus.hidden=!wasmBytes;
    workletStatus.textContent=failed?(el?'Αποτυχία WASM — επιστροφή στην ασφαλή διαδρομή.':'WASM failed — safe route restored.'):(el?'Πειραματική λειτουργία · ':'Experimental mode · ')+(engine.dspRouteGate?.target||'web');
  }
  window.waveframe.experimentalWorkletBytes().then(bytes=>{
    if(bytes instanceof Uint8Array){wasmBytes=bytes;experimental.hidden=false;showWorklet();}
  }).catch(()=>{});
  experimental.addEventListener('click',async()=>{
    if(!wasmBytes||experimental.disabled)return;
    experimental.disabled=true;
    try{
      if(engine.workletPreference){engine.disableExperimentalWorklet();showWorklet();}
      else{engine.resume();showWorklet(!(await engine.enableExperimentalWorklet(wasmBytes)));}
    }finally{experimental.disabled=false;}
  });
  window.addEventListener('waveframe:worklet-failed',()=>showWorklet(true));
  window.addEventListener('waveframe:dsp-route-changed',()=>{if(wasmBytes)showWorklet();});
  const inventoryButton=document.getElementById('audioEndpointInventory'),inventoryReport=document.getElementById('audioEndpointReport');
  inventoryButton.addEventListener('click',async()=>{
    inventoryButton.disabled=true;inventoryReport.hidden=false;
    const greek=document.documentElement.lang==='el';
    inventoryReport.textContent=greek?'Ανάγνωση συσκευών…':'Reading devices…';
    try{
      const data=await window.waveframe.audioEndpoints();
      if(!data){inventoryReport.textContent=greek?'Μη διαθέσιμη ανίχνευση Core Audio.':'Core Audio inventory unavailable.';return;}
      const states=greek?{1:'Ενεργή',2:'Απενεργοποιημένη',4:'Απούσα',8:'Αποσυνδεδεμένη'}:{1:'Active',2:'Disabled',4:'Not present',8:'Unplugged'};
      const roles=greek?['Κονσόλα','Πολυμέσα','Επικοινωνίες']:['Console','Multimedia','Communications'];
      const lines=data.rows.map(row=>row.name+' — '+states[row.state]+[row.console,row.multimedia,row.communications].map((on,i)=>on?' · '+roles[i]:'').join(''));
      if(!lines.length)lines.push(greek?'Δεν εντοπίστηκαν έξοδοι.':'No rendering endpoints found.');
      if(data.partial||data.rolesKnown.some(x=>!x))lines.push(greek?'Μερικά στοιχεία δεν ήταν διαθέσιμα.':'Some information was unavailable.');
      lines.push(greek?'Μόνο ανάγνωση — καμία αλλαγή εξόδου ή επιβεβαίωση APO.':'Read only — no output change or APO verification.');
      inventoryReport.textContent=lines.join('\n');
    }catch{inventoryReport.textContent=greek?'Αποτυχία ανάγνωσης.':'Inventory failed.';}finally{inventoryButton.disabled=false;}
  });
  select.addEventListener('change',change);
  bypass.addEventListener('click',()=>{select.value='external';change();});
  navigator.mediaDevices?.addEventListener('devicechange',()=>{devices();detect();});
  window.addEventListener('focus',()=>{devices();detect();});
  document.addEventListener('waveframe:language-changed',show);
  detect();devices();
})();
// Switches are <button>s: expose them as role=switch and keep aria-checked in step with the 'active' class (whoever toggles it).
function wireSwitch(btn, onChange, initial = false) {
  btn.setAttribute('role', 'switch');
  btn.classList.toggle('active', initial);
  const sync = () => btn.setAttribute('aria-checked', btn.classList.contains('active') ? 'true' : 'false');
  sync();
  new MutationObserver(sync).observe(btn, { attributes: true, attributeFilter: ['class'] });
  btn.addEventListener('click', () => {
    const on = !btn.classList.contains('active');
    btn.classList.toggle('active', on);
    onChange(on);
  });
}
function setSwitchState(btn, on, onChange) {
  btn.classList.toggle('active', on);
  onChange(on);
}
wireSwitch(els.swCompressor, (on) => engine.setCompressor(on), engine.state.compressor);
wireSwitch(els.swReverb, (on) => engine.setReverb(on), engine.state.reverb);
wireSwitch(els.swExciter, (on) => engine.setExciter(on), engine.state.exciter);
wireSwitch(document.getElementById('swNormalize'), (on) => {
  engine.setNormalizationEnabled(on);
  const item = playlist[currentTrackIndex];
  engine.setNormalizationGain(item && typeof item.normGain === 'number' ? item.normGain : 1);
  if(on)requestLoudness(item);else loudnessNext=null;
}, engine.state.normalizationEnabled);
wireSwitch(els.swPreservePitch, (on) => engine.setPreservePitch(on), engine.state.preservePitch);
els.tempo.addEventListener('input', () => {
  const rate = parseFloat(els.tempo.value);
  engine.setTempo(rate);
  els.tempoVal.textContent = `${rate.toFixed(2)}x`;
});

/* ---- settings: language carousel ---- */
const langCarousel = document.getElementById('langCarousel');
const langTrack = document.getElementById('langTrack');
const langArrowLeft = document.getElementById('langArrowLeft');
const langArrowRight = document.getElementById('langArrowRight');
const langPickPrev = document.getElementById('langPickPrev');
const langPickNext = document.getElementById('langPickNext');

LANGUAGES.forEach((lang) => {
  const btn = document.createElement('button');
  btn.className = 'lang-card';
  btn.dataset.lang = lang.code;
  btn.innerHTML = `<span class="lang-flag">${lang.flag}</span><span class="lang-name">${lang.name}</span>`;
  langTrack.appendChild(btn);
});

function syncLangActiveCard() {
  [...langTrack.children].forEach((c) => c.classList.toggle('active', c.dataset.lang === currentLang));
}

let langPickTimeout = null;
function positionLangPickArrows(card) {
  const wrapRect = langCarousel.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const midY = cardRect.top + cardRect.height / 2 - wrapRect.top;
  langPickPrev.style.top = `${midY}px`;
  langPickNext.style.top = `${midY}px`;
  langPickPrev.style.left = `${cardRect.left - wrapRect.left - 13}px`;
  langPickNext.style.left = `${cardRect.right - wrapRect.left - 13}px`;
}

function pickLanguageAt(index, { confirm = false } = {}) {
  const cards = [...langTrack.children];
  const clamped = Math.max(0, Math.min(cards.length - 1, index));
  const card = cards[clamped];
  cards.forEach((c) => c.classList.remove('picked'));
  card.classList.add('picked');
  langTrack.classList.add('picking');
  card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  positionLangPickArrows(card);
  langPickPrev.classList.toggle('visible', clamped > 0);
  langPickNext.classList.toggle('visible', clamped < cards.length - 1);
  if (confirm) {
    setLanguage(card.dataset.lang);
    syncLangActiveCard();
  }
  clearTimeout(langPickTimeout);
  langPickTimeout = setTimeout(() => {
    langTrack.classList.remove('picking');
    langPickPrev.classList.remove('visible');
    langPickNext.classList.remove('visible');
    cards.forEach((c) => c.classList.remove('picked'));
  }, 900);
}

langTrack.addEventListener('click', (e) => {
  const card = e.target.closest('.lang-card');
  if (!card) return;
  pickLanguageAt([...langTrack.children].indexOf(card), { confirm: true });
});
langPickPrev.addEventListener('click', (e) => {
  e.stopPropagation();
  const current = [...langTrack.children].findIndex((c) => c.classList.contains('picked'));
  pickLanguageAt(current - 1, { confirm: true });
});
langPickNext.addEventListener('click', (e) => {
  e.stopPropagation();
  const current = [...langTrack.children].findIndex((c) => c.classList.contains('picked'));
  pickLanguageAt(current + 1, { confirm: true });
});
langArrowLeft.addEventListener('click', () => langTrack.scrollBy({ left: -160, behavior: 'smooth' }));
langArrowRight.addEventListener('click', () => langTrack.scrollBy({ left: 160, behavior: 'smooth' }));

document.addEventListener('waveframe:language-changed', () => {
  renderPresetGrid();
  renderUserPresets();
});

const btnThemeToggle = document.getElementById('btnThemeToggle');

const SKINS = [
  { key: 'midnight', name: 'Midnight', isLight: false, swatch: 'linear-gradient(135deg, #14141f, #6366f1)' },
  { key: 'light', name: 'Daylight', isLight: true, swatch: 'linear-gradient(135deg, #ffffff, #a5b4fc)' },
  { key: 'retro', name: 'Retro LCD', isLight: false, swatch: 'linear-gradient(135deg, #001a00, #39ff14)' },
  { key: 'sunset', name: 'Sunset', isLight: false, swatch: 'linear-gradient(135deg, #2a1625, #f97316)' },
  { key: 'mono', name: 'Monochrome', isLight: false, swatch: 'linear-gradient(135deg, #1c1c20, #9ca3af)' },
  { key: 'ocean', name: 'Ocean', isLight: false, swatch: 'linear-gradient(135deg, #071b26, #22b8cf)' },
  { key: 'forest', name: 'Forest', isLight: false, swatch: 'linear-gradient(135deg, #0c1f14, #22c55e)' },
  { key: 'rose', name: 'Rose', isLight: false, swatch: 'linear-gradient(135deg, #22101a, #ec4899)' },
  { key: 'amber', name: 'Amber', isLight: false, swatch: 'linear-gradient(135deg, #1c1305, #f59e0b)' },
  { key: 'ice', name: 'Ice', isLight: true, swatch: 'linear-gradient(135deg, #eef7fb, #0ea5e9)' },
  { key: 'lavender', name: 'Lavender', isLight: true, swatch: 'linear-gradient(135deg, #f3effb, #a855f7)' },
  { key: 'crimson', name: 'Crimson', isLight: false, swatch: 'linear-gradient(135deg, #1a0808, #ef4444)' },
  { key: 'emerald', name: 'Emerald', isLight: false, swatch: 'linear-gradient(135deg, #04120e, #10b981)' },
  { key: 'slate', name: 'Slate', isLight: false, swatch: 'linear-gradient(135deg, #10151c, #64748b)' },
  { key: 'coral', name: 'Coral', isLight: true, swatch: 'linear-gradient(135deg, #fff1ec, #fb7185)' },
  { key: 'neon', name: 'Neon', isLight: false, swatch: 'linear-gradient(135deg, #06040f, #d946ef)' },
  { key: 'sepia', name: 'Sepia', isLight: true, swatch: 'linear-gradient(135deg, #f2e8d5, #92400e)' },
  { key: 'graphite', name: 'Graphite', isLight: false, swatch: 'linear-gradient(135deg, #08090b, #a1a1aa)' },
  { key: 'mint', name: 'Mint', isLight: true, swatch: 'linear-gradient(135deg, #eafbf4, #14b8a6)' },
  { key: 'solar', name: 'Solar', isLight: false, swatch: 'linear-gradient(135deg, #1b1406, #eab308)' },
];
SKINS.forEach((skin) => {
  const card = document.createElement('button');
  card.className = 'skin-card' + (skin.key === 'midnight' ? ' active' : '');
  card.dataset.theme = skin.key;
  card.innerHTML = `<span class="skin-swatch"></span><span>${skin.name}</span>`;
  card.querySelector('.skin-swatch').style.background = skin.swatch;
  els.skinGrid.appendChild(card);
});
function isLightSkin(theme) {
  const skin = SKINS.find((s) => s.key === theme);
  return skin ? skin.isLight : false;
}

function applySkin(theme) {
  document.documentElement.dataset.theme = theme;
  OpsisFeatureGuide.setIfChanged(localStorage,'waveframe.skin', theme);
  [...els.skinGrid.children].forEach((b) => b.classList.toggle('active', b.dataset.theme === theme));
  const light = isLightSkin(theme);
  btnThemeToggle.textContent = light ? '🌙' : '☀️';
  if (!light) OpsisFeatureGuide.setIfChanged(localStorage,'waveframe.lastDarkSkin', theme);
  window.waveframe?.sendThemeChange?.(theme);
}

els.skinGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-theme]');
  if (!btn) return;
  applySkin(btn.dataset.theme);
});

btnThemeToggle.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme;
  if (isLightSkin(current)) {
    applySkin(localStorage.getItem('waveframe.lastDarkSkin') || 'midnight');
  } else {
    applySkin('light');
  }
});

document.getElementById('skinArrowLeft').addEventListener('click', () => els.skinGrid.scrollBy({ left: -200, behavior: 'smooth' }));
document.getElementById('skinArrowRight').addEventListener('click', () => els.skinGrid.scrollBy({ left: 200, behavior: 'smooth' }));

/* ---- custom accent color (overrides the active skin's accent) ---- */
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s; const l = (max + min) / 2;
  if (max === min) { h = 0; s = 0; } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}
function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) { r = g = b = l; } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
let pendingAccent=null,accentTimer=0;
function commitAccent(){clearTimeout(accentTimer);accentTimer=0;if(pendingAccent!==null){OpsisFeatureGuide.setIfChanged(localStorage,'waveframe.accentColor',pendingAccent);pendingAccent=null;}}
function applyAccentColor(hex,persist=true) {
  const [h, s, l] = hexToHsl(hex);
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent-2', hslToHex(h, s, Math.max(0, l - 10)));
  document.documentElement.style.setProperty('--accent-3', hslToHex(h, s, Math.min(100, l + 12)));
  if(persist)OpsisFeatureGuide.setIfChanged(localStorage,'waveframe.accentColor',hex);
}
function resetAccentColor() {
  clearTimeout(accentTimer);accentTimer=0;pendingAccent=null;
  document.documentElement.style.removeProperty('--accent');
  document.documentElement.style.removeProperty('--accent-2');
  document.documentElement.style.removeProperty('--accent-3');
  localStorage.removeItem('waveframe.accentColor');
  document.getElementById('accentColorPicker').value = '#7c6cf0';
}
const accentPicker=document.getElementById('accentColorPicker');
accentPicker.addEventListener('input',e=>{applyAccentColor(e.target.value,false);pendingAccent=e.target.value;clearTimeout(accentTimer);accentTimer=setTimeout(commitAccent,500);});
accentPicker.addEventListener('change',commitAccent);
accentPicker.addEventListener('blur',commitAccent);
window.addEventListener('beforeunload',commitAccent);
document.getElementById('btnAccentReset').addEventListener('click', resetAccentColor);

/* ---- track-change notifications ---- */
const swTrackNotif = document.getElementById('swTrackNotif');
wireSwitch(swTrackNotif, (on) => {
  localStorage.setItem('waveframe.trackNotifications', on ? '1' : '0');
  window.waveframe.setTrackNotifications(on);
}, true);
{
  const savedNotif = localStorage.getItem('waveframe.trackNotifications');
  const enabled = savedNotif === null ? true : savedNotif === '1';
  swTrackNotif.classList.toggle('active', enabled);
  window.waveframe.setTrackNotifications(enabled);
}

/* ---- auto-launch on login ---- */
const swAutostart = document.getElementById('swAutostart');
wireSwitch(swAutostart, (on) => window.waveframe.setAutostart(on));
window.waveframe.getAutostart().then((enabled) => swAutostart.classList.toggle('active', enabled));

/* ---- new-version check: runs in the main process (GitHub latest release, once a day, ETag); nothing is installed automatically ---- */
const swNotifyUpdates = document.getElementById('swNotifyUpdates');
function pushSuiteSettings() {
  window.waveframe.setSuiteSettings({ notify: swNotifyUpdates.classList.contains('active'), lang: localStorage.getItem('waveframe.lang') || 'el' });
}
wireSwitch(swNotifyUpdates, (on) => { localStorage.setItem('waveframe.notifyUpdates', on ? '1' : '0'); pushSuiteSettings(); });
swNotifyUpdates.classList.toggle('active', localStorage.getItem('waveframe.notifyUpdates') !== '0');
pushSuiteSettings();
document.addEventListener('waveframe:language-changed', pushSuiteSettings);
document.getElementById('btnCheckUpdates').addEventListener('click', async () => {
  const statusEl = document.getElementById('updateStatus');
  statusEl.textContent = t('settings.checkingUpdates');
  try {
    const res = await window.waveframe.checkUpdatesNow();
    if (res.status === 'newer') statusEl.textContent = `${t('settings.updateAvailable')} v${res.version}`;
    else if (res.status === 'current') statusEl.textContent = t('settings.upToDate');
    else statusEl.textContent = t('settings.updateCheckFailed');
  } catch {
    statusEl.textContent = t('settings.updateCheckFailed');
  }
});

/* ---- crash overlay wiring ---- */
document.getElementById('crashDetailsToggle').addEventListener('click', () => {
  document.getElementById('crashDetails').classList.toggle('dep-hidden');
});
document.getElementById('crashDismiss').addEventListener('click', () => {
  document.getElementById('crashOverlay').classList.add('dep-hidden');
});
document.getElementById('crashReload').addEventListener('click', () => location.reload());

const layoutSeg = document.getElementById('layoutSeg');
function applyLayout(layout) {
  document.documentElement.dataset.layout = layout;
  OpsisFeatureGuide.setIfChanged(localStorage,'waveframe.layout', layout);
  [...layoutSeg.children].forEach((b) => b.classList.toggle('active', b.dataset.layout === layout));
}
layoutSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-layout]');
  if (!btn) return;
  applyLayout(btn.dataset.layout);
});

const btnStyleSeg = document.getElementById('btnStyleSeg');
function applyBtnStyle(style) {
  document.documentElement.dataset.btnStyle = style;
  OpsisFeatureGuide.setIfChanged(localStorage,'waveframe.btnStyle', style);
  [...btnStyleSeg.children].forEach((b) => b.classList.toggle('active', b.dataset.btnStyle === style));
}
btnStyleSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-btn-style]');
  if (!btn) return;
  applyBtnStyle(btn.dataset.btnStyle);
});

els.bgGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-bg]');
  if (!btn) return;
  const mode = btn.dataset.bg;
  Backgrounds.setMode(mode);
  OpsisFeatureGuide.setIfChanged(localStorage,'waveframe.bg', mode);
  [...els.bgGrid.children].forEach((b) => b.classList.toggle('active', b === btn));
});
document.getElementById('bgArrowLeft').addEventListener('click', () => els.bgGrid.scrollBy({ left: -220, behavior: 'smooth' }));
document.getElementById('bgArrowRight').addEventListener('click', () => els.bgGrid.scrollBy({ left: 220, behavior: 'smooth' }));

/* ---- background hue: auto-cycle or manual ---- */
const bgCanvasEl = document.getElementById('bgCanvas');
const hueModeSeg = document.getElementById('hueModeSeg');
const hueSliderRow = document.getElementById('hueSliderRow');
const hueSlider = document.getElementById('hueSlider');
let hueMode = 'auto';
let autoHue = 0;

function applyHueMode(mode) {
  hueMode = mode;
  OpsisFeatureGuide.setIfChanged(localStorage,'waveframe.hueMode', mode);
  [...hueModeSeg.children].forEach((b) => b.classList.toggle('active', b.dataset.hueMode === mode));
  hueSliderRow.classList.toggle('dep-hidden', mode !== 'manual');
  if (mode === 'manual') bgCanvasEl.style.filter = `hue-rotate(${hueSlider.value}deg)`;
  syncHueSchedule();
}
hueModeSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-hue-mode]');
  if (!btn) return;
  applyHueMode(btn.dataset.hueMode);
});
let huePending=false;
function commitHue(){if(!huePending)return;try{if(localStorage.getItem('waveframe.hueValue')!==hueSlider.value)localStorage.setItem('waveframe.hueValue',hueSlider.value);}catch{}huePending=false;}
hueSlider.addEventListener('input', () => {
  huePending=true;
  if (hueMode === 'manual') bgCanvasEl.style.filter = `hue-rotate(${hueSlider.value}deg)`;
});
hueSlider.addEventListener('change',commitHue);
hueSlider.addEventListener('blur',commitHue);
window.addEventListener('beforeunload',commitHue);
// Re-filtering a full-window canvas is GPU work on every change: update at ~15 fps (same visible speed: bigger step) and
// not at all while the window is hidden/minimized.
let lastHueTick=0,hueTimer=0;
function hueWanted(){const mode=Backgrounds.getMode();return hueMode==='auto'&&!document.hidden&&!document.body.classList.contains('mini-mode')&&mode!=='none'&&(mode!=='equalizer'||audioVisualActive())&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
function syncHueSchedule(){
  if(!hueWanted()){clearTimeout(hueTimer);hueTimer=0;return;}
  if(!hueTimer){lastHueTick=performance.now();hueTimer=setTimeout(tickAutoHue,66);}
}
function tickAutoHue(){
  hueTimer=0;if(!hueWanted())return;
  const now=performance.now();autoHue=(autoHue+.06*Math.min(100,now-lastHueTick)/16.7)%360;lastHueTick=now;
  bgCanvasEl.style.filter='hue-rotate('+autoHue+'deg)';
  hueTimer=setTimeout(tickAutoHue,66);
}
for(const ev of ['waveframe:audio-activity','waveframe:background-mode'])window.addEventListener(ev,syncHueSchedule);
document.addEventListener('visibilitychange',syncHueSchedule);
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',syncHueSchedule);

function restorePreferences() {
  const lang = localStorage.getItem('waveframe.lang') || 'el';
  setLanguage(lang);
  syncLangActiveCard();

  applySkin(localStorage.getItem('waveframe.skin') || 'midnight');
  applyLayout(localStorage.getItem('waveframe.layout') || 'default');
  applyBtnStyle(localStorage.getItem('waveframe.btnStyle') || 'rounded');
  const savedAccent = localStorage.getItem('waveframe.accentColor');
  if (savedAccent) {
    applyAccentColor(savedAccent);
    document.getElementById('accentColorPicker').value = savedAccent;
  }

  const bg = localStorage.getItem('waveframe.bg') || 'equalizer';
  Backgrounds.setMode(bg);
  [...els.bgGrid.children].forEach((b) => b.classList.toggle('active', b.dataset.bg === bg));

  hueSlider.value = localStorage.getItem('waveframe.hueValue') || '0';
  applyHueMode(localStorage.getItem('waveframe.hueMode') || 'auto');
}

window.addEventListener('waveframe:audio-graph-ready',()=>Backgrounds.setAnalyser(engine.analyser,new Uint8Array(engine.analyser.frequencyBinCount)));

/* ------------------------------------------------------------------ */
/* Tutorial                                                            */
/* ------------------------------------------------------------------ */

const TUTORIAL_SLIDES = [
  { icon: '👋', key: 's1' },
  { icon: '🎧', key: 's2' },
  { icon: '🎚️', key: 's3' },
  { icon: '⬇️', key: 's4' },
  { icon: '✨', key: 's5' },
];
let tutorialIndex = 0;
const tutorialOverlay = document.getElementById('tutorialOverlay');
const tutorialSlidesEl = document.getElementById('tutorialSlides');
const tutorialDotsEl = document.getElementById('tutorialDots');
const tutorialBack = document.getElementById('tutorialBack');
const tutorialNext = document.getElementById('tutorialNext');
const tutorialSkip = document.getElementById('tutorialSkip');

function renderTutorial() {
  tutorialSlidesEl.innerHTML = '';
  tutorialDotsEl.innerHTML = '';
  TUTORIAL_SLIDES.forEach((slide, i) => {
    const div = document.createElement('div');
    div.className = 'tutorial-slide' + (i === tutorialIndex ? ' active' : '');
    div.innerHTML = `<div class="tutorial-slide-icon">${slide.icon}</div><h3>${t(`tutorial.${slide.key}.title`)}</h3><p>${t(`tutorial.${slide.key}.desc`)}</p>`;
    tutorialSlidesEl.appendChild(div);

    const dot = document.createElement('div');
    dot.className = 'tutorial-dot' + (i === tutorialIndex ? ' active' : '');
    tutorialDotsEl.appendChild(dot);
  });
  tutorialBack.style.visibility = tutorialIndex === 0 ? 'hidden' : 'visible';
  tutorialNext.textContent = tutorialIndex === TUTORIAL_SLIDES.length - 1 ? t('tutorial.finish') : t('tutorial.next');
}
function openTutorial() {
  tutorialIndex = 0;
  renderTutorial();
  tutorialOverlay.classList.add('open');
}
function closeTutorial() {
  tutorialOverlay.classList.remove('open');
  localStorage.setItem('waveframe.tutorialSeen', '1');
}
tutorialNext.addEventListener('click', () => {
  if (tutorialIndex === TUTORIAL_SLIDES.length - 1) { closeTutorial(); return; }
  tutorialIndex++;
  renderTutorial();
});
tutorialBack.addEventListener('click', () => {
  if (tutorialIndex === 0) return;
  tutorialIndex--;
  renderTutorial();
});
tutorialSkip.addEventListener('click', closeTutorial);
els.btnShowTutorial.addEventListener('click', () => window.waveframe.openWelcome());
document.getElementById('btnOpenFamily').addEventListener('click', () => window.waveframe.openFamily());
document.addEventListener('waveframe:language-changed', () => { if (tutorialOverlay.classList.contains('open')) renderTutorial(); });

/* ---- Backup & Cloud Sync ---- */
function collectBackupData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('waveframe.')) data[key] = localStorage.getItem(key);
  }
  return data;
}
els.btnBackupExport.addEventListener('click', async () => {
  const result = await window.waveframe.exportSettings(collectBackupData());
  if (result.canceled) return;
  els.backupStatus.textContent = result.ok ? t('settings.backupExportOk') : (result.error || t('settings.backupError'));
});
els.btnBackupImport.addEventListener('click', async () => {
  const result = await window.waveframe.importSettings();
  if (result.canceled) return;
  if (!result.ok) { els.backupStatus.textContent = result.error || t('settings.backupError'); return; }
  // a backup file is untrusted input: it must be a plain object and only waveframe.* string values are restored
  const data = result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data : null;
  if (!data) { els.backupStatus.textContent = t('settings.backupError'); return; }
  Object.entries(data).forEach(([key, value]) => {
    if (key.startsWith('waveframe.') && typeof value === 'string' && value.length < 5 * 1024 * 1024) localStorage.setItem(key, value);
  });
  await showAlertDialog(t('settings.backupImportTitle'), t('settings.backupImportDone'));
  location.reload();
});

/* ------------------------------------------------------------------ */
/* Visualizer                                                          */
/* ------------------------------------------------------------------ */

const VIS_MODES = [
  { key: 'none', icon: '🖼️', label: 'Album Art' },
  { key: 'bars', icon: '📊', label: 'Bars' },
  { key: 'wave', icon: '〜', label: 'Oscilloscope' },
  { key: 'circular', icon: '◎', label: 'Radial Spectrum' },
  { key: 'mirrorBars', icon: '🪞', label: 'Mirror Bars' },
  { key: 'dualWave', icon: '≈', label: 'Dual Wave' },
  { key: 'particles', icon: '✨', label: 'Particles' },
  { key: 'starfield', icon: '✦', label: 'Starfield' },
  { key: 'tunnel', icon: '🌀', label: 'Tunnel' },
  { key: 'spiral', icon: '🐚', label: 'Spiral' },
  { key: 'battery', icon: '▤', label: 'Battery Bars' },
  { key: 'plasma', icon: '🔮', label: 'Plasma Blobs' },
  { key: 'fireworks', icon: '🎆', label: 'Fireworks' },
  { key: 'ribbon', icon: '🎗️', label: 'Ribbon' },
  { key: 'kaleidoscope', icon: '🔷', label: 'Kaleidoscope' },
  { key: 'rain', icon: '🌧️', label: 'Rain' },
  { key: 'pulseRings', icon: '⭕', label: 'Pulse Rings' },
  { key: 'gridWave', icon: '⛰️', label: 'Grid Wave' },
  { key: 'vortex', icon: '🌪️', label: 'Vortex' },
  { key: 'sunburst', icon: '☀️', label: 'Sunburst' },
  { key: 'bubbles', icon: '🫧', label: 'Bubbles' },
];

let visMode = localStorage.getItem('waveframe.visMode') || 'bars';
let prevVisMode = null;
let particles = [];

const canvas = els.visualizer;
const vctx = canvas.getContext('2d');
const freqData = new Uint8Array(1024);
const timeData = new Uint8Array(1024);
const visualizerWrap = document.getElementById('visualizerWrap');
const visAlbumArt = document.getElementById('visAlbumArt');
const visAlbumArtImg = document.getElementById('visAlbumArtImg');
const visPickerGrid = document.getElementById('visPickerGrid');
const btnVisPicker = document.getElementById('btnVisPicker');

function syncVisAlbumArt(picture) {
  if (picture) { visAlbumArtImg.src = picture; visAlbumArt.classList.add('has-art'); }
  else { visAlbumArtImg.removeAttribute('src'); visAlbumArt.classList.remove('has-art'); }
}

VIS_MODES.forEach((m) => {
  const card = document.createElement('button');
  card.className = 'vis-picker-card' + (m.key === visMode ? ' active' : '');
  card.dataset.mode = m.key;
  card.innerHTML = `<span class="vis-picker-icon">${m.icon}</span><span>${m.label}</span>`;
  visPickerGrid.appendChild(card);
});
visualizerWrap.classList.toggle('mode-none', visMode === 'none');
visPickerGrid.addEventListener('click', (e) => {
  const card = e.target.closest('.vis-picker-card');
  if (!card) return;
  visMode = card.dataset.mode;
  window.dispatchEvent(new Event('waveframe:visual-changed'));
  OpsisFeatureGuide.setIfChanged(localStorage,'waveframe.visMode', visMode);
  [...visPickerGrid.children].forEach((c) => c.classList.toggle('active', c === card));
  visualizerWrap.classList.toggle('mode-none', visMode === 'none');
});
btnVisPicker.addEventListener('click', () => visPickerGrid.classList.toggle('dep-hidden'));

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  const width=Math.round(rect.width*devicePixelRatio),height=Math.round(rect.height*devicePixelRatio);
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  window.dispatchEvent(new Event('waveframe:visual-changed'));
}
setTimeout(resizeCanvas, 0);
window.addEventListener('resize', resizeCanvas);

function bandAvg(from, to) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += freqData[i];
  return sum / ((to - from) * 255);
}

function drawBars() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  const barCount = 64;
  const step = Math.floor(freqData.length / barCount);
  const barWidth = w / barCount;
  const grad = vctx.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, '#6366f1');
  grad.addColorStop(1, '#c084fc');
  vctx.fillStyle = grad;
  for (let i = 0; i < barCount; i++) {
    const v = freqData[i * step] / 255;
    const barH = v * h;
    vctx.fillRect(i * barWidth + 1, h - barH, barWidth - 2, barH);
  }
}
function drawWave() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  vctx.lineWidth = 2 * devicePixelRatio;
  vctx.strokeStyle = '#a78bfa';
  vctx.beginPath();
  const step = w / timeData.length;
  for (let i = 0; i < timeData.length; i++) {
    const v = timeData[i] / 128 - 1;
    const y = h / 2 + v * h * 0.45;
    if (i === 0) vctx.moveTo(0, y); else vctx.lineTo(i * step, y);
  }
  vctx.stroke();
}
function drawCircular() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const baseR = Math.min(w, h) * 0.18;
  const bars = 90;
  vctx.strokeStyle = '#8b7cf6';
  vctx.lineWidth = 3 * devicePixelRatio;
  for (let i = 0; i < bars; i++) {
    const v = freqData[Math.floor((i / bars) * freqData.length)] / 255;
    const angle = (i / bars) * Math.PI * 2;
    const r1 = baseR;
    const r2 = baseR + v * (Math.min(w, h) * 0.35);
    vctx.beginPath();
    vctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
    vctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
    vctx.stroke();
  }
}
function drawMirrorBars() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  const barCount = 48;
  const step = Math.floor(freqData.length / barCount);
  const barWidth = w / barCount;
  const grad = vctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#c084fc'); grad.addColorStop(0.5, '#6366f1'); grad.addColorStop(1, '#c084fc');
  vctx.fillStyle = grad;
  for (let i = 0; i < barCount; i++) {
    const v = freqData[i * step] / 255;
    const barH = v * h * 0.45;
    vctx.fillRect(i * barWidth + 1, h / 2 - barH, barWidth - 2, barH * 2);
  }
}
function drawDualWave() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  const step = w / timeData.length;
  vctx.lineWidth = 2 * devicePixelRatio;
  [{ color: '#a78bfa', scale: 0.4, offset: 0 }, { color: 'rgba(192,132,252,0.6)', scale: 0.28, offset: 10 }].forEach((layer) => {
    vctx.strokeStyle = layer.color;
    vctx.beginPath();
    for (let i = 0; i < timeData.length; i++) {
      const v = timeData[i] / 128 - 1;
      const y = h / 2 + v * h * layer.scale + layer.offset;
      if (i === 0) vctx.moveTo(0, y); else vctx.lineTo(i * step, y);
    }
    vctx.stroke();
  });
}
function drawParticles() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  const bass = bandAvg(0, 16);
  if (Math.random() < 0.15 + bass * 0.5) {
    particles.push({ x: Math.random() * w, y: h, vy: -(1 + bass * 4) * devicePixelRatio, r: (2 + bass * 4) * devicePixelRatio, life: 1 });
  }
  particles.forEach((p) => { p.y += p.vy; p.life -= 0.01; });
  particles = particles.filter((p) => p.life > 0 && p.y > -20);
  vctx.fillStyle = '#c084fc';
  particles.forEach((p) => {
    vctx.globalAlpha = Math.max(0, p.life);
    vctx.beginPath(); vctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); vctx.fill();
  });
  vctx.globalAlpha = 1;
}
function drawStarfield() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const treble = bandAvg(freqData.length - 32, freqData.length);
  if (particles.length < 120) particles.push({ a: Math.random() * Math.PI * 2, r: 0, speed: 1 + Math.random() * 2 });
  particles.forEach((p) => { p.r += p.speed * (1 + treble * 3); });
  particles = particles.filter((p) => p.r < Math.max(w, h));
  vctx.fillStyle = '#e9d5ff';
  particles.forEach((p) => {
    const x = cx + Math.cos(p.a) * p.r, y = cy + Math.sin(p.a) * p.r;
    vctx.beginPath(); vctx.arc(x, y, 1.5 * devicePixelRatio, 0, Math.PI * 2); vctx.fill();
  });
}
let tunnelT = 0;
function drawTunnel() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  tunnelT += 0.02;
  const rings = 10;
  for (let i = 0; i < rings; i++) {
    const v = freqData[Math.floor((i / rings) * freqData.length)] / 255;
    const r = (i / rings) * Math.min(w, h) * 0.5 + v * 20;
    vctx.strokeStyle = `rgba(139,124,246,${0.15 + v * 0.5})`;
    vctx.lineWidth = 2 * devicePixelRatio;
    vctx.beginPath();
    vctx.arc(cx, cy, r, tunnelT + i, tunnelT + i + Math.PI * 1.5);
    vctx.stroke();
  }
}
let spiralT = 0;
function drawSpiral() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  spiralT += 0.015;
  const n = 80;
  vctx.fillStyle = '#a78bfa';
  for (let i = 0; i < n; i++) {
    const v = freqData[Math.floor((i / n) * freqData.length)] / 255;
    const angle = i * 0.35 + spiralT;
    const r = (i / n) * Math.min(w, h) * 0.48;
    const x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
    vctx.beginPath(); vctx.arc(x, y, (1.5 + v * 3) * devicePixelRatio, 0, Math.PI * 2); vctx.fill();
  }
}
function drawBattery() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  const cols = 32, rows = 12;
  const cw = w / cols, ch = h / rows;
  for (let c = 0; c < cols; c++) {
    const v = freqData[Math.floor((c / cols) * freqData.length)] / 255;
    const lit = Math.round(v * rows);
    for (let r = 0; r < rows; r++) {
      if (r < rows - lit) continue;
      vctx.fillStyle = r < rows * 0.25 ? '#ef4444' : r < rows * 0.5 ? '#f97316' : '#6366f1';
      vctx.fillRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2);
    }
  }
}
let plasmaT = 0;
function drawPlasma() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  plasmaT += 0.02;
  const bass = bandAvg(0, 16);
  const mid = bandAvg(16, 64);
  const blobs = [
    { x: w * (0.3 + Math.sin(plasmaT) * 0.1), y: h * 0.5, r: 60 + bass * 100, color: '#6366f1' },
    { x: w * (0.7 + Math.cos(plasmaT * 1.3) * 0.1), y: h * 0.5, r: 50 + mid * 90, color: '#c084fc' },
  ];
  blobs.forEach((b) => {
    const grad = vctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * devicePixelRatio);
    grad.addColorStop(0, b.color); grad.addColorStop(1, 'transparent');
    vctx.globalAlpha = 0.55; vctx.fillStyle = grad;
    vctx.fillRect(0, 0, w, h);
  });
  vctx.globalAlpha = 1;
}
let lastBassPeak = 0;
function drawFireworks() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  const bass = bandAvg(0, 12);
  const now = performance.now();
  if (bass > 0.62 && now - lastBassPeak > 260) {
    lastBassPeak = now;
    const cx = Math.random() * w, cy = h * (0.25 + Math.random() * 0.3);
    const hue = Math.floor(Math.random() * 360);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      particles.push({ x: cx, y: cy, vx: Math.cos(a) * (2 + Math.random() * 2), vy: Math.sin(a) * (2 + Math.random() * 2), life: 1, hue });
    }
  }
  particles.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.life -= 0.015; });
  particles = particles.filter((p) => p.life > 0);
  particles.forEach((p) => {
    vctx.globalAlpha = Math.max(0, p.life);
    vctx.fillStyle = `hsl(${p.hue}, 85%, 65%)`;
    vctx.beginPath(); vctx.arc(p.x, p.y, 2 * devicePixelRatio, 0, Math.PI * 2); vctx.fill();
  });
  vctx.globalAlpha = 1;
}
let ribbonT = 0;
function drawRibbon() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  ribbonT += 0.03;
  const vol = bandAvg(0, freqData.length);
  vctx.strokeStyle = '#8b7cf6';
  vctx.lineWidth = (4 + vol * 22) * devicePixelRatio;
  vctx.lineCap = 'round';
  vctx.beginPath();
  for (let x = 0; x <= w; x += 6) {
    const y = h / 2 + Math.sin(x * 0.01 + ribbonT) * h * 0.22 * (0.4 + vol);
    if (x === 0) vctx.moveTo(x, y); else vctx.lineTo(x, y);
  }
  vctx.stroke();
}
function drawKaleidoscope() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const segments = 8, n = 40;
  for (let s = 0; s < segments; s++) {
    vctx.save();
    vctx.translate(cx, cy);
    vctx.rotate((s / segments) * Math.PI * 2);
    vctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = freqData[Math.floor((i / n) * freqData.length)] / 255;
      const r = (i / n) * Math.min(w, h) * 0.5;
      const x = r, y = Math.sin(i * 0.5) * v * 30;
      if (i === 0) vctx.moveTo(x, y); else vctx.lineTo(x, y);
    }
    vctx.strokeStyle = 'rgba(192,132,252,0.6)';
    vctx.lineWidth = 2 * devicePixelRatio;
    vctx.stroke();
    vctx.restore();
  }
}
function drawRain() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  const vol = bandAvg(0, freqData.length);
  if (particles.length < 200 && Math.random() < 0.3 + vol * 0.6) {
    particles.push({ x: Math.random() * w, y: -10, vy: (4 + Math.random() * 5) * devicePixelRatio, len: (10 + Math.random() * 20) * devicePixelRatio });
  }
  particles.forEach((p) => { p.y += p.vy; });
  particles = particles.filter((p) => p.y - p.len < h);
  vctx.strokeStyle = 'rgba(139,124,246,0.55)';
  vctx.lineWidth = 1.5 * devicePixelRatio;
  particles.forEach((p) => {
    vctx.beginPath(); vctx.moveTo(p.x, p.y - p.len); vctx.lineTo(p.x, p.y); vctx.stroke();
  });
}
let lastRingPeak = 0;
function drawPulseRings() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const bass = bandAvg(0, 12);
  const now = performance.now();
  if (bass > 0.55 && now - lastRingPeak > 200) {
    lastRingPeak = now;
    particles.push({ r: 10, life: 1 });
  }
  particles.forEach((p) => { p.r += 4 * devicePixelRatio; p.life -= 0.02; });
  particles = particles.filter((p) => p.life > 0);
  particles.forEach((p) => {
    vctx.globalAlpha = Math.max(0, p.life);
    vctx.strokeStyle = '#c084fc';
    vctx.lineWidth = 3 * devicePixelRatio;
    vctx.beginPath(); vctx.arc(cx, cy, p.r, 0, Math.PI * 2); vctx.stroke();
  });
  vctx.globalAlpha = 1;
}
let gridT = 0;
function drawGridWave() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  gridT += 0.05;
  const cols = 24;
  vctx.strokeStyle = 'rgba(99,102,241,0.5)';
  vctx.lineWidth = 1.5 * devicePixelRatio;
  for (let row = 0; row < 5; row++) {
    vctx.beginPath();
    for (let c = 0; c <= cols; c++) {
      const v = freqData[Math.floor((c / cols) * freqData.length)] / 255;
      const x = (c / cols) * w;
      const y = h * (0.3 + row * 0.15) - v * 40 * devicePixelRatio - row * 10 + Math.sin(gridT + c * 0.3) * 4;
      if (c === 0) vctx.moveTo(x, y); else vctx.lineTo(x, y);
    }
    vctx.stroke();
  }
}
function drawVortex() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const treble = bandAvg(freqData.length - 32, freqData.length);
  if (particles.length < 100) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.min(w, h) * 0.5;
    particles.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, a, r });
  }
  particles.forEach((p) => { p.r -= (1 + treble * 4) * devicePixelRatio; p.a += 0.05; p.x = cx + Math.cos(p.a) * p.r; p.y = cy + Math.sin(p.a) * p.r; });
  particles = particles.filter((p) => p.r > 4);
  vctx.fillStyle = '#e9d5ff';
  particles.forEach((p) => { vctx.beginPath(); vctx.arc(p.x, p.y, 2 * devicePixelRatio, 0, Math.PI * 2); vctx.fill(); });
}
function drawSunburst() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const n = 48;
  for (let i = 0; i < n; i++) {
    const v = freqData[Math.floor((i / n) * freqData.length)] / 255;
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.8) / n) * Math.PI * 2;
    const r = Math.min(w, h) * 0.12 + v * Math.min(w, h) * 0.38;
    vctx.beginPath();
    vctx.moveTo(cx, cy);
    vctx.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    vctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    vctx.closePath();
    vctx.fillStyle = `hsla(${260 - v * 60}, 70%, 65%, 0.5)`;
    vctx.fill();
  }
}
function drawBubbles() {
  const w = canvas.width, h = canvas.height;
  vctx.clearRect(0, 0, w, h);
  const mid = bandAvg(16, 64);
  if (particles.length < 60 && Math.random() < 0.1 + mid * 0.3) {
    particles.push({ x: Math.random() * w, y: h + 10, r: (4 + Math.random() * 16) * devicePixelRatio, vy: -(0.5 + Math.random() * 1.5) * devicePixelRatio });
  }
  particles.forEach((p) => { p.y += p.vy; });
  particles = particles.filter((p) => p.y + p.r > 0);
  vctx.strokeStyle = 'rgba(167,139,250,0.7)';
  vctx.lineWidth = 1.5 * devicePixelRatio;
  particles.forEach((p) => { vctx.beginPath(); vctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); vctx.stroke(); });
}

const VIS_DRAW = {
  bars: drawBars, wave: drawWave, circular: drawCircular, mirrorBars: drawMirrorBars,
  dualWave: drawDualWave, particles: drawParticles, starfield: drawStarfield, tunnel: drawTunnel,
  spiral: drawSpiral, battery: drawBattery, plasma: drawPlasma, fireworks: drawFireworks,
  ribbon: drawRibbon, kaleidoscope: drawKaleidoscope, rain: drawRain, pulseRings: drawPulseRings,
  gridWave: drawGridWave, vortex: drawVortex, sunburst: drawSunburst, bubbles: drawBubbles,
};

const meterBars = els.miniMeter ? Array.from(els.miniMeter.children) : [];
function updateMiniMeter() {
  if (!meterBars.length) return;
  let sum = 0;
  for (let i = 0; i < 48; i++) sum += freqData[i];
  const level = sum / (48 * 255);
  meterBars.forEach((bar, i) => {
    const threshold = (i + 1) / meterBars.length;
    bar.classList.toggle('lit', level >= threshold * 0.85);
  });
}
const tabPlayerEl = document.getElementById('tab-player');
let lastVisualFrame=0,visualFrameId=0,visualDirty=true;
const enhanceTabEl=document.getElementById('tab-enhance');
function visibleVisualizer(){return (tabPlayerEl.classList.contains('active')||document.body.classList.contains('mini-mode'))&&visMode!=='none';}
function visibleMeter(){return meterBars.length>0&&enhanceTabEl.classList.contains('active')&&!document.body.classList.contains('mini-mode');}
function scheduleVisual(){if(!visualFrameId&&!document.hidden&&(visibleVisualizer()||visibleMeter()))visualFrameId=requestAnimationFrame(renderLoop);}
function invalidateVisual(){
  visualDirty=true;
  const active=audioVisualActive();Backgrounds.setAudioActive(active);
  if(document.hidden||!(visibleVisualizer()||visibleMeter())){if(visualFrameId)cancelAnimationFrame(visualFrameId);visualFrameId=0;return;}
  scheduleVisual();
}
function renderLoop(now=performance.now()){
  visualFrameId=0;if(document.hidden)return;
  const active=audioVisualActive(),vis=visibleVisualizer(),meter=visibleMeter();
  if(!vis&&!meter)return;
  if(visualDirty||(active&&now-lastVisualFrame>=32)){
    lastVisualFrame=now;visualDirty=false;
    if(active&&engine.analyser){engine.analyser.getByteFrequencyData(freqData);if(vis)engine.analyser.getByteTimeDomainData(timeData);}
    else{freqData.fill(0);timeData.fill(128);}
    if(vis){if(visMode!==prevVisMode||!active){particles=[];prevVisMode=visMode;}(VIS_DRAW[visMode]||drawBars)();}
    if(meter)updateMiniMeter();
  }
  if(active)scheduleVisual();
}
for(const ev of ['waveframe:audio-activity','waveframe:visual-changed'])window.addEventListener(ev,invalidateVisual);
document.addEventListener('visibilitychange',invalidateVisual);
const visualObserver=new MutationObserver(invalidateVisual);
for(const node of [tabPlayerEl,enhanceTabEl,document.body])visualObserver.observe(node,{attributes:true,attributeFilter:['class']});
invalidateVisual();

/* ------------------------------------------------------------------ */
/* Dependencies (FFmpeg)                                              */
/* ------------------------------------------------------------------ */

const depFfmpegStatus = document.getElementById('depFfmpegStatus');
const btnInstallDeps = document.getElementById('btnInstallDeps');
const depsProgress = document.getElementById('depsProgress');

let depsCheckPending=null;
async function refreshDepsStatus() {
  if(!depsCheckPending)depsCheckPending=window.waveframe.checkDeps().catch(()=>null).finally(()=>{depsCheckPending=null;});
  const status = await depsCheckPending;
  if(!status?.ffmpeg)return;
  const ok = status.ffmpeg.ok;
  depFfmpegStatus.textContent = ok ? t('settings.depsOk') : t('settings.depsMissing');
  depFfmpegStatus.className = 'dep-status ' + (ok ? 'ok' : 'missing');
  btnInstallDeps.style.display = ok ? 'none' : 'inline-block';
}

window.waveframe.onDepsProgress(({ phase, pct }) => {
  if (phase === 'download') depsProgress.textContent = t('settings.depsDownloading') + Math.round(pct * 100) + '%';
  else if (phase === 'extract') depsProgress.textContent = t('settings.depsExtracting');
  else if (phase === 'done') depsProgress.textContent = t('settings.depsDone');
});

btnInstallDeps.addEventListener('click', async () => {
  btnInstallDeps.disabled = true;
  depsProgress.textContent = t('settings.depsDownloading') + '0%';
  try {
    const result = await window.waveframe.installDeps();
    if (result.ok) await refreshDepsStatus();
    else depsProgress.textContent = result.cancelled ? '' : t('settings.depsError') + result.error;
  } catch (err) {
    depsProgress.textContent = t('settings.depsError') + err.message;
  } finally {
    btnInstallDeps.disabled = false;
  }
});

document.addEventListener('waveframe:language-changed',()=>{if(document.querySelector('.tab-btn.active')?.dataset.tab==='settings')void refreshDepsStatus();});

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

renderPresetGrid();
renderUserPresets();
restorePreferences();
restorePlaylist();
updateTrackNameUi();

window.waveframe.onMediaKey((action) => {
  if (action === 'playpause') { if (currentTrackIndex === -1 && playlist.length > 0) playTrackAt(0); else engine.togglePlay().then(syncPlayButton); }
  else if (action === 'next') goNext();
  else if (action === 'prev') goPrev();
  else if (action === 'stop') { engine.pauseActive();engine.stopAlternateSources();syncPlayButton(); }
});

/* ---- Taskbar thumbnail toolbar icons (drawn on a canvas, no image assets needed) ---- */
function drawThumbIcon(draw) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1a1a1a';
  draw(ctx);
  return c.toDataURL('image/png');
}
window.waveframe?.setThumbbarIcons?.({
  prev: drawThumbIcon((ctx) => {
    ctx.fillRect(8, 8, 3, 16);
    ctx.beginPath(); ctx.moveTo(24, 8); ctx.lineTo(24, 24); ctx.lineTo(13, 16); ctx.closePath(); ctx.fill();
  }),
  next: drawThumbIcon((ctx) => {
    ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(8, 24); ctx.lineTo(19, 16); ctx.closePath(); ctx.fill();
    ctx.fillRect(21, 8, 3, 16);
  }),
  play: drawThumbIcon((ctx) => {
    ctx.beginPath(); ctx.moveTo(10, 7); ctx.lineTo(10, 25); ctx.lineTo(25, 16); ctx.closePath(); ctx.fill();
  }),
  pause: drawThumbIcon((ctx) => {
    ctx.fillRect(9, 7, 5, 18);
    ctx.fillRect(18, 7, 5, 18);
  }),
});

// First-run guidance is the welcome splash (main process, once per major.minor version); the old in-page tutorial is no longer auto-opened.


/* ---- renderer self-test: `WAVEFRAME_SELFTEST=1 npm start` runs this inside the real Electron renderer and prints the result ---- */
window.__selfTest = async function () {
  const out = [];
  const check = (name, ok, extra) => out.push({ name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });
  try {
    check('cold renderer does not initialize live audio',engine.ctx===null&&!engine.analyser);
    engine.setVolume(.65);engine.setBassBoost(3);
    check('inactive audio settings retain state without allocating device',engine.ctx===null&&engine.state.volume===.65&&engine.state.bassBoost===3);
    engine.ensureGraph();
    check('first audio use allocates real graph and retains settings',!!engine.ctx&&!!engine.analyser&&engine.state.bassBoost===3);
    engine.setVolume(.8);engine.setBassBoost(0);
    // Exercise the real transition methods without opening an audio device.
    const fake=Object.create(AudioEngine.prototype);
    const makeSlot=()=>({el:{paused:false,pause(){this.paused=true;},play(){this.paused=false;return new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});}},gain:{gain:{cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){}}}});
    Object.assign(fake,{slots:[makeSlot(),makeSlot()],activeSlot:0,crossfadeSeconds:1,transitionEpoch:0,transitionTimer:null,pendingTransition:null,ctx:{currentTime:0},state:{tempo:1,preservePitch:true},resume(){}});
    let committed=0,rejected=0;
    const ready=(_,ok)=>ok?committed++:rejected++;
    fake.switchTrack(()=>{},ready);const stale=fake.slots[1].el.resolve;
    fake.switchTrack(()=>{},ready);stale();await Promise.resolve();
    check('superseded crossfade cannot commit',fake.activeSlot===0&&committed===0);
    fake.slots[1].el.reject();await Promise.resolve();
    check('rejected crossfade keeps previous slot',fake.activeSlot===0&&rejected===1);
    fake.switchTrack(()=>{},ready);fake.slots[1].el.resolve();await Promise.resolve();
    check('successful crossfade commits only once',fake.activeSlot===1&&committed===1&&fake.transitionTimer!==null);
    fake.pauseActive();
    check('pause cancels crossfade timer and both slots',fake.transitionTimer===null&&fake.slots.every(s=>s.el.paused));
    fake.crossfadeSeconds=0;let direct=[];
    fake.switchTrack(()=>{},(_,ok)=>direct.push(ok));
    check('direct playback waits for play promise',direct.length===0&&!!fake.pendingTransition);
    fake.slots[fake.activeSlot].el.reject();await Promise.resolve();
    check('direct playback reports rejected play',direct.length===1&&direct[0]===false&&!fake.pendingTransition);
    fake.switchTrack(()=>{},(_,ok)=>direct.push(ok));const staleDirect=fake.slots[fake.activeSlot].el.resolve;
    fake.switchTrack(()=>{},(_,ok)=>direct.push(ok));staleDirect();await Promise.resolve();
    check('superseded direct playback cannot commit',direct.length===1);
    fake.slots[fake.activeSlot].el.resolve();await Promise.resolve();
    check('confirmed direct playback commits once',direct.length===2&&direct[1]===true&&!fake.pendingTransition);
    fake.pauseActive();
    check('disabled effects defer heavy initialization',!engine.reverbNode.buffer&&!engine.exciterNode.curve);
    check('audiolib loaded', typeof WaveframeAudio === 'object' && typeof WaveframeAudio.integratedLufs === 'function');
    engine.setPresence(100);engine.setBalance(-50);syncProfessionalFx();
    const response=new Float32Array(1),phase=new Float32Array(1);const testFilter=new OfflineAudioContext(2,480,48000).createBiquadFilter();
    const pp=WaveframeAudio.presenceParams(engine.state.presence);testFilter.type='peaking';testFilter.frequency.value=pp.frequency;testFilter.Q.value=pp.q;testFilter.gain.value=pp.gain;testFilter.getFrequencyResponse(new Float32Array([2800]),response,phase);
    check('presence filter boosts 2.8kHz by 6dB',Math.abs(20*Math.log10(response[0])-6)<.1);
    check('stereo balance setting reaches engine',engine.state.balance===-50);
    engine.setCompressorMode('night');syncProfessionalFx();check('night compressor profile selected',engine.state.compressorMode==='night'&&document.getElementById('fxCompressorMode').value==='night');engine.setCompressorMode('standard');syncProfessionalFx();
    const rv=document.getElementById('fx_reverbAmount'),ex=document.getElementById('fx_exciterAmount');
    rv.value='35';rv.dispatchEvent(new Event('input'));ex.value='60';ex.dispatchEvent(new Event('input'));
    check('adjustable reverb/exciter mix controls update DSP state',engine.state.reverbAmount===35&&engine.state.exciterAmount===60&&document.getElementById('fx_reverbValue').textContent==='35%');
    engine.setEffectAmount('reverb',100);engine.setEffectAmount('exciter',100);
    engine.setPresence(0);engine.setBalance(0);syncProfessionalFx();
    // Real renderer: navigate through the finder without triggering file dialogs or changes.
    showTab('player');document.getElementById('featureGuideQuick').click();
    const finder=document.getElementById('featureGuideQuery'),group=document.getElementById('featureGuideGroup');
    check('finder opens with active tab filter',group.value==='player'&&document.getElementById('tab-settings').classList.contains('active'));
    finder.value='MusicBrainz';finder.dispatchEvent(new Event('input'));
    const matches=document.querySelectorAll('#featureGuideResults button');
    check('finder locates metadata control',matches.length===1);
    if(matches.length===1)matches[0].click();
    check('finder opens playlist without executing metadata action',document.getElementById('tab-player').classList.contains('active')&&document.getElementById('playlistDrawer').classList.contains('open'));
    document.getElementById('playlistDrawer').classList.remove('open');
    check('sleep button present', !!document.getElementById('btnSleep'));
    check('export button present', !!document.getElementById('btnExportApo'));
    check('loudness panel present', !!document.getElementById('loudnessInfo'));
    // loudness through a REAL decoded AudioBuffer: stereo 997 Hz sine at -23 dBFS must read -23 LUFS and need +5 dB to reach -18
    const fs = 48000, ctx = new OfflineAudioContext(2, fs * 6, fs);
    const buf = ctx.createBuffer(2, fs * 6, fs);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.pow(10, -23 / 20) * Math.sin(2 * Math.PI * 997 * i / fs); }
    const m = measureLoudness(buf);
    check('measureLoudness on an AudioBuffer', Math.abs(m.lufs + 23) < 0.15 && Math.abs(m.gainDb - 5) < 0.15, `${m.lufs.toFixed(2)} LUFS, gain ${m.gainDb.toFixed(2)} dB`);
    // sleep timer cycle
    setSleepStep(1); check('sleep timer arms (15 min)', SLEEP_STEPS[sleepStep] === 15 && !!sleepTick && document.getElementById('btnSleep').classList.contains('active'));
    setSleepStep(0); check('sleep timer disarms and restores volume', !sleepTick && engine.sleepFactor === 1);
    setSleepStep(6); check('sleep "end of track" mode', SLEEP_STEPS[sleepStep] === 'end' && sleepWantsStopAtEnd() === true);
    // EQ export of the live engine state
    engine.applyEqBands([6, 5, 3, 1, 0, 0, 1, 2, 3, 4]);
    const txt = WaveframeAudio.toEqualizerApo({ bands: [...engine.state.eqBands], bassBoost: engine.state.bassBoost });
    check('EQ export reflects the engine', /Preamp: -6\.0 dB/.test(txt) && /Fc 32 Hz Gain 6\.0/.test(txt), txt.split('\r\n')[1]);
    engine.applyEqBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    // #7: switches are real switches whose initial state comes from the engine
    const sws = ['swMasterEnable', 'swNormalize', 'swPreservePitch', 'swCompressor', 'swReverb', 'swExciter', 'swTrackNotif', 'swAutostart'].map((id) => document.getElementById(id));
    check('switches expose role=switch and aria-checked', sws.every((b) => b && b.getAttribute('role') === 'switch' && /^(true|false)$/.test(b.getAttribute('aria-checked'))));
    check('switch initial states mirror the engine', document.getElementById('swMasterEnable').classList.contains('active') === engine.state.masterEnabled && document.getElementById('swPreservePitch').classList.contains('active') === engine.state.preservePitch && document.getElementById('swNormalize').classList.contains('active') === engine.state.normalizationEnabled);
    els.swReverb.click();
    await new Promise((r) => setTimeout(r, 0)); // MutationObserver callbacks run as microtasks
    check('aria-checked follows a click', els.swReverb.getAttribute('aria-checked') === 'true' && engine.state.reverb === true);
    check('enabling reverb allocates impulse on demand',!!engine.reverbNode.buffer);
    // #8: "reset effects" also closes compressor / reverb / exciter
    els.swCompressor.click(); els.swExciter.click();
    check('enabling exciter initializes curve on demand',!!engine.exciterNode.curve&&engine.exciterNode.oversample==='4x');
    els.btnResetFx.click();
    await new Promise((r) => setTimeout(r, 0));
    check('reset effects turns compressor, reverb and exciter off (engine and UI)', !engine.state.compressor && !engine.state.reverb && !engine.state.exciter && [els.swCompressor, els.swReverb, els.swExciter].every((b) => !b.classList.contains('active') && b.getAttribute('aria-checked') === 'false'));
    // bug audit: names from files / backups are text, never markup
    const savedList = playlist, savedIdx = currentTrackIndex;
    playlist = [{ name: '<b id="xss-probe">bold</b>', picture: '" onerror="1' }]; currentTrackIndex = -1;
    renderPlaylist();
    check('playlist names are rendered as text (no markup injection)', !document.getElementById('xss-probe') && els.playlist.textContent.includes('<b id="xss-probe">'));
    playlist = savedList; currentTrackIndex = savedIdx; renderPlaylist();
    check('i18n has the new keys', t('player.sleep') !== 'player.sleep' && t('enhance.exportApo') !== 'enhance.exportApo');
  } catch (e) { check('self-test threw', false, e && e.stack || e); }
  return out;
};


// Test-only soak, invoked by the isolated Electron CI profile after normal tests.
// Local generated media, muted playback, real DOM/transport. No external files.
window.__resourceSoak=async function(requestedCycles=20){
  const cycles=Math.max(20,Math.min(1200,Number.isInteger(requestedCycles)?requestedCycles:20));
  const out=[],check=(name,ok,extra='')=>out.push({name,ok:!!ok,extra:String(extra)});
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const until=async(fn,ms=2000)=>{const end=performance.now()+ms;while(performance.now()<end){if(fn())return true;await wait(50);}return !!fn();};
  const old={list:playlist,index:currentTrackIndex,crossfade:engine.crossfadeSeconds,normalize:engine.state.normalizationEnabled,muted:engine.state.muted,mediaMuted:engine.slots.map(s=>s.el.muted)};
  let completed=0,advancing=0,removed=0,transitions=0;const failures=[];
  try{
    window.WaveframeVideoPlayer?.parkForAudio();
    engine.pauseActive();engine.stopAlternateSources();engine.setMuted(true);engine.slots.forEach(s=>s.el.muted=true);
    setSleepStep(0);engine.setTempo(1);
    engine.setNormalizationEnabled(false);engine.setNormalizationGain(1);engine.crossfadeSeconds=.15;
    const rate=22050,n=rate*10;
    const samples=new Float32Array(n);for(let i=0;i<n;i++)samples[i]=.02*Math.sin(2*Math.PI*440*i/rate);
    const bytes=WaveframeConv.writeWav([samples],rate,16);
    const files=[new File([bytes],'soak-a.wav',{type:'audio/wav'}),new File([bytes],'soak-b.wav',{type:'audio/wav'})];
    playlist=[];currentTrackIndex=-1;renderPlaylist();
    showTab('player');
    for(let i=0;i<cycles;i++){
      const started=performance.now();
      if(!playlist.length)playlist.push(...files.map(file=>({file,name:file.name})));
      renderPlaylist(false);
      const index=i%playlist.length,item=playlist[index];
      playTrackAt(index);
      const confirmed=()=>{const slot=engine.slots[engine.activeSlot];return !engine.pendingTransition&&slot.item===item&&slot.objectUrl&&slot.el.currentSrc===slot.objectUrl&&!slot.el.paused&&slot.el.readyState>=2;};
      let before=null;
      if(await until(confirmed,3000)){
        transitions++;
        before=engine.activeEl.currentTime;
        if(await until(()=>confirmed()&&engine.activeEl.currentTime>before+.04,2500))advancing++;
        else if(failures.length<30)failures.push({cycle:i+1,before,after:engine.activeEl.currentTime,paused:engine.activeEl.paused,ready:engine.activeEl.readyState,network:engine.activeEl.networkState,ended:engine.activeEl.ended,ctx:engine.ctx.state,pending:!!engine.pendingTransition});
      }else if(failures.length<30)failures.push({cycle:i+1,reason:'not-confirmed',paused:engine.activeEl.paused,ready:engine.activeEl.readyState,ctx:engine.ctx.state,pending:!!engine.pendingTransition});
      showTab(i%2?'enhance':'settings');await wait(100);showTab('player');
      if(i%4===3){
        const idx=playlist.indexOf(item),button=els.playlist.children[idx]?.querySelector('.remove-track');
        if(button){button.click();if(engine.slots.every(s=>s.item!==item&&!((s.item===null)&&s.objectUrl)))removed++;}
      }
      completed++;
      await wait(Math.max(0,3000-(performance.now()-started)));
    }
    check('audio/tab soak completed',completed===cycles,completed+' cycles');
    check('real audio transitions settle on requested track',transitions===cycles,transitions+'/'+cycles);
    check('real playback time advances',advancing===cycles,advancing+'/'+cycles+(failures.length?' '+JSON.stringify(failures):''));
    check('removed audio sources release all slot references',removed===Math.floor(cycles/4),removed+'/'+Math.floor(cycles/4));
    check('metadata queue remains bounded',metadataQueue.diagnostics().peak<=64,JSON.stringify(metadataQueue.diagnostics()));
  }catch(e){check('audio soak threw',false,e?.stack||e);}
  finally{
    engine.pauseActive();engine.stopAlternateSources();
    for(const slot of engine.slots){slot.el.removeAttribute('src');slot.el.load();if(slot.objectUrl)URL.revokeObjectURL(slot.objectUrl);slot.objectUrl=null;slot.item=null;slot.name='';}
    check('audio soak final cleanup',engine.transitionTimer===null&&engine.slots.every(s=>s.el.paused&&!s.objectUrl&&!s.item));
    playlist=old.list;currentTrackIndex=old.index;engine.crossfadeSeconds=old.crossfade;engine.setNormalizationEnabled(old.normalize);engine.setMuted(old.muted);engine.slots.forEach((s,i)=>s.el.muted=old.mediaMuted[i]);renderPlaylist();updateTrackNameUi();syncPlayButton();
    const previousBg=Backgrounds.getMode();Backgrounds.setMode('equalizer');showTab('player');invalidateVisual();syncHueSchedule();
    await wait(350);
    check('idle equalizer, hue and visualizer stop scheduling frames',!audioVisualActive()&&!visualFrameId&&!hueTimer&&!Backgrounds.diagnostics().framePending);
    Backgrounds.setMode(previousBg);syncHueSchedule();
  }
  return out;
};

// Developer-page-only fixture exercises the actual AudioEngine methods with
// a real OfflineAudioContext because hosted VMs may lack audio endpoints.
window.__workletPlayerTest=async function(){
  const bytes=await window.waveframe.experimentalWorkletBytes();
  if(!(bytes instanceof Uint8Array))throw Error('developer capability missing');
  const ctx=new OfflineAudioContext(2,48000*3,48000);
  const x=Object.create(AudioEngine.prototype);
  const web=ctx.createGain(),dry=ctx.createGain(),wet=ctx.createGain(),sum=ctx.createGain();
  const norm=ctx.createGain(),source=ctx.createOscillator();source.frequency.value=1000;
  const amplitude=ctx.createGain();amplitude.gain.value=.025;source.connect(amplitude);amplitude.connect(norm);
  norm.connect(web);norm.connect(dry);web.connect(sum);dry.connect(sum);wet.connect(sum);sum.connect(ctx.destination);
  Object.assign(x,{ctx,normGain:norm,workletGain:wet,dspRouteGate:new OpsisDspRouting.RouteGate(ctx,{web,dry,worklet:wet}),state:{masterEnabled:true,routeBypass:false,eqBands:[0,0,0,0,0,6],bassBoost:0},workletNode:null,workletPreference:false,workletReady:false,workletEpoch:0,workletTimer:null,workletSent:''});
  // Construction readiness can be asynchronous until rendering begins.
  await ctx.audioWorklet.addModule('dsp-dev/processor.mjs');x.workletModuleLoaded=true;
  const compiled=await WebAssembly.compile(bytes);
  const enabled=x.enableExperimentalWorklet(bytes,compiled);
  const hold=ctx.suspend(.5).then(async()=>{
    if(!await enabled||x.dspRouteGate.target!=='worklet')throw Error('activation failed');
    return ctx.resume();
  });
  const fallback=ctx.suspend(2).then(()=>{
    // Exercise the real failover method; not a spontaneous device fault.
    x.disableExperimentalWorklet(true);
    if(x.dspRouteGate.target!=='web'||x.workletNode!==null)throw Error('fallback failed');
    return ctx.resume();
  });
  source.start();
  const rendered=await ctx.startRendering();await Promise.all([hold,fallback]);
  const data=rendered.getChannelData(0);
  function gain(start,end){let s=0;for(let i=start;i<end;i++)s+=data[i]**2;return 10*Math.log10(s/(end-start)/(.025*.025/2));}
  const active=gain(48000,72000),safe=gain(108000,132000);
  if(Math.abs(active-6)>.2||Math.abs(safe)>.2)throw Error('unexpected Player response '+active+'/'+safe);
  return {active,safe};
};
