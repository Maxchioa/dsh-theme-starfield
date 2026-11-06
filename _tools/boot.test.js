// Boot-screen checks: allocation bounds, CSS shape, and the two regressions that
// cost time in the preview build.
//
// usage: node _tools/boot.test.js
'use strict';
const path = require('path');

const root = path.resolve(__dirname, '..');
const host = require(path.join(root, 'src', 'host.js'));

let failures = 0;
let checks = 0;
function ok(name, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error('FAIL ' + name + (detail ? '\n     ' + detail : ''));
}

/** Deterministic `() => [0,1)` so an allocation can be reproduced. */
function seeded(seed) {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------- 1. allocation */
console.log('allocation');
const samples = [];
for (let seed = 1; seed <= 400; seed += 1) samples.push(host.allocateBand(seeded(seed)));

const outOfRange = samples.filter(
  (band) =>
    band.shares.some((s) => s < 0.12 - 1e-9 || s > 0.31 + 1e-9) ||
    band.bandVw < 56 - 1e-9 ||
    band.bandVw > 72 + 1e-9 ||
    band.skew < -17 - 1e-9 ||
    band.skew > -11 + 1e-9
);
ok('strip shares stay inside [0.12, 0.31], band inside [56, 72]vw, shear inside [-17, -11]deg',
  outOfRange.length === 0, JSON.stringify(outOfRange[0] && outOfRange[0].shares));

const notNormalised = samples.filter((band) => {
  const sum = band.shares.reduce((a, b) => a + b, 0);
  return Math.abs(sum - 1) > 1e-6;
});
ok('shares normalise to exactly one band', notNormalised.length === 0, String(notNormalised[0] && notNormalised[0].shares));

// All five strips must ever be the widest: an allocation that always favours the
// same colour is a layout bug wearing randomness.
const widest = new Set();
for (const band of samples) {
  let best = 0;
  band.shares.forEach((s, i) => {
    if (s > band.shares[best]) best = i;
  });
  widest.add(best);
}
ok('every colour can be the widest strip', widest.size === 5, 'winners: ' + [...widest].join(','));

// ...and the spread has to be visible, or "allocated" is just "equal fifths".
const spreads = samples.map((band) => Math.max(...band.shares) / Math.min(...band.shares));
const medianSpread = spreads.slice().sort((a, b) => a - b)[Math.floor(spreads.length / 2)];
ok('allocation produces a visible ratio (median max:min > 1.35)', medianSpread > 1.35, 'median ' + medianSpread.toFixed(2));

/* ------------------------------------------------------------------ 2. the CSS */
console.log('\ncss');
const MARK = 'data:image/svg+xml,chart%23x';
const css = host.bootStyle(MARK, seeded(7));

ok('no unresolved placeholder', !/BUILD:FILL-/.test(css));
ok('curtain is fixed and above the app', /html::after\{[^}]*position:fixed[^}]*z-index:2147483600/.test(css));
ok('band sits in front of the whale', /z-index:2147483602/.test(css) && /z-index:2147483601/.test(css));
ok('the whale is drawn from the data URI', css.includes('url("' + MARK + '")'));

// Regression 1: `--skew` once held `skewX(…)` while the CSS wrapped it again,
// which is an invalid transform that silently dropped to `none`, parking the
// band at the left edge. The angle must appear exactly once per expression.
ok('skewX is never nested', !/skewX\([^)]*skewX\(/.test(css), (css.match(/skewX\([^)]*skewX\(/g) || [])[0]);

// Regression 2: an unset travel variable would make the transform invalid. The
// build writes literals, so both offsets must be present in the keyframes.
const from = css.match(/from\{transform:translateX\((-?[\d.]+)vw\) skewX\((-?[\d.]+)deg\)\}/);
const to = css.match(/to\{transform:translateX\((-?[\d.]+)vw\) skewX\((-?[\d.]+)deg\)\}/);
ok('keyframes carry literal travel offsets', !!from && !!to, css.slice(css.indexOf('@keyframes sf-sweep'), css.indexOf('@keyframes sf-sweep') + 180));
ok('the band starts off the left edge', !!from && Number(from[1]) < -40, from && from[1]);
ok('the band clears the right edge', !!to && Number(to[1]) >= 100, to && to[1]);

// Every strip must be a hard stop, and the gradient must fill the band. The
// colours are literals: a `var()` here would resolve to nothing on html::before
// and invalidate the whole background (the bug this assertion exists for).
const stops = css.match(/#[0-9a-f]{6} [\d.]+% [\d.]+%/gi) || [];
ok('gradient has five hard stops', stops.length === 5, String(stops.length));
ok('gradient ends at 100%', /#F4F5F7 [\d.]+% 100(?:\.0+)?%/i.test(css));
ok('the band carries no unresolved var()', !/var\(--sf-livery/.test(css));

// The readiness flag must retract both marks, and the fallback must exist.
ok('readiness hides the band', /html\[data-sf-live\]::before\{[^}]*visibility:hidden/.test(css));
ok('readiness hides the whale', /html\[data-sf-live\] body::before\{[^}]*visibility:hidden/.test(css));
ok('readiness fades the curtain', /html\[data-sf-live\]::after\{animation:sf-plate-out 220ms/.test(css));
ok('a fallback retracts the curtain even with no client', /html::after\{[^}]*animation:sf-plate-out 420ms ease-out 6000ms forwards/.test(css));

// The dark pre-plugin canvas must stop applying once the flag is set: an
// unscoped !important background would outrank the theme's own ground forever.
ok('the pre-plugin canvas is scoped to the boot interval',
  /html:not\(\[data-sf-live\]\)/.test(css) && !/(^|[,{])html,body\{background-color/.test(css),
  css.slice(0, 200));

// Reduced motion: no band, but the whale and the readiness lift stay.
ok('reduced motion drops the band', /prefers-reduced-motion:reduce\)\{html::before\{display:none\}/.test(css));

// The native boot card is silenced only while it still carries its spinner, so a
// failed plugin load can still show its error.
ok('native boot card is silenced, not deleted', /\:has\(\[data-dsh-boot-spinner\]\) > \*\{display:none/.test(css));

/* --------------------------------------------------------- 3. determinism */
console.log('\ndeterminism');
const a = host.bootStyle(MARK, seeded(11));
const b = host.bootStyle(MARK, seeded(11));
const c = host.bootStyle(MARK, seeded(12));
ok('the same seed yields the same layout', a === b);
ok('a different seed yields a different layout', a !== c);

/* ---------------------------------------------------- 4. host wiring shape */
console.log('\nhost wiring');
const rows = [];
const ctx = {
  on(event, handler) {
    if (event === 'webserver/index-inject') handler(rows);
  },
};
host.apply(ctx);
ok('index-inject pushes exactly one style row', rows.length === 1 && rows[0].kind === 'style', JSON.stringify(rows.map((r) => r.kind)));
ok('the row is CSS, not script', typeof rows[0].text === 'string' && rows[0].text.includes('html::after'));

const noBus = [];
host.apply({}); // a context without an event bus must not throw

console.log('\n' + (failures === 0 ? 'PASS' : 'FAIL') + ' — ' + checks + ' checks, ' + failures + ' failure(s)');
process.exit(failures === 0 ? 0 : 1);
