// Compare the shipped token inventory with the recovered value table.
//
// usage: node _tools/token-diff.js <tokens.txt> <token-values.json>
'use strict';
const fs = require('fs');
const [, , listPath, jsonPath] = process.argv;
const listed = fs
  .readFileSync(listPath, 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);
const table = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const known = new Map(table.tokens.map((t) => [t.token, t]));
const missing = listed.filter((t) => !known.has(t));
const extra = table.tokens.map((t) => t.token).filter((t) => !listed.includes(t));
console.log('listed=' + listed.length + ' recovered=' + table.tokens.length);
console.log('\nlisted but not recovered (' + missing.length + '):');
for (const t of missing) console.log('  ' + t);
console.log('\nrecovered but not listed (' + extra.length + '):');
for (const t of extra) console.log('  ' + t);
const aliasMissing = missing.filter((t) => t.startsWith('--dsw-alias-'));
console.log('\nalias missing: ' + aliasMissing.length);
