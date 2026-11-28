'use strict';
// Video encoding engine (Opsis Media Suite step 1, 2.1.0): ffmpeg encoder detection, probing, thumbnails and the encode job with
// hardware -> software fallback, optional two-pass, cancel and cleanup. Electron-free (unit and real-transcode tests use it directly).
// Shares runFfmpeg / naming with the audio converter (conv-engine.js) so there is ONE ffmpeg mechanism; arguments are always arrays.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const L = require('./renderer/convlib.js');
const V = require('./renderer/vidlib.js');
const { runFfmpeg,publishOutput,ensureRunning } = require('./conv-engine.js');

const encoderCache = new Map(),encoderPending=new Map(),auxChildren=new Set();
let shuttingDown=false;
function beginShutdown(){shuttingDown=true;cancelAuxiliary();}
function activeAuxCount(){return auxChildren.size;}
function trackAux(child){auxChildren.add(child);child.once('close',()=>auxChildren.delete(child));child.once('error',()=>auxChildren.delete(child));}
function cancelAuxiliary(){for(const child of auxChildren)try{child.kill();}catch{}}


// Runs ffmpeg and returns ALL of stdout + stderr (capped at 1 MB): the encoder list is longer than runFfmpeg's progress tail.
function capture(ffmpegPath, args, timeoutMs = 15000) {
  if(shuttingDown)return Promise.resolve('');
  return new Promise((resolve) => {
    let out = ''; let child;
    try { child = spawn(ffmpegPath, args, { windowsHide: true }); } catch (_) { return resolve(''); }
    trackAux(child);
    const timer = setTimeout(() => { try { child.kill(); } catch (_) { /* gone */ } }, timeoutMs);
    const take = (c) => { if (out.length < 1024 * 1024) out += c.toString().slice(0,1024*1024-out.length); };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', () => { clearTimeout(timer); resolve(out); });
    child.on('close', () => { clearTimeout(timer); resolve(out); });
  });
}

// Asks ffmpeg what it can encode and which hardware accelerators it knows. Cached per binary.
async function detectEncoders(ffmpegPath) {
  // Same path may point at a freshly updated FFmpeg binary.
  let key=ffmpegPath;try{const st=fs.statSync(ffmpegPath);key=ffmpegPath+'|'+st.size+'|'+st.mtimeMs;}catch{}
  if (encoderCache.has(key)) return encoderCache.get(key);
  if(encoderPending.has(key))return encoderPending.get(key);
  const task=(async()=>{const res={
    encoders:V.parseEncoders(await capture(ffmpegPath,['-hide_banner','-encoders'])),
    hwaccels:V.parseHwaccels(await capture(ffmpegPath,['-hide_banner','-hwaccels']))
  };if(res.encoders.size){if(encoderCache.size>=8)encoderCache.delete(encoderCache.keys().next().value);encoderCache.set(key,res);}return res;})();
  encoderPending.set(key,task);try{return await task;}finally{encoderPending.delete(key);}
}

async function probeVideo(ffmpegPath, file) {
  const r = await runFfmpeg(ffmpegPath, ['-hide_banner', '-protocol_whitelist','file,pipe','-i', file], {timeoutMs:30000}).promise; // exit code 1 is normal (no output file)
  return V.parseProbe(r.stderr);
}

