'use strict';

// Legacy media text: UTF-8 (with or without BOM), otherwise Windows-1253 (Greek) which is what old .srt files from Greek sites use.
function decodeText(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.slice(3).toString('utf8');
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString('utf16le');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (_) { /* not UTF-8 */ }
  try { return new TextDecoder('windows-1253').decode(buf); } catch (_) { return buf.toString('latin1'); }
}

module.exports = { decodeText };
