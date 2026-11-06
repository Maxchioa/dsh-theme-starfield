/* =============================================================================
 * dsh-theme-starfield — host half
 * -----------------------------------------------------------------------------
 * The theme is a client-side design; this half owns only the interval *before*
 * any client bundle exists — the native boot screen. It cannot be done from the
 * client: DSH has already painted its own plate ("HARNESS", a spinner, "Loading
 * plugins…") by the time a plugin is fetched, and only a stylesheet injected
 * into the served index can get in front of that.
 *
 * `webserver/index-inject` fires on every index response, and the rows pushed in
 * are rendered in document order. One `<style>` row is the whole seam.
 *
 * Three things live in that row:
 *
 *   1. THE PRE-PLUGIN CANVAS. Dark ground, dark color-scheme, and DSH's own boot
 *      card silenced (but not removed while it carries its spinner, so a real
 *      plugin-load failure still shows its error).
 *   2. THE CURTAIN. A fixed, opaque plate in the star map's ground colour with
 *      the whale on it. It stays up until the client half sets
 *      `html[data-sf-live]`, so the app is never revealed half-built; a 6s
 *      fallback retracts it if the client half never arrives at all.
 *   3. THE SWEEP. One sheared band of the five livery colours crossing once, in
 *      front of the whale, CSS-only.
 *
 * Why the geometry is written here, per response, as literal values: it is what
 * keeps the boot JavaScript-free. Every value the animation needs — the five
 * strip widths, the band width, both travel offsets and the shear angle — is
 * drawn on the Host from the same allocation the design describes, then baked
 * into the CSS text. There is no client script to run before the first frame,
 * and no variable that could arrive unset and drop the transform (the bug that
 * once left the band parked at `left: 0`).
 * ========================================================================== */

'use strict';

var palette = require('./palette.js');

/**
 * Data URI of the whale mark. Filled in by tools/build-package.js from the brand
 * artwork (preview/brand-paths.js), so the shipped Host half carries no file
 * dependency and the boot screen needs no request to draw its own logo.
 */
var BOOT_MARK_URI = null; // BUILD:FILL-MARK

/** Strip allocation bounds, as shares of the band before normalisation. */
var SHARE_MIN = 0.7;
var SHARE_MAX = 1.4;
/** Post-normalisation clamp: no colour collapses, none becomes a wall. */
var FLOOR_SHARE = 0.12;
var CEIL_SHARE = 0.31;
/** Band width and shear, drawn per load. */
var BAND_MIN_VW = 56;
var BAND_MAX_VW = 72;
var SKEW_MIN = -17;
var SKEW_MAX = -11;

/**
 * Allocate one band layout.
 *
 * Widths are *allocated, not equal*: each colour draws a weight, the five are
 * normalised to the band, then clamped. Equal fifths read as a logo template;
 * uneven strips read as paint.
 *
 * The colours are baked in as literals rather than read from `--sf-livery-*`:
 * the boot row runs before the client half that declares those variables, and a
 * `var()` that resolves to nothing invalidates the whole `background`
 * declaration — which is exactly how the band went missing the first time.
 *
 * @param random - `() => number in [0,1)`.
 * @param livery - five colours, in the game's order.
 * @returns the literal CSS values for this load.
 */
function allocateBand(random, livery) {
  var colors = Array.isArray(livery) && livery.length === 5 ? livery : palette.LIVERY;
  var weights = [];
  var i;
  for (i = 0; i < 5; i += 1) weights.push(SHARE_MIN + random() * (SHARE_MAX - SHARE_MIN));
  var sum = weights.reduce(function (a, b) {
    return a + b;
  }, 0);
  var shares = weights.map(function (w) {
    return w / sum;
  });
  shares = shares.map(function (s) {
    return Math.min(CEIL_SHARE, Math.max(FLOOR_SHARE, s));
  });
  var total = shares.reduce(function (a, b) {
    return a + b;
  }, 0);
  shares = shares.map(function (s) {
    return s / total;
  });

  var bandVw = BAND_MIN_VW + random() * (BAND_MAX_VW - BAND_MIN_VW);
  var skew = SKEW_MIN + random() * (SKEW_MAX - SKEW_MIN);
  // Travel budget: the band only reads while it is on screen, so the off-screen
  // run-up is 60% of the band plus 18vw of shear slack rather than a full band
  // width plus margin. A longer run-up spends most of the animation approaching.
  var from = -(bandVw * 0.6 + 18);
  var to = 118;

  // Hard stops, in band-relative percentages.
  var stops = [];
  var cursor = 0;
  for (i = 0; i < shares.length; i += 1) {
    var start = cursor * 100;
    cursor += shares[i];
    var end = i === shares.length - 1 ? 100 : cursor * 100;
    stops.push(colors[i] + ' ' + start.toFixed(2) + '% ' + end.toFixed(2) + '%');
  }

  return {
    bandVw: bandVw,
    skew: skew,
    from: from,
    to: to,
    shares: shares,
    colors: colors,
    gradient: 'linear-gradient(90deg, ' + stops.join(', ') + ')',
  };
}

