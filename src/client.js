/* =============================================================================
 * dsh-theme-starfield — client half
 * -----------------------------------------------------------------------------
 * Runs inside the Web client after the plugin bundle loads. Four jobs:
 *
 *   1. occupy the alias-token layer           ctx.get('theme').overrideTokens
 *   2. inject the palette + structural CSS    one plugin-owned <style>
 *   3. mount the star field                   a fixed canvas behind the app
 *   4. end the boot plate                     html[data-sf-live]
 *
 * What is deliberately *not* here: the boot sweep itself (the Host half writes
 * it into the served index, so it plays before any plugin exists) and any
 * colour literal (the palette comes from the token layer).
 *
 * The theme follows DSH's Appearance setting rather than forcing a scheme: the
 * presenter sets `body[data-ds-dark-theme]`, our palette CSS keys off that
 * attribute, and the field engine is told which surface it is painting.
 * ========================================================================== */

'use strict';

var palette = require('./palette.js');
var engine = require('./field.js');

var PLUGIN_ID = 'dsh-theme-starfield';

/**
 * Shortest boot the Host's curtain may occupy before the ready flag retracts it.
 *
 * The animation is 1.78s of travel plus a 0.22s hand-off, so the floor is the
 * point where the band has finished crossing. Below it, the ready flag would
 * cut the signature sweep in half; above it, the app was slow enough that the
 * sweep had already finished on its own. Either way the flag never leaves a
 * coloured band on top of an app the user can see.
 */
var BOOT_MIN_MS = 1800;

/** Prose blocks whose rects routes and plus-marks must not cross. */
var PROSE_SELECTOR = [
  '#root p',
  '#root li',
  '#root blockquote',
  '#root pre',
  '#root td',
  '#root th',
  '#root h1',
  '#root h2',
  '#root h3',
  '#root h4',
  '#root textarea',
  '#root [contenteditable="true"]',
  '#root [class*="composerSeat"]',
  '#root [class*="composerStack"]',
  '#root [class*="bubble"]',
].join(',');

/**
 * The stylesheet, filled in by tools/build-package.js from src/palette.js and
 * src/components.css. A source checkout loaded without the build has no CSS to
 * inject beyond the palette, which is the honest degradation.
 */
var STYLE_SHEET = null; // BUILD:FILL-STYLE

/**
 * Collapse hundreds of paragraph rects into a handful of bands.
 *
 * The engine tests every segment against every rect, so handing it the raw
 * list would cost the frame budget for no visual gain: paragraphs that touch
 * are one block of prose as far as a route is concerned.
 * @param rects - viewport rects, already filtered.
 * @returns merged rects, in the { left, top, width, height } shape.
 */
function mergeBands(rects) {
  if (rects.length < 2) return rects;
  var sorted = rects.slice().sort(function (a, b) {
    return a.top - b.top;
  });
  var merged = [Object.assign({}, sorted[0])];
  for (var i = 1; i < sorted.length; i += 1) {
    var next = sorted[i];
    var last = merged[merged.length - 1];
    var horizontal = next.left < last.left + last.width && next.left + next.width > last.left;
    // 12px of air still reads as the same block once a stroke is padded by 18.
    var vertical = next.top <= last.top + last.height + 12;
    if (horizontal && vertical) {
      var right = Math.max(last.left + last.width, next.left + next.width);
      var bottom = Math.max(last.top + last.height, next.top + next.height);
      last.left = Math.min(last.left, next.left);
      last.top = Math.min(last.top, next.top);
      last.width = right - last.left;
      last.height = bottom - last.top;
    } else {
      merged.push(Object.assign({}, next));
    }
  }
  return merged;
}

/**
 * The live exclusion set: prose, the composer and the user bubble, in viewport
 * coordinates (the canvas is a fixed full-viewport layer, so they agree).
 * @returns merged rects; empty when the app has no transcript yet.
 */
