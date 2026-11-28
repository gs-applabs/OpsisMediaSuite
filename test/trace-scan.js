'use strict';
// Strict trace scan of an unpacked release (personal data and build paths).
// A match passes only through an exact approval in trace-approvals.json: the same file, pattern and
//   - the same file SHA-256 (unmodified vendor binary), or
//   - the same set of matched strings and counts (vendor executable that packaging rewrites).
// There is no rule that skips a directory, a file type or a pattern. Matched text is never printed.
// Usage: node test/trace-scan.js <unpacked release folder> [findings file]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PATTERNS = ['C:\\Users\\', 'C:\\w\\', 'gstrj', 'LOGISTIRIO', 'giorstergiopoulos@gmail', '/Users/', 'D:\\a\\'];
const SCANNED = /\.(exe|dll|pdb|json|config|js|html|asar|node)$/i;
const LIMIT = 400; // characters of context kept on each side of a match
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const printable = code => code >= 32 && code < 127;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

// pattern index -> list of { encoding, sha256 (of the surrounding printable string), count }
function matches(buffer) {
  const views = [['8bit', buffer.toString('latin1')], ['utf16', buffer.toString('utf16le')], ['utf16', buffer.subarray(1).toString('utf16le')]];
  const found = new Map();
  for (const [encoding, text] of views) {
    const lower = text.toLowerCase();
    PATTERNS.forEach((pattern, index) => {
      const needle = pattern.toLowerCase();
      for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + needle.length)) {
        let start = at;
        let end = at + needle.length;
        while (start > 0 && at - start < LIMIT && printable(text.charCodeAt(start - 1))) start--;
        while (end < text.length && end - at < LIMIT && printable(text.charCodeAt(end))) end++;
        const hash = sha256(text.slice(start, end));
        if (!found.has(index)) found.set(index, new Map());
        const byContext = found.get(index);
        const key = `${encoding} ${hash}`;
        if (!byContext.has(key)) byContext.set(key, { encoding, sha256: hash, count: 0 });
        byContext.get(key).count++;
      }
    });
  }
  return new Map([...found].map(([index, byContext]) => [index, [...byContext.values()]]));
}

const canonical = contexts => JSON.stringify(contexts.map(c => `${c.encoding} ${c.sha256} ${c.count}`).sort());

function isApproved(finding, approval) {
  if (approval.file !== finding.file || approval.pattern !== finding.pattern) return false;
  if (!approval.provenance) return false;
  if (approval.sha256) return approval.sha256 === finding.sha256;
  return Array.isArray(approval.contexts) && approval.contexts.length > 0 && canonical(approval.contexts) === canonical(finding.contexts);
}

function scan(root, approvals) {
  const findings = [];
  let scanned = 0;
  for (const full of walk(root)) {
    if (!SCANNED.test(full)) continue;
    scanned++;
    const buffer = fs.readFileSync(full);
    const found = matches(buffer);
    if (!found.size) continue;
    const file = path.relative(root, full).split(path.sep).join('/');
    const digest = sha256(buffer);
    for (const [pattern, contexts] of found) {
      const finding = { file, pattern, sha256: digest, contexts };
      finding.approved = approvals.some(a => isApproved(finding, a));
      findings.push(finding);
    }
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.pattern - b.pattern);
  return { scanned, findings };
}

function main([root, out = 'trace-findings.txt']) {
  if (!root) throw new Error('usage: node test/trace-scan.js <unpacked release folder> [findings file]');
  const { approvals } = JSON.parse(fs.readFileSync(path.join(__dirname, 'trace-approvals.json'), 'utf8'));
  const { scanned, findings } = scan(root, approvals);
  const lines = findings.map(f => `${f.approved ? 'APPROVED' : 'TRACE'}: ${f.file} : pattern index ${f.pattern} : sha256 ${f.sha256} : contexts ${f.contexts.map(c => `${c.encoding}/${c.sha256}/x${c.count}`).join(',')}`);
  fs.writeFileSync(out, lines.join('\n') + '\n');
  lines.forEach(line => console.log(line));
  if (!scanned) throw new Error('trace scan found no files to scan');
  const open = findings.filter(f => !f.approved).length;
  if (open) throw new Error(`${open} unapproved trace(s) of personal data or build paths inside the release files`);
  console.log(`trace scan: ${scanned} files, ${findings.length} exact approved match(es), no unapproved trace`);
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = { PATTERNS, matches, isApproved, scan };
