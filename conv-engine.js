'use strict';
// Node-side engine of the audio converter: runs ffmpeg, probes files, plans collision-free output names next to the original.
// No Electron imports (unit/real-conversion tests use it directly); IPC glue is in conv-main.js. The original file is only ever read.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const L = require('./renderer/convlib.js');
const {localDirectory}=require('./local-media-policy');
const {createScratch}=require('./resource-diagnostics');

const AUDIO_EXTS = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'wma', 'aiff', 'aif', 'alac', 'ape', 'wv', 'mka', 'mp2', 'ac3', 'amr'];
const VIDEO_EXTS = ['mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv', 'm4v', 'ts', 'mpg', 'mpeg', '3gp'];

const activeRuns=new Set();let shuttingDown=false;
function beginShutdown(){shuttingDown=true;cancelActiveRuns();}
function ensureRunning(){if(shuttingDown)throw Object.assign(Error('cancelled'),{code:'cancelled'});}
function cancelActiveRuns(){for(const run of activeRuns)run.cancel();}
function activeRunCount(){return activeRuns.size;}
function runFfmpeg(ffmpegPath, args, { duration = 0, onProgress, timeoutMs = 6 * 60 * 60 * 1000, inputBytes = null } = {}) {
  ensureRunning();
  let child = null, cancelled = false, timedOut = false, inputError = null;
  if(inputBytes!==null&&!ArrayBuffer.isView(inputBytes))throw Error('invalid ffmpeg input bytes');
  const promise = new Promise((resolve, reject) => {
    let tail = '';
    try { child = spawn(ffmpegPath, ['-nostdin', ...args], { windowsHide: true, shell: false,stdio:[inputBytes===null?'ignore':'pipe','pipe','pipe'] }); } catch (e) { return reject(e); }
    if(inputBytes!==null){
      // Writable backpressure is handled by Node; subarray views avoid copies.
      const {Readable}=require('node:stream'),{pipeline}=require('node:stream/promises');
      const bytes=Buffer.isBuffer(inputBytes)?inputBytes:Buffer.from(inputBytes.buffer,inputBytes.byteOffset,inputBytes.byteLength);
      async function* chunks(){for(let i=0;i<bytes.length;i+=65536){if(cancelled||timedOut)return;yield bytes.subarray(i,i+65536);}}
      pipeline(Readable.from(chunks()),child.stdin).catch(err=>{inputError=err;});
    }
    const timer = setTimeout(() => { timedOut = true; try { child.kill(); } catch (_) {} }, timeoutMs);
    timer.unref();
    let outTail = '';
    child.stdout.on('data', (c) => { outTail = (outTail + c.toString()).slice(-6000); });
    child.stderr.on('data', (c) => {
      const s = c.toString();
      tail = (tail + s).slice(-6000);
      const t = L.parseFfmpegTime(s);
      if (t != null && duration > 0 && onProgress) onProgress(Math.min(0.99, t / duration));
    });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(Object.assign(new Error('ffmpeg-timeout'), {code:'timeout'}));
      if (cancelled) return reject(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
      if(code===0&&inputError)return reject(Object.assign(Error('ffmpeg input pipe failed'),{code:'input-pipe-failed'}));
      resolve({ code, stderr: tail, stdout: outTail });
    });
  });
  const run={promise,cancel(){cancelled=true;if(child)try{child.kill();}catch{}}};
  activeRuns.add(run);promise.then(()=>activeRuns.delete(run),()=>activeRuns.delete(run));
  return run;
}

async function probe(ffmpegPath, file) {
  const r = await runFfmpeg(ffmpegPath, ['-hide_banner', '-protocol_whitelist', 'file,pipe', '-i', file], {timeoutMs: 30000}).promise; // exit code 1 is normal (no output file)
  return L.parseProbe(r.stderr);
}

// Decodes the whole file to the null muxer: proves it is a valid, decodable stream and returns how long it really is.
async function verifyDecodes(ffmpegPath, file) {
  const r = await runFfmpeg(ffmpegPath, ['-hide_banner', '-v', 'error', '-stats', '-protocol_whitelist','file,pipe','-i', file, '-f', 'null', '-']).promise;
  const decoded = L.parseFfmpegTime(r.stderr);
  const info = await probe(ffmpegPath, file);
  return { ok: r.code === 0 && !/error/i.test(r.stderr.replace(/time=.*/g, '')), decodedSeconds: decoded, ...info };
}

// outDir (optional) puts the result in that folder instead of next to the input (created if missing).
function planOutput(input, options, exists = fs.existsSync, outDir) {
  const spec = L.FORMATS[options.format];
  if (outDir) fs.mkdirSync(outDir, { recursive: true });
  const out = L.buildOutputPath({ inputPath: input, ext: spec.ext, suffix: options.suffix, pathApi: path, exists, dir: outDir || undefined });
  const tmp = path.join(path.dirname(out), `.waveframe-${process.pid}-${crypto.randomBytes(16).toString('hex')}.${spec.ext}`);
  return { out, tmp };
}

