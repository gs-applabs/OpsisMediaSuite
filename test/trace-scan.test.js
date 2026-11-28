'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PATTERNS, scan } = require('./trace-scan.js');

const approvals = require('./trace-approvals.json').approvals;
const BUILD = 'D:\\a\\_work\\1\\s\\vendor.pdb';

function tree(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, data] of Object.entries(files)) {
    const full = path.join(root, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, data);
  }
  return root;
}
const open = result => result.findings.filter(f => !f.approved);

test('every pattern is found in 8-bit and in UTF-16 at both alignments, also inside app.asar', t => {
  for (const pattern of PATTERNS) {
    const wide = Buffer.from(pattern, 'utf16le');
    const root = tree(t, { 'a.dll': Buffer.from(pattern), 'b.exe': wide, 'resources/app.asar': Buffer.concat([Buffer.from([0]), wide]) });
    assert.strictEqual(open(scan(root, [])).length, 3, `pattern ${PATTERNS.indexOf(pattern)}`);
  }
});

test('a file approval holds only for the same file, pattern and bytes', t => {
  const root = tree(t, { 'native/v.dll': BUILD });
  const [found] = scan(root, []).findings;
  const approval = { file: found.file, pattern: found.pattern, sha256: found.sha256, provenance: 'fixture' };
  assert.strictEqual(open(scan(root, [approval])).length, 0);
  for (const wrong of [{ file: 'native/other.dll' }, { pattern: 0 }, { sha256: '0'.repeat(64) }, { provenance: '' }]) {
    assert.strictEqual(open(scan(root, [{ ...approval, ...wrong }])).length, 1, JSON.stringify(wrong));
  }
  fs.appendFileSync(path.join(root, 'native/v.dll'), ' changed');
  assert.strictEqual(open(scan(root, [approval])).length, 1);
});

test('a context approval survives unrelated byte changes but not a new, changed or repeated match', t => {
  const root = tree(t, { 'app.exe': `head\0${BUILD}\0tail` });
  const [found] = scan(root, []).findings;
  const approval = { file: 'app.exe', pattern: found.pattern, contexts: found.contexts, provenance: 'fixture' };
  const check = content => { fs.writeFileSync(path.join(root, 'app.exe'), content); return open(scan(root, [approval])).length; };
  assert.strictEqual(check(`other resources\0${BUILD}\0`), 0);
  assert.strictEqual(check(`\0${BUILD}\0${BUILD}\0`), 1);
  assert.strictEqual(check(`\0${BUILD}\0D:\\a\\OpsisMediaSuite\\main.js\0`), 1);
  assert.strictEqual(check('\0D:\\a\\OpsisMediaSuite\\main.js\0'), 1);
  assert.strictEqual(check(`\0${BUILD}\0C:\\Users\\someone\\secret\0`), 1);
});

test('the shipped approvals are exact and documented', () => {
  assert.ok(approvals.length > 0);
  for (const a of approvals) {
    assert.ok(a.file && !/[*?]/.test(a.file), a.file);
    assert.ok(Number.isInteger(a.pattern) && a.pattern >= 0 && a.pattern < PATTERNS.length);
    assert.ok(a.provenance.length > 40);
    assert.ok(a.sha256 ? /^[a-f0-9]{64}$/.test(a.sha256) : a.contexts.every(c => /^[a-f0-9]{64}$/.test(c.sha256) && c.count > 0));
    assert.ok(![2, 3, 4].includes(a.pattern), 'personal identifiers can never be approved');
  }
});
