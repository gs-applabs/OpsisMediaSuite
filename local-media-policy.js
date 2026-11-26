'use strict';
const fs = require('node:fs');
const path = require('node:path');
function localPath(value) {
  if (typeof value !== 'string' || value.length > 32767 || /[\0\r\n]/.test(value) || !path.isAbsolute(value)) return null;
  if (process.platform === 'win32' && (!/^[a-z]:[\\/]/i.test(value) || value.slice(2).includes(':'))) return null;
  try {
    const normalized = path.resolve(value), real = fs.realpathSync.native(normalized);
    const same = process.platform === 'win32' ? real.toLowerCase() === normalized.toLowerCase() : real === normalized;
    return same && fs.statSync(real).isFile() ? real : null;
  } catch (_) { return null; }
}
function allowedFile(value, extensions) {
  const resolved = localPath(value);
  return resolved && extensions.has(path.extname(resolved).slice(1).toLowerCase()) ? resolved : null;
}
module.exports = { localPath, allowedFile };