function collectProseRects() {
  var out = [];
  var nodes;
  try {
    nodes = document.querySelectorAll(PROSE_SELECTOR);
  } catch (error) {
    return out;
  }
  var viewportW = window.innerWidth || 0;
  var viewportH = window.innerHeight || 0;
  for (var i = 0; i < nodes.length && out.length < 220; i += 1) {
    var node = nodes[i];
    var text = node.textContent;
    if (!text || !text.trim()) continue;
    var r = node.getBoundingClientRect();
    if (r.width < 24 || r.height < 8) continue;
    // Off-screen prose cannot be crossed by anything drawn on screen.
    if (r.bottom < 0 || r.top > viewportH || r.right < 0 || r.left > viewportW) continue;
    out.push({ left: r.left, top: r.top, width: r.width, height: r.height });
  }
  return mergeBands(out);
}

/** Which surface is active — read from the presenter's own marker. */
function currentMode() {
  return document.body && document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light';
}

/**
 * `avoid()` for the engine, memoised.
 *
 * One build pass asks for the exclusion set three times (rings, routes, grid)
 * and a single DOM query over the transcript is the expensive part. 80ms is
 * shorter than any rebuild interval, so a build always sees one consistent set
 * and the next build always re-reads the live DOM.
 * @returns merged rects.
 */
function makeRectSource() {
  var at = 0;
  var rects = [];
  return function proseRects() {
    var now = Date.now();
    if (now - at < 80) return rects;
    at = now;
    rects = collectProseRects();
    return rects;
  };
}

/** Stable signature of a rect set, so an unchanged layout costs no rebuild. */
function signature(rects) {
  var parts = [];
  for (var i = 0; i < rects.length; i += 1) {
    parts.push(
      Math.round(rects[i].left) + ',' + Math.round(rects[i].top) + ',' +
      Math.round(rects[i].width) + ',' + Math.round(rects[i].height)
    );
  }
  return parts.join(';');
}

/**
 * Install everything, idempotently. Returns a disposer.
 * @param ctx - client cordis context.
 */
