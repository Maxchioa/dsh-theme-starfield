// List archive paths inside app.asar that match a regex.
//
// usage: node _tools/asar-list.js <app.asar> <regex> [max]
'use strict';
const fs = require('fs');

const [, , asarPath, reText, maxText] = process.argv;
if (!asarPath || !reText) {
  console.error('usage: node _tools/asar-list.js <app.asar> <regex> [max]');
  process.exit(2);
}
const re = new RegExp(reText);
const max = maxText ? Number(maxText) : 200;

const fd = fs.openSync(asarPath, 'r');
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, 16, 0);
const jsonLen = head.readUInt32LE(12);
const jsonBuf = Buffer.alloc(jsonLen);
fs.readSync(fd, jsonBuf, 0, jsonLen, 16);
const index = JSON.parse(jsonBuf.toString('utf8'));

let hits = 0;
(function walk(node, prefix) {
  if (hits >= max) return;
  for (const [name, child] of Object.entries(node.files || {})) {
    const p = prefix ? prefix + '/' + name : name;
    if (child.files) walk(child, p);
    else if (re.test(p)) {
      console.log(p + '\t' + child.size);
      hits++;
      if (hits >= max) return;
    }
  }
})(index, '');
if (hits === 0) console.error('no match for ' + reText);
