'use strict';

const { crc32 } = require('node:zlib');
const exif = Buffer.from('Exif\0\0');
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const datePattern = /^\d{4}:(?:0[1-9]|1[0-2]):(?:0[1-9]|[12]\d|3[01]) (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

function findExif(bytes) {
  if (!Buffer.isBuffer(bytes)) return null;
  const end = Math.min(bytes.length, 1024 * 1024);
  if (bytes.subarray(0, 8).equals(png)) {
    for (let p = 8; p + 12 <= end;) {
      const length = bytes.readUInt32BE(p);
      const type = bytes.toString('ascii', p + 4, p + 8);
      if (p + 12 + length > end || type === 'IDAT') break;
      if (type === 'eXIf') return bytes.subarray(p + 8, p + 8 + length);
      p += 12 + length;
    }
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let p = 2; p + 4 <= end && bytes[p] === 0xff;) {
      const marker = bytes[p + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const length = bytes.readUInt16BE(p + 2);
      if (length < 2 || p + 2 + length > end) break;
      if (marker === 0xe1 && length >= 8 && bytes.subarray(p + 4, p + 10).equals(exif)) {
        return bytes.subarray(p + 10, p + 2 + length);
      }
      p += 2 + length;
    }
  }
  return null;
}

function captureDate(bytes) {
  const data = findExif(bytes);
  if (!data || data.length < 8) return null;
  const order = data.toString('ascii', 0, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const little = order === 'II';
  const u16 = (p) => little ? data.readUInt16LE(p) : data.readUInt16BE(p);
  const u32 = (p) => little ? data.readUInt32LE(p) : data.readUInt32BE(p);
  function entry(dir, tag) {
    if (dir < 8 || dir + 2 > data.length) return -1;
    const count = u16(dir);
    if (count > 512 || dir + 2 + 12 * count > data.length) return -1;
    for (let p = dir + 2; p < dir + 2 + 12 * count; p += 12) if (u16(p) === tag) return p;
    return -1;
  }
  if (u16(2) !== 42) return null;
  const pointer = entry(u32(4), 0x8769);
  if (pointer < 0 || u16(pointer + 2) !== 4 || u32(pointer + 4) !== 1) return null;
  const date = entry(u32(pointer + 8), 0x9003);
  if (date < 0 || u16(date + 2) !== 2 || u32(date + 4) !== 20) return null;
  const start = u32(date + 8);
  if (start + 20 > data.length || data[start + 19] !== 0) return null;
  const value = data.toString('ascii', start, start + 19);
  return datePattern.test(value) ? value : null;
}

function attachCaptureDate(bytes, format, value) {
  if (!Buffer.isBuffer(bytes) || typeof value !== 'string' || !datePattern.test(value) || findExif(bytes)) return bytes;
  const tiff = Buffer.alloc(64);
  tiff.write('II');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8769, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt16LE(1, 26);
  tiff.writeUInt16LE(0x9003, 28);
  tiff.writeUInt16LE(2, 30);
  tiff.writeUInt32LE(20, 32);
  tiff.writeUInt32LE(44, 36);
  tiff.write(value, 44, 'ascii');

  if (format === 'jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const header = Buffer.from([0xff, 0xe1, 0, 0]);
    header.writeUInt16BE(2 + exif.length + tiff.length, 2);
    const afterJfif = bytes.length > 6 && bytes[2] === 0xff && bytes[3] === 0xe0 ? 4 + bytes.readUInt16BE(4) : 2;
    const insert = afterJfif <= bytes.length ? afterJfif : 2;
    return Buffer.concat([bytes.subarray(0, insert), header, exif, tiff, bytes.subarray(insert)]);
  }
  if (format === 'png' && bytes.length >= 33 && bytes.subarray(0, 8).equals(png) && bytes.toString('ascii', 12, 16) === 'IHDR') {
    const chunk = Buffer.alloc(12 + tiff.length);
    chunk.writeUInt32BE(tiff.length);
    chunk.write('eXIf', 4);
    tiff.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(chunk.subarray(4, chunk.length - 4)), chunk.length - 4);
    return Buffer.concat([bytes.subarray(0, 33), chunk, bytes.subarray(33)]);
  }
  return bytes;
}

module.exports = { captureDate, attachCaptureDate };