function install(ctx) {
  var doc = document;
  var body = doc.body;
  if (!body) return function () {};

  var disposers = [];

  /* -- 1. stylesheet: palette now, tokens later ---------------------------- */
  var style = doc.createElement('style');
  style.setAttribute('data-plugin', PLUGIN_ID);
  style.textContent = STYLE_SHEET || palette.PALETTE_CSS;
  doc.head.appendChild(style);
  disposers.push(function () {
    style.remove();
  });

  /* -- 2. the alias-token layer ------------------------------------------- */
  // ui-theme may not have provided its service yet when a bundle is activated
  // early in the profile order, and a token layer installed against nothing is
  // silently lost. Retry for a couple of seconds, then give up: the CSS palette
  // still applies, so a failure here degrades the integration, not the theme.
  var themeLayer = null;
  var attempts = 0;
  function attachTokens() {
    attempts += 1;
    var theme = typeof ctx.get === 'function' ? ctx.get('theme') : null;
    if (theme && typeof theme.overrideTokens === 'function') {
      var layer = theme.overrideTokens(PLUGIN_ID, palette.TOKENS);
      themeLayer = layer;
      disposers.push(function () {
        if (typeof layer === 'function') layer();
      });
      return true;
    }
    return false;
  }
  if (!attachTokens()) {
    var timer = window.setInterval(function () {
      if (attachTokens() || attempts > 40) window.clearInterval(timer);
    }, 50);
    disposers.push(function () {
      window.clearInterval(timer);
    });
  }

  /* -- 3. the field -------------------------------------------------------- */
  var proseRects = makeRectSource();
  var canvas = doc.createElement('canvas');
  canvas.id = 'sf-field';
  canvas.setAttribute('aria-hidden', 'true');
  body.appendChild(canvas);

  var controller = engine.createStarfield(canvas, {
    // One seed per document load: the sky is ours, but it is not the same sky
    // twice in a row — the map reads as a place, not as wallpaper.
    seed: (Date.now() & 0x7fffffff) >>> 0,
    mode: currentMode(),
    avoid: proseRects,
  });
  if (controller) {
    disposers.push(function () {
      controller.destroy();
    });
  } else {
    canvas.remove();
  }

  /* -- 4. follow the surface + the layout ---------------------------------- */
  var refreshTimer = 0;
  var appliedMode = currentMode();
  var appliedSignature = '';

  /**
   * Paint the document ground from the active palette.
   *
   * The frame and the transcript are transparent, so `html` is the colour that
   * shows if the canvas is ever missing (no 2D context, or a browser that
   * refuses it). It has to come from `body`: the dark palette lives on the body
   * element, so the root's own `--sf-paper-1` is always the light one.
   */
  function paintDocumentGround() {
    var paper = getComputedStyle(body).getPropertyValue('--sf-paper-1');
    paper = paper && paper.trim();
    if (paper) document.documentElement.style.backgroundColor = paper;
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(function () {
      if (!controller) return;
      var mode = currentMode();
      var rects = proseRects();
      var nextSignature = signature(rects);
      // Streaming mutates the transcript continuously; rebuilding the geometry
      // for a layout that has not moved is pure cost.
      if (mode === appliedMode && nextSignature === appliedSignature) return;
      appliedMode = mode;
      appliedSignature = nextSignature;
      paintDocumentGround();
      controller.setMode(mode);
      controller.refresh();
    }, 220);
  }
  paintDocumentGround();

  if (typeof MutationObserver === 'function') {
    var observer = new MutationObserver(scheduleRefresh);
    observer.observe(body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
    // The transcript loads in waves; re-derive the exclusion set as it grows.
    var root = doc.getElementById('root');
    if (root) observer.observe(root, { childList: true, subtree: true });
    disposers.push(function () {
      observer.disconnect();
    });
  }

  // Scrolling moves the prose under the field without changing any layout the
  // engine observes, so it re-derives the exclusion set on its own schedule.
  window.addEventListener('scroll', scheduleRefresh, { passive: true, capture: true });
  disposers.push(function () {
    window.removeEventListener('scroll', scheduleRefresh, { capture: true });
  });

  // The theme's own switch in Settings also changes the body attribute through
  // the presenter, which the observer above already covers; this is the belt to
  // that pair of braces for the moment the observer is not installed.
  if (typeof ctx.on === 'function') {
    var off = ctx.on('theme/change', scheduleRefresh);
    if (typeof off === 'function') disposers.push(off);
  }

  /* -- 5. end the boot plate ----------------------------------------------- */
  // `performance.now()` is measured from navigation start, which is the same
  // clock the Host's boot CSS started on.
  var elapsed = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
  var reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var wait = reduce ? 0 : Math.max(0, BOOT_MIN_MS - elapsed);
  var bootTimer = window.setTimeout(function () {
    doc.documentElement.setAttribute('data-sf-live', '');
  }, wait);
  disposers.push(function () {
    window.clearTimeout(bootTimer);
    doc.documentElement.removeAttribute('data-sf-live');
  });

  return function dispose() {
    window.clearTimeout(refreshTimer);
    for (var i = disposers.length - 1; i >= 0; i -= 1) {
      try {
        disposers[i]();
      } catch (error) {
        /* a disposer must never break teardown */
      }
    }
    void themeLayer;
  };
}

/**
 * Client plugin body. The bundle is a singleton per document, so a second
 * activation (HMR, a duplicated bundle row) is a no-op rather than a second
 * canvas and a second token layer.
 * @param ctx - client cordis context.
 */
function apply(ctx) {
  if (typeof window === 'undefined' || !window.document) return;
  if (window.__dshThemeStarfield) return;
  window.__dshThemeStarfield = true;

  var dispose = install(ctx);
  // The guard exists to stop a *duplicate* activation from mounting a second
  // field; it is released on teardown so a plugin reload in the same document
  // (HMR, a re-enable in Settings) installs again instead of silently no-op'ing.
  function teardown() {
    window.__dshThemeStarfield = false;
    dispose();
  }
  if (ctx && typeof ctx.effect === 'function') {
    ctx.effect(function () {
      return teardown;
    }, 'starfield: field, palette and boot cut');
  }
}

module.exports = { apply: apply, PLUGIN_ID: PLUGIN_ID, collectProseRects: collectProseRects, mergeBands: mergeBands };
