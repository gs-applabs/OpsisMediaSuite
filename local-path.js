'use strict';

const path = require('node:path');

function safeLocalPath(value, platform = process.platform) {
  if (typeof value !== 'string' || /[\u0000-\u001f]/.test(value) || /^[\\/]{2}/.test(value)) return false;
  return platform === 'win32' ? /^[a-z]:[\\/]/i.test(value) && !value.slice(2).includes(':') : path.posix.isAbsolute(value);
}

module.exports = { safeLocalPath };