// Publish an already completed file without replacing a competing destination.
// Same-volume hard link is atomic and exclusive. Unsupported filesystems fail
// closed rather than exposing partial final output or overwriting another file.
function publishOutput(tmp,{input,ext,suffix,outDir}){
  const parent=localDirectory(outDir||path.dirname(input));
  if(!parent||localDirectory(path.dirname(tmp))!==parent)throw Object.assign(Error('output folder changed'),{code:'denied'});
  const st=fs.lstatSync(tmp);
  if(!st.isFile()||st.isSymbolicLink()||!st.size)throw Object.assign(Error('invalid output'),{code:'invalid-output'});
  for(let tries=0;tries<128;tries++){
    const out=L.buildOutputPath({inputPath:input,ext,suffix,pathApi:path,exists:fs.existsSync,dir:parent});
    if(localDirectory(parent)!==parent)throw Object.assign(Error('output folder changed'),{code:'denied'});
    try{fs.linkSync(tmp,out);}
    catch(err){if(err.code==='EEXIST')continue;throw Object.assign(Error('cannot safely publish output: '+err.code),{code:'publish-failed'});}
    // The final file is now complete. Cleanup failure must not report a
    // failed conversion or retry publishing the same bytes under another name.
    try{fs.unlinkSync(tmp);}catch{}
    return out;
  }
  throw Object.assign(Error('output name contention'),{code:'publish-failed'});
}
function finalize(tmp,input,options,outDir){
  return publishOutput(tmp,{input,ext:L.FORMATS[options.format].ext,suffix:options.suffix,outDir});
}
async function runToTemp({ ffmpegPath, input, options, mode, source, duration, onProgress, outDir, inputBytes=null,ensureActive=()=>{} }) {
  ensureRunning();
  const { tmp } = planOutput(input, options, fs.existsSync, outDir);
  const args = L.buildFfmpegArgs({ input: source, output: tmp, options, mode });
  args.splice(args.indexOf('-i'), 0, '-protocol_whitelist','file,pipe');
  const run = runFfmpeg(ffmpegPath, args, { duration, onProgress,inputBytes });
  const promise = run.promise.then((r) => {
    if(r.code!==0||!fs.existsSync(tmp))throw Error(r.stderr.split(/\r?\n/).filter(Boolean).slice(-3).join(' ')||'ffmpeg exited with code '+r.code);
    ensureRunning();ensureActive();return {output:finalize(tmp,input,options,outDir)};
  }).finally(()=>{try{fs.unlinkSync(tmp);}catch{} });
  return { promise, cancel: run.cancel };
}

// ffmpeg reads the original and does everything (decode any audio / video audio track, trim, rate, channels, codec).
async function convertDirect({ ffmpegPath, input, options, onProgress, outDir, ensureActive=()=>{} }) {
  ensureRunning();ensureActive();
  const info = await probe(ffmpegPath, input);
  ensureRunning();ensureActive();
  if (!info.hasAudio) throw Object.assign(new Error('no-audio'), { code: 'no-audio' });
  const span = (options.trimEnd > 0 ? Math.min(options.trimEnd, info.duration || options.trimEnd) : info.duration) - options.trimStart;
  return runToTemp({ ffmpegPath, input, options, mode: 'direct', source: input, duration: span > 0 ? span : info.duration, onProgress, outDir,ensureActive });
}

// The renderer already applied trim/rate/channels/effects/gain and sent a WAV: for WAV output it is written as is, otherwise ffmpeg encodes it.
async function convertFromWav({ ffmpegPath, input, wavBytes, options, onProgress, duration, outDir,ensureActive=()=>{} }) {
  ensureRunning();
  ensureActive();
  if (wavBytes instanceof ArrayBuffer) wavBytes=Buffer.from(wavBytes);
  if (!ArrayBuffer.isView(wavBytes)) throw Object.assign(new Error('invalid WAV byte payload'),{code:'invalid-wav'});
  if (options.format === 'wav') {
    const { tmp } = planOutput(input, options, fs.existsSync, outDir);
    let created=false;
    try{
      const handle=await fs.promises.open(tmp,'wx',0o600);created=true;
      try{await handle.writeFile(wavBytes);}finally{await handle.close();}
      ensureRunning();ensureActive();const output=finalize(tmp,input,options,outDir);
      if(onProgress)onProgress(1);
      return {promise:Promise.resolve({output}),cancel(){}};
    }finally{if(created)try{fs.unlinkSync(tmp);}catch{}}
  }
  if (!ffmpegPath) throw Object.assign(new Error('no-ffmpeg'), { code: 'no-ffmpeg' });
  // A processed WAV already exists in memory. Feed it directly to FFmpeg.
  // The only disk write is the exclusive temporary encoded output.
  return runToTemp({ffmpegPath,input,options,mode:'encode',source:'pipe:0',inputBytes:wavBytes,duration,onProgress,outDir,ensureActive});
}

// ffmpeg decodes anything it knows to 32-bit float WAV when the renderer's own decoder cannot (WMA, AIFF, some video containers).
async function predecodeToWav({ ffmpegPath, input, sampleRate }) {
  ensureRunning();
  const scratch=createScratch('opsis-predecode-');
  const tmp=path.join(scratch.dir,'decoded.wav');
  const args = ['-hide_banner', '-nostdin', '-y', '-protocol_whitelist','file,pipe','-i', input, '-vn', '-map', '0:a:0', ...(sampleRate > 0 ? ['-ar', String(sampleRate)] : []), '-c:a', 'pcm_f32le', '-f', 'wav', tmp];
  try {
    const max = 600 * 1024 * 1024;
    args.splice(args.length-1, 0, '-fs', String(max));
    const r = await runFfmpeg(ffmpegPath, args).promise;
    if (r.code !== 0) throw new Error('predecode-failed');
    const size = fs.statSync(tmp).size;
    if (size >= max - 65536) throw new Error('predecode-too-large');
    return await fs.promises.readFile(tmp);
  } finally { scratch.release(); }
}

module.exports = { AUDIO_EXTS, VIDEO_EXTS, runFfmpeg, cancelActiveRuns, activeRunCount, beginShutdown, ensureRunning, probe, verifyDecodes, planOutput, publishOutput, convertDirect, convertFromWav, predecodeToWav };
