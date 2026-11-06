// Report where a --dsw-* token is consumed across every client bundle in
// app.asar, with the selector that carries it.
//
// The client bundles are compiled to string literals of CSS, so a targeted scan
// reads each payload straight out of the archive (no extraction) and prints the
// selector + declaration around every `var(--token)` reference.
//
// usage: node _tools/asar-token-usage.js <app.asar> <--dsw-alias-bg-base> [limit]
'use strict';
const fs = require('fs');

const [, , asarPath, token, limitText] = process.argv;
if (!asarPath || !token) {
  console.error('usage: node _tools/asar-token-usage.js <app.asar> <token> [limit]');
  process.exit(2);
}
const limit = limitText ? Number(limitText) : 40;

const fd = fs.openSync(asarPath, 'r');
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, 16, 0);
const jsonLen = head.readUInt32LE(12);
const jsonBuf = Buffer.alloc(jsonLen);
fs.readSync(fd, jsonBuf, 0, jsonLen, 16);
const index = JSON.parse(jsonBuf.toString('utf8'));
const base = 8 + head.readUInt32LE(4);

const targets = [];
(function walk(node, prefix) {
  for (const [name, child] of Object.entries(node.files || {})) {
    const p = prefix ? prefix + '/' + name : name;
    if (child.files) walk(child, p);
    else if (/lib\/client\.js$/.test(p)) targets.push({ path: p, size: child.size, offset: Number(child.offset) });
  }
})(index, '');

function readFile(entry) {
  const buf = Buffer.alloc(entry.size);
  fs.readSync(fd, buf, 0, entry.size, base + entry.offset);
  return buf.toString('utf8');
}

const needle = 'var(' + token + ')';
let shown = 0;
const perFile = [];
for (const entry of targets) {
  const text = readFile(entry);
  let count = 0;
  let at = text.indexOf(needle);
  while (at !== -1) {
    count++;
    if (shown < limit) {
      // walk back to the preceding `{` to recover the selector
      const open = text.lastIndexOf('{', at);
      const close = text.indexOf('}', at);
      const selectorStart = Math.max(0, text.lastIndexOf('}', open) + 1, text.lastIndexOf('"', open) + 1);
      const selector = text.slice(selectorStart, open).replace(/\s+/g, ' ').trim();
      const decl = text.slice(open + 1, Math.min(close, open + 160)).trim();
      console.log(entry.path.replace('dsh/node_modules/', '') + '  ' + selector);
      console.log('    ' + decl);
      shown++;
    }
    at = text.indexOf(needle, at + needle.length);
  }
  if (count) perFile.push({ path: entry.path.replace('dsh/node_modules/@deepseek-ai/', ''), count });
}
perFile.sort((a, b) => b.count - a.count);
console.log('\ntotal references: ' + perFile.reduce((sum, f) => sum + f.count, 0) + ' across ' + perFile.length + ' bundles');
for (const f of perFile.slice(0, 25)) console.log('  ' + String(f.count).padStart(4) + '  ' + f.path);
