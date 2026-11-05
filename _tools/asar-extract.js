// Extract files from an Electron app.asar by path prefix.
// usage: node asar-extract.js <app.asar> <outDir> <prefix> [prefix...]
const fs = require('fs');
const path = require('path');

const [, , asarPath, outDir, ...prefixes] = process.argv;
const fd = fs.openSync(asarPath, 'r');
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, 16, 0);
const headerSize = head.readUInt32LE(4); // whole header pickle, 4-byte aligned
const jsonLen = head.readUInt32LE(12);
const jsonBuf = Buffer.alloc(jsonLen);
fs.readSync(fd, jsonBuf, 0, jsonLen, 16);
const index = JSON.parse(jsonBuf.toString('utf8'));
// payload begins after the 8-byte pickle prefix plus the aligned header payload
const baseOffset = 8 + headerSize;

const entries = [];
(function walk(node, p) {
  for (const k in node.files) {
    const v = node.files[k];
    const full = p ? p + '/' + k : k;
    if (v.files) walk(v, full);
    else entries.push({ path: full, offset: baseOffset + Number(v.offset || 0), size: v.size || 0 });
  }
})(index, '');

let count = 0;
for (const e of entries) {
  if (prefixes.length && !prefixes.some((pre) => e.path.startsWith(pre))) continue;
  const dest = path.join(outDir, e.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const buf = Buffer.alloc(e.size);
  fs.readSync(fd, buf, 0, e.size, e.offset);
  fs.writeFileSync(dest, buf);
  count++;
}
console.log(`extracted ${count} file(s) to ${outDir}`);
