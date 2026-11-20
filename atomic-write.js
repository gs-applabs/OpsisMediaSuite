'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function atomicWrite(file, data) {
  const temp = path.join(path.dirname(file), '.opsis-' + randomUUID() + '.tmp');
  try {
    fs.writeFileSync(temp, data, { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    try { fs.unlinkSync(temp); } catch { /* already renamed or never created */ }
  }
}

module.exports = { atomicWrite };
