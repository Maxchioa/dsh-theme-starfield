// Print the recovered alias token table as a compact, reviewable list.
//
// usage: node _tools/alias-table.js <token-values.json> [--md]
'use strict';
const fs = require('fs');
const [, , jsonPath, flag] = process.argv;
const table = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const rows = table.tokens.filter((t) => t.token.startsWith('--dsw-alias-'));
const md = flag === '--md';
if (!md) console.log('alias tokens: ' + rows.length + '\n');
for (const r of rows) {
  const name = r.token.replace('--dsw-alias-', '');
  if (md) console.log('| `' + name + '` | `' + (r.light || '') + '` | `' + (r.dark || '(inherit)') + '` |');
  else console.log(name.padEnd(46) + (r.light || '').padEnd(52) + (r.dark || '(inherit from light)'));
}
