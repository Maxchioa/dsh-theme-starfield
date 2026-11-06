// Pull one file out of app.asar by its archive path, and print its size.
//
// Naive header walkers return 0 bytes for some entries in this archive, so this
// one computes the payload base explicitly: the header is a padded pickle, the
// JSON length sits at uint32@12, and file data starts at 8 + uint32@4.
//
// usage: node _tools/asar-one.js <app.asar> <archive/path.js> <out file>
'use strict';
const fs = require('fs');

const [, , asarPath, inner, outPath] = process.argv;
const fd = fs.openSync(asarPath, 'r');
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, 16, 0);
const jsonLen = head.readUInt32LE(12);
const jsonBuf = Buffer.alloc(jsonLen);
fs.readSync(fd, jsonBuf, 0, jsonLen, 16);
const index = JSON.parse(jsonBuf.toString('utf8'));
const base = 8 + head.readUInt32LE(4);

let node = index;
for (const part of inner.split('/')) {
  if (!node || !node.files || !node.files[part]) {
    console.error('not found: ' + inner);
    process.exit(1);
  }
  node = node.files[part];
}
if (node.files) {
  console.error('that path is a directory');
  process.exit(1);
}

const buf = Buffer.alloc(node.size);
fs.readSync(fd, buf, 0, node.size, base + Number(node.offset));
fs.writeFileSync(outPath, buf);
console.log(`wrote ${outPath} (${node.size} bytes)`);