/**
 * Build the index-injection style row.
 * @param markUri - data URI of the whale mark (built from the brand artwork).
 * @param random - `() => number in [0,1)`; injectable so a test can pin a layout.
 * @returns the CSS text for one index response.
 */
function bootStyle(markUri, random) {
  var band = allocateBand(typeof random === 'function' ? random : Math.random);
  var ground = palette.BOOT.ground;

  return [
    /* -- 1. the pre-plugin canvas ------------------------------------------ */
    // `background-color` is !important because ui-theme's own boot row, which
    // renders after this one, paints `body { background-color: #fff }`.
    'html,body{background-color:' + ground + ' !important}',
    // No !important: the presenter writes the resolved scheme as an inline
    // style the moment the app is up, and an inline style is what should win.
    ':root{color-scheme:dark}',
    // DSH's boot card keeps its error state: the card is only silenced while it
    // still carries the spinner marker, and a failed load drops that marker.
    '[data-dsh-boot]:has([data-dsh-boot-spinner]){background:' + ground + ' !important}',
    '[data-dsh-boot]:has([data-dsh-boot-spinner]) > *{display:none !important}',

    /* -- 2. the curtain ---------------------------------------------------- */
    'html::after{content:"";position:fixed;inset:0;z-index:2147483600;pointer-events:none;',
    'background:' + ground + ';',
    // The fallback retraction: if the client half never runs, the app still
    // gets its screen back instead of a permanently covered window.
    'animation:sf-plate-out 420ms ease-out 6000ms forwards}',

    /* -- the whale, fading in behind the band ------------------------------ */
    'body::before{content:"";position:fixed;left:50%;top:50%;width:46px;height:34px;',
    'margin:-17px 0 0 -23px;z-index:2147483601;pointer-events:none;',
    'background:url("' + markUri + '") center / contain no-repeat;opacity:0;',
    'animation:sf-mark-in 450ms ease-out 350ms both}',

    /* -- 3. the sweep, in front of the whale ------------------------------- */
    'html::before{content:"";position:fixed;top:-16vh;bottom:-16vh;left:0;',
    'width:' + band.bandVw.toFixed(3) + 'vw;z-index:2147483602;pointer-events:none;',
    'background:' + band.gradient + ';',
    'transform:translateX(' + band.from.toFixed(3) + 'vw) skewX(' + band.skew.toFixed(2) + 'deg);',
    'animation:sf-sweep 1700ms cubic-bezier(0.4,0,0.2,1) 80ms both}',

    '@keyframes sf-sweep{',
    'from{transform:translateX(' + band.from.toFixed(3) + 'vw) skewX(' + band.skew.toFixed(2) + 'deg)}',
    'to{transform:translateX(' + band.to.toFixed(3) + 'vw) skewX(' + band.skew.toFixed(2) + 'deg)}}',
    '@keyframes sf-mark-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}',
    '@keyframes sf-plate-out{to{opacity:0;visibility:hidden}}',

    /* -- the readiness cut ------------------------------------------------- */
    // Set by the client half once the app is up (and never before the sweep has
    // finished). The band is dropped in one frame rather than frozen mid-travel,
    // the whale goes with it, and the curtain fades.
    'html[data-sf-live]::before{animation:none;opacity:0;visibility:hidden}',
    'html[data-sf-live] body::before{animation:none;opacity:0;visibility:hidden}',
    'html[data-sf-live]::after{animation:sf-plate-out 220ms ease-out forwards}',

    /* -- reduced motion ---------------------------------------------------- */
    // The band is never the only thing saying "starting": the whale still
    // appears, and the curtain still lifts on readiness.
    '@media (prefers-reduced-motion:reduce){',
    'html::before{display:none}',
    'body::before{opacity:1;animation:none}',
    'html::after{animation:none}',
    'html[data-sf-live]::after{animation:sf-plate-out 220ms ease-out forwards}}',
  ].join('');
}

/**
 * Host activation. The listener is registered per plugin instance and pushes
 * fresh rows on every index render; unloading withdraws it with the plugin.
 * @param ctx - host context carrying the webserver event.
 */
function apply(ctx) {
  var log = function (text) {
    try {
      if (ctx && ctx.logger && typeof ctx.logger.info === 'function') ctx.logger.info(text);
      else if (ctx && typeof ctx.log === 'function') ctx.log(text);
      else console.log('[theme-starfield] ' + text);
    } catch (error) {
      /* logging must never break activation */
    }
  };

  if (typeof ctx.on !== 'function') {
    log('host half: no event bus on this context — boot screen left to DSH');
    return;
  }

  var markUri = BOOT_MARK_URI || null;
  if (!markUri) {
    // Without the mark the curtain is still correct: a dark plate that lifts on
    // readiness. Better than not covering the native screen at all.
    log('host half: brand mark unavailable — boot screen runs without the whale');
  }

  ctx.on('webserver/index-inject', function (table) {
    if (!Array.isArray(table)) return;
    table.push({ kind: 'style', text: bootStyle(markUri || '', Math.random) });
  });
}

module.exports = { apply: apply, bootStyle: bootStyle, allocateBand: allocateBand };
