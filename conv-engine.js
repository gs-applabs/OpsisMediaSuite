'use strict';
// Node-side engine of the audio converter: runs ffmpeg, probes files, plans collision-free output names next to the original.
// No Electron imports (unit/real-conversion tests use it directly); IPC glue is in conv-main.js. The original file is only ever read.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { AUDIO_EXTS, VIDEO_EXTS } = require('./media-types.js');
const crypto = require('crypto');
const L = require('./renderer/convlib.js');


const activeFfmpeg = new Set();

function runFfmpeg(ffmpegPath, args, { duration = 0, onProgress, timeoutMs = 0 } = {}) {
  let child = null, cancelled = false, timedOut = false;
  const promise = new Promise((resolve, reject) => {
    let tail = '';
    try { child = spawn(ffmpegPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return reject(e); }
    const timer = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch { /* child already exited */ }
      reject(Object.assign(new Error('FFmpeg inspection timed out'), { code: 'timeout' }));
    }, timeoutMs) : null;
    let outTail = '';
    child.stdout.on('data', (c) => { outTail = (outTail + c.toString()).slice(-6000); });
    child.stderr.on('data', (c) => {
      const s = c.toString();
      tail = (tail + s).slice(-6000);
      const t = L.parseFfmpegTime(s);
      if (t != null && duration > 0 && onProgress) onProgress(Math.min(0.99, t / duration));
    });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (cancelled) return reject(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
      resolve({ code, stderr: tail, stdout: outTail });
    });
  });
  const job = { promise, cancel() { cancelled = true; if (child) try { child.kill(); } catch (_) { /* gone */ } } };
  activeFfmpeg.add(job);
  const remove = () => activeFfmpeg.delete(job);
  promise.then(remove, remove);
  return job;
}

async function cancelAllFfmpeg() {
  const jobs = [...activeFfmpeg];
  for (const job of jobs) job.cancel();
  await Promise.allSettled(jobs.map((job) => job.promise));
}

async function removeStaleOutput(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !/^\.waveframe-\d+-[a-f0-9]+\.[a-z0-9]+$/i.test(entry.name)) continue;
    const file = path.join(dir, entry.name);
    try {
      if (Date.now() - (await fs.promises.stat(file)).mtimeMs > 86400000) await fs.promises.unlink(file);
    } catch { /* another process cleaned up the file */ }
  }
}

async function probe(ffmpegPath, file) {
  const r = await runFfmpeg(ffmpegPath, ['-hide_banner', '-nostdin', '-i', file], { timeoutMs: 30000 }).promise; // exit code 1 is normal (no output file)
  return L.parseProbe(r.stderr);
}

// Decodes the whole file to the null muxer: proves it is a valid, decodable stream and returns how long it really is.
async function verifyDecodes(ffmpegPath, file) {
  const r = await runFfmpeg(ffmpegPath, ['-hide_banner', '-v', 'error', '-stats', '-i', file, '-f', 'null', '-']).promise;
  const decoded = L.parseFfmpegTime(r.stderr);
  const info = await probe(ffmpegPath, file);
  return { ok: r.code === 0 && !/error/i.test(r.stderr.replace(/time=.*/g, '')), decodedSeconds: decoded, ...info };
}

// outDir (optional) puts the result in that folder instead of next to the input (created if missing).
function planOutput(input, options, exists = fs.existsSync, outDir) {
  const spec = L.FORMATS[options.format];
  if (outDir) fs.mkdirSync(outDir, { recursive: true });
  const out = L.buildOutputPath({ inputPath: input, ext: spec.ext, suffix: options.suffix, pathApi: path, exists, dir: outDir || undefined });
  const tmp = path.join(path.dirname(out), `.waveframe-${process.pid}-${crypto.randomBytes(4).toString('hex')}.${spec.ext}`);
  return { out, tmp };
}

// Moves the finished temp file to its final name; if that name got taken meanwhile, picks the next free one.
function finalize(tmp, input, options, outDir) {
  const spec = L.FORMATS[options.format];
  const out = L.buildOutputPath({ inputPath: input, ext: spec.ext, suffix: options.suffix, pathApi: path, exists: fs.existsSync, dir: outDir || undefined });
  fs.renameSync(tmp, out);
  return out;
}

