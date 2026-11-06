// Print recovered --dsw-static-* / --dsw-specific-* tokens with both slots.
//
// usage: node _tools/static-table.js <token-values.json> [prefix]
'use strict';
const fs = require('fs');
const [, , jsonPath, prefix = '--dsw-static-'] = process.argv;
const table = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const rows = table.tokens.filter((t) => t.token.startsWith(prefix));
console.log(rows.length + ' tokens with prefix ' + prefix + '\n');
for (const r of rows) {
  console.log(r.token.padEnd(44) + (r.light || '').padEnd(54) + (r.dark || '(inherit)'));
}
