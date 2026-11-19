'use strict';

const utf8 = new TextDecoder('utf-8', { fatal: true });
const legacyGreek = ['windows-1253', 'iso-8859-7'].map((encoding) => new TextDecoder(encoding));
const windowsLatin = new TextDecoder('windows-1252');
const windowsLatinBytes = new Map(Array.from({ length: 256 }, (_, byte) =>
  [windowsLatin.decode(Uint8Array.of(byte)), byte]));
const greek = /\p{Script=Greek}/gu;

function originalBytes(value) {
  const bytes = [];
  for (const character of value) {
    const code = character.codePointAt(0);
    const byte = code < 256 ? code : windowsLatinBytes.get(character);
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  return Uint8Array.from(bytes);
}

function repairGreekTag(value, id3) {
  if (typeof value !== 'string' || !value) return null;
  if (/\p{Script=Greek}/u.test(value)) return value;
  const bytes = originalBytes(value);
  if (!bytes) return value;

  try {
    const decoded = utf8.decode(bytes);
    if ((decoded.match(greek)?.length || 0) >= 2) return decoded.normalize('NFC');
  } catch {
    // Legacy ID3 fields can contain a local code page even when labelled Latin-1.
  }
  if (!id3) return value;

  // Accented Latin words such as "Café" and "Björk" must keep their original text.
  // A legacy Greek word consists of consecutive high bytes and decodes to letters.
  let best = value;
  let bestScore = 0;
  for (const decoder of legacyGreek) {
    const decoded = decoder.decode(bytes);
    if (/[\uFFFD\u0080-\u009F]/u.test(decoded)) continue;
    const words = decoded.match(/\p{L}+/gu) || [];
    const strong = words.some((word) => /^\p{Script=Greek}{3,}$/u.test(word) && new Set(word.toLowerCase()).size >= 3);
    const score = decoded.match(greek)?.length || 0;
    if (!strong || score <= bestScore || words.some((word) => /[a-z]/i.test(word) && /\p{Script=Greek}/u.test(word))) continue;
    best = decoded;
    bestScore = score;
  }
  return best.normalize('NFC');
}

function readTrackText(metadata) {
  const id3Values = new Set(Object.entries(metadata.native || {})
    .filter(([format]) => /^ID3v/i.test(format))
    .flatMap(([, tags]) => tags.map((tag) => tag.value)));
  const { title, artist, album } = metadata.common;
  return {
    title: repairGreekTag(title, id3Values.has(title)),
    artist: repairGreekTag(artist, id3Values.has(artist)),
    album: repairGreekTag(album, id3Values.has(album)),
  };
}

module.exports = { readTrackText };