async function runToTemp({ ffmpegPath, input, options, mode, source, duration, onProgress, outDir, original }) {
  const { tmp } = planOutput(input, options, fs.existsSync, outDir);
  const args = L.buildFfmpegArgs({ input: source, output: tmp, options, mode, original });
  const run = runFfmpeg(ffmpegPath, args, { duration, onProgress });
  const promise = run.promise.then((r) => {
    if (r.code !== 0 || !fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); } catch (_) { /* none */ } throw new Error(r.stderr.split(/\r?\n/).filter(Boolean).slice(-3).join(' ') || `ffmpeg exited with code ${r.code}`); }
    return { output: finalize(tmp, input, options, outDir) };
  }, (e) => { try { fs.unlinkSync(tmp); } catch (_) { /* none */ } throw e; });
  return { promise, cancel: run.cancel };
}

// ffmpeg reads the original and does everything (decode any audio / video audio track, trim, rate, channels, codec).
async function convertDirect({ ffmpegPath, input, options, onProgress, outDir }) {
  const info = await probe(ffmpegPath, input);
  if (!info.hasAudio) throw Object.assign(new Error('no-audio'), { code: 'no-audio' });
  const span = (options.trimEnd > 0 ? Math.min(options.trimEnd, info.duration || options.trimEnd) : info.duration) - options.trimStart;
  return runToTemp({ ffmpegPath, input, options, mode: 'direct', source: input, duration: span > 0 ? span : info.duration, onProgress, outDir });
}

// The renderer already applied trim/rate/channels/effects/gain and sent a WAV: for WAV output it is written as is, otherwise ffmpeg encodes it.
async function convertFromWav({ ffmpegPath, input, original, wavBytes, options, onProgress, duration, outDir }) {
  if (options.format !== 'wav' && !ffmpegPath) throw Object.assign(new Error('no-ffmpeg'), { code: 'no-ffmpeg' });
  const bytes = wavBytes instanceof ArrayBuffer ? new Uint8Array(wavBytes) : wavBytes;
  const controller = new AbortController();
  let childJob;
  const promise = (async () => {
    const wavOutput = options.format === 'wav' && !(ffmpegPath && original && options.preserveMetadata);
    const tmp = wavOutput ? planOutput(input, options, fs.existsSync, outDir).tmp
      : path.join(require('os').tmpdir(), `waveframe-conv-${process.pid}-${crypto.randomBytes(4).toString('hex')}.wav`);
    try {
      await fs.promises.writeFile(tmp, bytes, { signal: controller.signal });
      controller.signal.throwIfAborted();
      if (wavOutput) {
        if (onProgress) onProgress(1);
        return { output: finalize(tmp, input, options, outDir) };
      }
      childJob = await runToTemp({ ffmpegPath, input, options, mode: 'encode', source: tmp, duration, onProgress, outDir, original });
      if (controller.signal.aborted) childJob.cancel();
      return await childJob.promise;
    } catch (error) {
      if (controller.signal.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      throw error;
    } finally {
      await fs.promises.rm(tmp, { force: true }).catch(() => {});
    }
  })();
  return { promise, cancel() { controller.abort(); childJob?.cancel(); } };
}

// ffmpeg decodes anything it knows to 32-bit float WAV when the renderer's own decoder cannot (WMA, AIFF, some video containers).
async function predecodeToWav({ ffmpegPath, input, sampleRate }) {
  const tmp = path.join(require('os').tmpdir(), `waveframe-pre-${process.pid}-${crypto.randomBytes(4).toString('hex')}.wav`);
  const limit = 256 * 1024 * 1024;
  const args = ['-hide_banner', '-nostdin', '-y', '-i', input, '-vn', '-map', '0:a:0', ...(sampleRate > 0 ? ['-ar', String(sampleRate)] : []), '-c:a', 'pcm_f32le', '-fs', String(limit), '-f', 'wav', tmp];
  try {
    const r = await runFfmpeg(ffmpegPath, args, { timeoutMs: 120000 }).promise;
    if (r.code !== 0) throw new Error('predecode-failed');
    if ((await fs.promises.stat(tmp)).size >= limit) throw Object.assign(new Error('Decoded audio exceeds 256 MB'), { code: 'too-large' });
    return await fs.promises.readFile(tmp);
  } finally {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
  }
}

module.exports = { AUDIO_EXTS, VIDEO_EXTS, runFfmpeg, cancelAllFfmpeg, removeStaleOutput, probe, verifyDecodes, planOutput, convertDirect, convertFromWav, predecodeToWav };
