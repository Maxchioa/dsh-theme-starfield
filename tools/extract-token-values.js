// Recover the shipped --dsw-* token values (light + dark) from the ui-theme
// client bundle.
//
// The eight stylesheets the theme package injects are compiled into
// `lib/client.js` as double-quoted JS string literals (`var x_css_default = "…"`).
// Escaped sequences are JSON-compatible, so each literal is recovered with a
// scanner that respects escapes, then parsed declaration by declaration for the
// two scopes that carry the palette: `body{…}` (light) and
// `body[data-ds-dark-theme]{…}` (dark).
//
// usage: node tools/extract-token-values.js <client.js> <out.json>
'use strict';
const fs = require('fs');

const [, , srcPath, outPath] = process.argv;
if (!srcPath) {
  console.error('usage: node tools/extract-token-values.js <client.js> [out.json]');
  process.exit(2);
}
const src = fs.readFileSync(srcPath, 'utf8');

/** Read a double-quoted JS string literal starting at `start` (the quote). */
function readString(text, start) {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === quote) return { raw: text.slice(start, i + 1), end: i + 1 };
    i++;
  }
  throw new Error('unterminated string at ' + start);
}

// --- 1. collect the injected stylesheets -----------------------------------
const sheets = [];
const assign = /\b([A-Za-z0-9_]+_css_default)\s*=\s*"/g;
let m;
while ((m = assign.exec(src)) !== null) {
  const at = m.index + m[0].length - 1;
  const { raw } = readString(src, at);
  let text;
  try {
    text = JSON.parse(raw);
  } catch (error) {
    console.error('skip ' + m[1] + ': ' + error.message);
    continue;
  }
  sheets.push({ name: m[1], text });
}

// --- 2. walk every declaration in every rule, tagged with its scope ---------
// A rule is "selector{decls}". Stylesheets are flat enough for this; nested
// at-rules (@media/@supports) are tracked so their inner rules keep a scope.
const declarations = []; // { varName, value, scope, sheet }
function parseSheet(name, text) {
  let i = 0;
  const stack = []; // at-rule preludes
  let selector = null;
  let declStart = -1;
  // Start of the current top-level statement. The very first rule has no
  // preceding `}`/`;`, so the prelude must be read from 0 — reading from
  // `declStart` (still -1) silently dropped every sheet's first rule.
  let cursor = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      // skip strings (url(...), content)
      const q = ch;
      i++;
      while (i < text.length && text[i] !== q) { if (text[i] === '\\') i++; i++; }
      i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (ch === '{') {
      if (selector === null) {
        // at-rule prelude (begins with @) vs rule selector
        const prelude = text.slice(cursor, i).trim();
        if (prelude.startsWith('@')) {
          stack.push(prelude);
          cursor = i + 1;
          i++;
          continue;
        }
        selector = prelude;
        declStart = i + 1;
        i++;
        continue;
      }
      // nested block inside a rule: skip forward past it
      let depth = 1;
      i++;
      while (i < text.length && depth > 0) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth--;
        i++;
      }
      continue;
    }
    if (ch === '}') {
      if (selector !== null) {
        const body = text.slice(declStart, i);
        emit(name, stack.join(' '), selector, body);
        selector = null;
      } else {
        stack.pop();
      }
      declStart = i + 1;
      cursor = i + 1;
      i++;
      continue;
    }
    if (ch === ';' && selector === null) {
      declStart = i + 1; // stray @import / @charset
      cursor = i + 1;
    }
    i++;
  }
  function emit(sheetName, atRules, sel, body) {
    // declarations may contain `;` inside functions — split on top level only
    let depth = 0;
    let from = 0;
    const parts = [];
    for (let k = 0; k < body.length; k++) {
      const c = body[k];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ';' && depth === 0) {
        parts.push(body.slice(from, k));
        from = k + 1;
      }
    }
    parts.push(body.slice(from));
    for (const part of parts) {
      const idx = part.indexOf(':');
      if (idx < 0) continue;
      const prop = part.slice(0, idx).trim();
      if (!prop.startsWith('--')) continue;
      declarations.push({
        varName: prop,
        value: part.slice(idx + 1).trim(),
        selector: sel.trim(),
        atRules,
        sheet: sheetName,
      });
    }
  }
}

for (const sheet of sheets) parseSheet(sheet.name, sheet.text);

// --- 3. resolve light/dark per token --------------------------------------
const DARK_SELECTOR = /^(:root|html|body)\[data-ds-dark-theme\]$/;
const LIGHT_SELECTORS = new Set(['body', ':root', 'html', 'body,body*']);
const byToken = new Map();
const unscoped = new Set();
for (const d of declarations) {
  const sel = d.selector.replace(/\s+/g, '');
  const isDark = DARK_SELECTOR.test(sel);
  // Element-scoped overrides (menus, tooltips, code wells) are component rules,
  // not palette slots: their values are deliberately left out of the slots.
  const isLight = !isDark && LIGHT_SELECTORS.has(sel);
  if (!isLight && !isDark) {
    unscoped.add(d.varName + '  [' + d.selector + ']');
    continue;
  }
  if (!byToken.has(d.varName)) byToken.set(d.varName, { token: d.varName, light: null, dark: null, source: [] });
  const row = byToken.get(d.varName);
  // Later sheets win in cascade order; keep the last value seen per slot and
  // record every declaration so conflicts are visible.
  if (isDark) row.dark = d.value;
  else row.light = d.value;
  row.source.push({ slot: isDark ? 'dark' : 'light', sheet: d.sheet, selector: d.selector, value: d.value });
}

const rows = [...byToken.values()].sort((a, b) => a.token.localeCompare(b.token));
const out = {
  generatedFrom: srcPath,
  sheets: sheets.map((s) => s.name),
  counts: {
    tokens: rows.length,
    alias: rows.filter((r) => r.token.startsWith('--dsw-alias-')).length,
    withDarkOverride: rows.filter((r) => r.dark !== null).length,
  },
  tokens: rows,
  unscoped: [...unscoped].sort(),
};
const json = JSON.stringify(out, null, 2);
if (outPath) {
  fs.writeFileSync(outPath, json);
  console.log('wrote ' + outPath);
} else {
  console.log(json);
}
console.error(
  'sheets=' + sheets.length +
  ' declarations=' + declarations.length +
  ' tokens=' + out.counts.tokens +
  ' alias=' + out.counts.alias +
  ' dark-overridden=' + out.counts.withDarkOverride
);