// One frame as a small PNG data URL (preview of the file). stdout is captured and capped at 2 MB.
function thumbnail(ffmpegPath, file, atSec = 1) {
  if(shuttingDown)return Promise.resolve(null);
  return new Promise((resolve) => {
    const at = Number.isFinite(atSec) && atSec >= 0 ? atSec : 1;
    const chunks = []; let n = 0; let child;
    try { child = spawn(ffmpegPath, ['-hide_banner', '-nostdin', '-v', 'error', '-ss', String(at), '-protocol_whitelist','file,pipe','-i', file, '-frames:v', '1', '-vf', 'scale=320:-2', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'], { windowsHide: true }); } catch (_) { return resolve(null); }
    trackAux(child);
    const timer = setTimeout(() => { try { child.kill(); } catch (_) {} },15000); timer.unref();
    child.stdout.on('data', (c) => { n += c.length; if (n > 2 * 1024 * 1024) child.kill(); else chunks.push(c); });
    child.stderr.on('data', () => {});
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', code => { clearTimeout(timer); resolve(code === 0 && n > 0 && n <= 2 * 1024 * 1024 ? 'data:image/png;base64,' + Buffer.concat(chunks).toString('base64') : null); });
  });
}



const lastLines = (text) => String(text).split(/\r?\n/).filter(Boolean).slice(-3).join(' ');

// Encodes one video (or extracts its audio / makes a GIF). Tries the available encoders of the chosen codec in order (hardware first, then
// software): a failing hardware encoder (no GPU, missing driver) falls through to the next one. Two passes run only for encoders that
// support -pass. Returns { promise -> { output, encoder, fellBackFrom }, cancel() }; a half-written file is removed on error and on cancel.
async function encodeVideo({ ffmpegPath, input, options, outputCover=null, available, onProgress, outDir, ensureActive=()=>{} }) {
  if(outputCover&&(!options.audioOnly||options.operation!=='encode'||!['mp3','flac'].includes(options.audioOnlyFormat)))throw Object.assign(Error('Unsupported cover output format'),{code:'invalid-cover'});
  ensureRunning();ensureActive();const info = await probeVideo(ffmpegPath, input);ensureRunning();ensureActive();
  if (!info.video && !options.audioOnly&&options.operation!=='remux') throw Object.assign(new Error('no-video'), { code: 'no-video' });
  if (options.audioOnly && !info.audio.length) throw Object.assign(new Error('no-audio'), { code: 'no-audio' });
  const needsEncoder = V.needsVideoEncoder(options);
  const order = needsEncoder ? V.encoderOrder(options.codec, available,{policy:options.encoderPolicy,passes:options.passes}) : [null];
  if (!order.length) throw Object.assign(new Error('no-encoder'), { code: 'no-encoder' });
  const ext = V.outputExt(options);
  const span = (options.trimEnd > 0 ? Math.min(options.trimEnd, info.duration || options.trimEnd) : info.duration) - options.trimStart;
  const duration = span > 0 ? span : info.duration;
  if (outDir) fs.mkdirSync(outDir, { recursive: true });
  const finalPath = () => L.buildOutputPath({ inputPath: input, ext, suffix: options.suffix, pathApi: path, exists: fs.existsSync, dir: outDir || undefined });
  let current = null, cancelled = false, tmp = null, passLog = null, passScratch=null,sequenceDir=null;
  const cleanup = () => { if(sequenceDir){try{if(require('./local-media-policy').localDirectory(sequenceDir)===sequenceDir){for(const n of fs.readdirSync(sequenceDir))if(/^frame-\d{4}\.png$/.test(n))fs.unlinkSync(path.join(sequenceDir,n));fs.rmdirSync(sequenceDir);}}catch{}sequenceDir=null;} if (tmp) { try { fs.unlinkSync(tmp); } catch (_) { /* none */ } } if(passScratch)passScratch.release();passScratch=null;tmp=null;passLog=null; };
  const run = (args, scale, offset) => {
    ensureRunning();ensureActive();
    if(cancelled)throw Object.assign(Error('cancelled'),{code:'cancelled'});
    args.splice(args.indexOf('-i'),0,'-protocol_whitelist','file,pipe');
    current = runFfmpeg(ffmpegPath, args, { duration, onProgress: (p) => { if (onProgress) onProgress(offset + p * scale); } });
    return current.promise;
  };
  const promise = (async () => {
    let lastError = null, firstTried = null;
    for (const enc of order) {
      if (cancelled) break;
      const twoPass = !!enc && options.passes === 2 && V.canTwoPass(enc);
      tmp = path.join(path.dirname(finalPath()), `.waveframe-${process.pid}-${crypto.randomBytes(16).toString('hex')}.${ext}`);
      try {
        if(options.operation==='sequence'){
          const parent=require('./local-media-policy').localDirectory(path.dirname(finalPath()));if(!parent||parent.includes('%'))throw Object.assign(Error('Unsupported frame destination'),{code:'denied'});
          sequenceDir=fs.mkdtempSync(path.join(parent,'opsis-frames-'));tmp=null;
          const pattern=path.join(sequenceDir,'frame-%04d.png');
          const r=await run(V.buildArgs({input,output:pattern,options,encoder:null,info}),1,0);
          ensureRunning();ensureActive();if(cancelled)throw Object.assign(Error('cancelled'),{code:'cancelled'});
          if(require('./local-media-policy').localDirectory(sequenceDir)!==sequenceDir)throw Object.assign(Error('Output folder changed'),{code:'denied'});
          const names=fs.readdirSync(sequenceDir).sort();if(r.code!==0||!names.length||names.length>options.frameCount||names.some(n=>!/^frame-\d{4}\.png$/.test(n)))throw Error(lastLines(r.stderr)||'frame sequence failed');
          const first=path.join(sequenceDir,names[0]);if(names.some(n=>{const s=fs.lstatSync(path.join(sequenceDir,n));return !s.isFile()||s.isSymbolicLink()||s.size<=0||s.size>2*1024*1024;}))throw Error('invalid frame output');
          const count=names.length;sequenceDir=null;if(onProgress)onProgress(1);return {output:first,outputCount:count,encoder:null,fellBackFrom:null};
        }
        passScratch=twoPass?require('./resource-diagnostics').createScratch('opsis-pass-'):null;
        passLog=passScratch?path.join(passScratch.dir,'ffmpeg-pass'):null;
        if (twoPass) {
          const r1 = await run(V.buildArgs({ input, output: tmp, options, encoder: enc, pass: 1, passLog, info }), 0.5, 0);
          if (r1.code !== 0) throw new Error(lastLines(r1.stderr) || 'pass 1 failed');
          const r2 = await run(V.buildArgs({ input, output: tmp, options, encoder: enc, pass: 2, passLog, info }), 0.5, 0.5);
          if (r2.code !== 0) throw new Error(lastLines(r2.stderr) || 'pass 2 failed');
        } else {
          const r = await run(V.buildArgs({ input, output: tmp, options, encoder: enc, info }), 1, 0);
          if (r.code !== 0 || !fs.existsSync(tmp)) throw new Error(lastLines(r.stderr) || `ffmpeg exited with code ${r.code}`);
        }
        if(cancelled)throw Object.assign(Error('cancelled'),{code:'cancelled'});
        ensureRunning();ensureActive();
        let coverStatus;
        if(outputCover){
          const tags=require('./music-tags');
          const result=await tags.complete(tmp,{}, {cover:outputCover,stagedOutput:true,cancelled:()=>{if(cancelled)return true;try{ensureRunning();ensureActive();return false;}catch{return true;}}});
          coverStatus=result.coverApplied?'added':'existing-preserved';
        }
        if(cancelled)throw Object.assign(Error('cancelled'),{code:'cancelled'});ensureRunning();ensureActive();
        const out=publishOutput(tmp,{input,ext,suffix:options.suffix,outDir});
        try{fs.unlinkSync(tmp);}catch{}
        if(passScratch)passScratch.release();
        passScratch=null;tmp=null;passLog=null;
        if (onProgress) onProgress(1);
        return { output: out, encoder: enc, fellBackFrom: firstTried, coverStatus, keyframeCut:options.operation==='remux'&&(options.trimStart>0||options.trimEnd>0) };
      } catch (e) {
        cleanup();
        if (cancelled || (e && e.code === 'cancelled')) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
        // A filesystem publication failure is not an encoder failure.
        if(['publish-failed','denied','invalid-output','timeout','input-pipe-failed'].includes(e?.code))throw e;
        lastError = e;
        if (!firstTried) firstTried = enc;
      }
    }
    if (cancelled) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
    throw lastError || new Error('encode failed');
  })();
  return { promise, cancel() { cancelled = true; if (current) current.cancel(); } };
}

module.exports = { capture, detectEncoders, probeVideo, thumbnail, encodeVideo, cancelAuxiliary, beginShutdown, activeAuxCount };
