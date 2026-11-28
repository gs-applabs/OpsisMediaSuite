'use strict';
// Shared legacy media text decoder. Recovered from the earlier installer branch,
// keeping the current implementation including UTF-16BE and Greek fallback.
function decodeText(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.slice(3).toString('utf8');
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (_) { /* not UTF-8 */ }
  try { return new TextDecoder('windows-1253').decode(buf); } catch (_) { return buf.toString('latin1'); }
}

module.exports={decodeText};
