// Offline theme checks: coverage, shape, palette parity, CSS balance.
//
// These are the invariants that can be proven without a running DSH, so they run
// on every build. In-situ rendering is verified separately.
//
// usage: node _tools/theme.test.js
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const { PALETTE_CSS, TOKENS } = require(path.join(root, 'src', 'palette.js'));

let failures = 0;
let checks = 0;
function ok(name, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error('FAIL ' + name + (detail ? '\n     ' + detail : ''));
}
function section(title) {
  console.log('\n' + title);
}

/* ------------------------------------------------------------------ 1. shape */
section('token map');
const entries = Object.entries(TOKENS);
ok('non-empty map', entries.length > 100, entries.length + ' entries');
const KNOWN_EXTRAS = new Set(['--ds-font-family-code']);
let badShape = [];
for (const [name, value] of entries) {
  if (!name.startsWith('--dsw-') && !KNOWN_EXTRAS.has(name)) badShape.push(name + ' (not a --dsw- token)');
  if (!value || typeof value !== 'object') { badShape.push(name + ' (not an object)'); continue; }
  if (typeof value.light !== 'string' || value.light.trim() === '') badShape.push(name + '.light');
  if (typeof value.dark !== 'string' || value.dark.trim() === '') badShape.push(name + '.dark');
}
ok('every value is a non-empty { light, dark } pair', badShape.length === 0, badShape.join(', '));

/* --------------------------------------------------------------- 2. coverage */
section('coverage of the shipped inventory');
const inventory = fs
  .readFileSync(path.join(root, '_reference', 'tokens.txt'), 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);
const aliases = inventory.filter((t) => t.startsWith('--dsw-alias-'));
const mappedAliases = aliases.filter((t) => t in TOKENS);
const missing = aliases.filter((t) => !(t in TOKENS));
ok('every --dsw-alias-* token is mapped', missing.length === 0, missing.join('\n     '));
console.log('  aliases: ' + aliases.length + ' shipped, ' + mappedAliases.length + ' mapped');

// A mapped token that DSH does not publish is a typo, not a feature. The one
// deliberate exception is the code font family: the shipped sheets read it as
// `--ds-font-family-code` (no `w`), so a theme that wants Cascadia Mono has to
// occupy that exact name.
const known = new Set(inventory);
const invented = entries.map(([n]) => n).filter((n) => !known.has(n) && !KNOWN_EXTRAS.has(n));
ok('no mapped token is outside the shipped inventory', invented.length === 0, invented.join('\n     '));

/* --------------------------------------------------- 3. palette parity (docs) */
section('palette parity with preview/tokens.css');
const previewCss = fs.readFileSync(path.join(root, 'preview', 'tokens.css'), 'utf8');
/** Every `--sf-x: value;` in a block, keyed by `slot|name`. */
function readPaletteVars(css, slot) {
  const map = new Map();
  const re = /(--sf-[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(css)) !== null) map.set(slot + '|' + m[1], m[2].trim());
  return map;
}
function splitPalette(css) {
  // `:root { … }` is the light slot, `body[data-ds-dark-theme] { … }` is the dark
  // slot, and a bare `body { … }` block is slot-independent (livery, type).
  const light = [];
  const dark = [];
  const re = /(body\[data-ds-dark-theme\]|:root|body)\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    if (m[1] === ':root') light.push(m[2]);
    else if (m[1] === 'body') { light.push(m[2]); dark.push(m[2]); }
    else dark.push(m[2]);
  }
  return { light: light.join('\n'), dark: dark.join('\n') };
}
const shipped = splitPalette(PALETTE_CSS);
const shippedLight = readPaletteVars(shipped.light, 'light');
const shippedDark = readPaletteVars(shipped.dark, 'dark');

const previewDarkBlock = previewCss.slice(previewCss.indexOf(':root'), previewCss.indexOf('[data-sf-mode="light"]'));
const previewLightBlock = previewCss.slice(previewCss.indexOf('[data-sf-mode="light"]'));
const previewDark = readPaletteVars(previewDarkBlock, 'dark');
const previewLight = readPaletteVars(previewLightBlock, 'light');

const norm = (v) => v.replace(/\s+/g, ' ').trim().toLowerCase();
const drift = [];
for (const [key, value] of previewDark) {
  if (!shippedDark.has(key)) continue;
  if (norm(shippedDark.get(key)) !== norm(value)) drift.push(key + ': preview ' + value + ' vs package ' + shippedDark.get(key));
}
for (const [key, value] of previewLight) {
  if (!shippedLight.has(key)) continue;
  if (norm(shippedLight.get(key)) !== norm(value)) drift.push(key + ': preview ' + value + ' vs package ' + shippedLight.get(key));
}
ok('colours shared with the preview are identical', drift.length === 0, drift.join('\n     '));
console.log('  shared with preview: ' + [...previewDark.keys(), ...previewLight.keys()].filter((k) => shippedDark.has(k) || shippedLight.has(k)).length + ' declarations');

// Every --sf-* the map references must exist in the palette. The livery, type
// and tracking block is slot-independent, so "declared in the light block"
// covers it; what must never happen is a var declared in dark only, because the
// light surface would then resolve to nothing.
const referenced = new Set();
for (const value of Object.values(TOKENS)) {
  for (const v of [value.light, value.dark]) {
    const re = /var\((--sf-[a-z0-9-]+)\)/gi;
    let m;
    while ((m = re.exec(v)) !== null) referenced.add(m[1]);
  }
}
const declaredAny = new Set([...shippedLight.keys(), ...shippedDark.keys()].map((k) => k.split('|')[1]));
const undefinedRefs = [...referenced].filter((n) => !declaredAny.has(n));
ok('every --sf-* used by the map is declared', undefinedRefs.length === 0, undefinedRefs.join(', '));
const darkOnly = [...shippedDark.keys()]
  .map((k) => k.split('|')[1])
  .filter((n) => !shippedLight.has('light|' + n));
ok('no --sf-* is declared in the dark block only', darkOnly.length === 0, darkOnly.join(', '));

/* -------------------------------------------------------------- 4. CSS balance */
section('css');
function balanced(css) {
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}
ok('palette CSS is balanced', balanced(PALETTE_CSS));
ok('map values contain no stray semicolon', entries.every(([, v]) => !/[;{}]/.test(v.light + v.dark)));

const components = path.join(root, 'src', 'components.css');
if (fs.existsSync(components)) {
  const css = fs.readFileSync(components, 'utf8');
  ok('components.css is balanced', balanced(css));
  ok('components.css declares no colour literals outside var()/rgba scrims',
    !/#[0-9a-f]{6}\b/i.test(css),
    (css.match(/#[0-9a-f]{6}\b/gi) || []).join(', '));
}

/* -------------------------------------------------------------------- result */
console.log('\n' + (failures === 0 ? 'PASS' : 'FAIL') + ' — ' + checks + ' checks, ' + failures + ' failure(s)');
process.exit(failures === 0 ? 0 : 1);
