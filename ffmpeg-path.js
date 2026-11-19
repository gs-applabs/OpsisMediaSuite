'use strict';

const path = require('node:path');

// Use the configured PATH only, never the process launch directory or a relative entry.
function systemFfmpegCandidates(searchPath, platform = process.platform) {
  const windows = platform === 'win32';
  const paths = windows ? path.win32 : path.posix;
  return (searchPath || '').split(paths.delimiter)
    .map((dir) => dir.trim().replace(/^"(.*)"$/, '$1'))
    .filter((dir) => windows ? /^[a-z]:[\\/]/i.test(dir) : paths.isAbsolute(dir))
    .map((dir) => paths.join(dir, windows ? 'ffmpeg.exe' : 'ffmpeg'));
}

module.exports = { systemFfmpegCandidates };
