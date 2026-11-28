'use strict';
const fs = require('node:fs');
const path = require('node:path');
function resolveLocal(value, directory=false) {
  if (typeof value !== 'string' || value.length > 32767 || /[\x00-\x1f\x7f]/.test(value)||/^[\\/]{2}/.test(value) || !path.isAbsolute(value)) return null;
  if (process.platform === 'win32' && (!/^[a-z]:[\\/]/i.test(value) || value.slice(2).includes(':'))) return null;
  try {
    const normalized = path.resolve(value), root = path.parse(normalized).root;
    // Inspect each component, not a string equality test: legitimate Windows
    // short (8.3) aliases are not symbolic links and may be used for TEMP.
    let cursor = root;
    for (const component of normalized.slice(root.length).split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, component);
      if (fs.lstatSync(cursor).isSymbolicLink()) return null;
    }
    const real = fs.realpathSync.native(normalized);
    if (process.platform === 'win32' && (!/^[a-z]:[\\/]/i.test(real) || real.slice(2).includes(':'))) return null;
    const stat=fs.statSync(real);return (directory?stat.isDirectory():stat.isFile())?real:null;
  } catch (_) { return null; }
}
const localPath=value=>resolveLocal(value,false);
const localDirectory=value=>resolveLocal(value,true);
function allowedFile(value, extensions) {
  const resolved = localPath(value);
  return resolved && extensions.has(path.extname(resolved).slice(1).toLowerCase()) ? resolved : null;
}
module.exports = { localPath, localDirectory, allowedFile };
