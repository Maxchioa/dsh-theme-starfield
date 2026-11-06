/* =============================================================================
 * dsh-theme-starfield — star map engine
 * -----------------------------------------------------------------------------
 * Port of preview/starfield.js, with three differences that the real app forces:
 *
 *   1. IT IS THE PAGE, NOT A LAYER OVER IT. DSH's frame and transcript column
 *      paint `--dsw-alias-bg-base`, which this theme maps to transparent, so the
 *      canvas paints the sky itself: an opaque ground, then the field on top.
 *      Rendering behind the app is also what keeps text crisp — dots are never
 *      composited over glyphs.
 *
 *   2. THE EXCLUSION ZONES ARE REAL. The preview passed a fixed reading column;
 *      here `avoid()` reads the live transcript, composer and panels, so a route
 *      can never be drawn behind a paragraph (the invariant in
 *      _tools/field.test.js). Dots are allowed behind prose — that is the map —
 *      but nothing stroked is.
 *
 *   3. THE LIGHT SURFACE IS PRINTED PAPER. No glow, no tinted waypoints, drift
 *      at 35%, and the sky is a paper gradient with a printed bezel edge instead
 *      of a vignette. Paper does not bloom.
 *
 * The rest is the preview engine unchanged, including the two properties that
 * matter most: crisp small dots with no bloom, and a loose jittered plus-grid
 * that carries the identity further than any gradient.
 * ========================================================================== */

'use strict';

var TAU = Math.PI * 2;
var REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/** Read a palette variable; the palette lives on `body`, so that is the scope. */
function cssVar(name, fallback) {
  try {
    var value = getComputedStyle(document.body).getPropertyValue(name);
    value = value && value.trim();
    return value || fallback;
  } catch (error) {
    return fallback;
  }
}

/** Deterministic RNG (mulberry32) so a reload keeps the same sky. */
function createRng(seed) {
  var state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Segment vs axis-aligned rect, slab method. Exported for the invariant test. */
function segmentHitsRect(x1, y1, x2, y2, rect) {
  var dx = x2 - x1;
  var dy = y2 - y1;
  var t0 = 0;
  var t1 = 1;
  var p = [-dx, dx, -dy, dy];
  var q = [x1 - rect.x, rect.x + rect.w - x1, y1 - rect.y, rect.y + rect.h - y1];
  for (var i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      var t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

function pointBlocked(x, y, rects) {
  for (var i = 0; i < rects.length; i += 1) {
    var r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

function strokeBlocked(x1, y1, x2, y2, rects) {
  for (var i = 0; i < rects.length; i += 1) {
    if (segmentHitsRect(x1, y1, x2, y2, rects[i])) return true;
  }
  return false;
}

/**
 * Build a field on a canvas.
 * @param canvas - the target canvas (sized by the engine).
 * @param options - see DEFAULTS.
 * @returns a controller, or null when the canvas has no 2D context.
 */
function createStarfield(canvas, options) {
  var opts = Object.assign(
    {
      seed: 20230906,
      starDensity: 5200, // one star per N css px²
      maxStars: 340,
      minStars: 60,
      drift: 1,
      parallax: 0.9,
      lines: true,
      edgeDistance: 210,
      edgeBudget: 9,
      waypoints: 3,
      crosshairs: true,
      /** () => [{left, top, width, height}] in canvas space; strokes avoid them. */
      avoid: null,
      mode: 'dark', // 'dark' | 'light'
      reducedMotion: null, // null = follow the media query
    },
    options || {}
  );

  var ctx2d = canvas.getContext('2d');
  if (!ctx2d) return null;

  var reduceMq = typeof matchMedia === 'function' ? matchMedia(REDUCE_QUERY) : null;
  var state = {
    width: 0,
    height: 0,
    dpr: 1,
    stars: [],
    edges: [],
    crosshairs: [],
    rings: [],
    pointer: { x: 0, y: 0, tx: 0, ty: 0 },
    raf: 0,
    lastTime: 0,
    started: false,
    paused: false,
    // How many times the sky has been re-placed. A rebuild is only legal on a
    // size change; the count is what the scroll regression test watches.
    skyBuilds: 0,
    // Size the sky was last placed for, so a resize can carry it across instead
    // of re-placing it.
    prevWidth: 0,
    prevHeight: 0,
  };
  var colors = {};

  function prefersReduced() {
    if (opts.reducedMotion !== null) return !!opts.reducedMotion;
    return !!(reduceMq && reduceMq.matches);
  }

  function isLight() {
    return opts.mode === 'light';
  }

  function readColors() {
    colors.paper1 = cssVar('--sf-paper-1', isLight() ? '#C7C8D3' : '#0A0E15');
    colors.paper2 = cssVar('--sf-paper-2', isLight() ? '#B1B3C1' : '#070A10');
    colors.star = cssVar('--sf-star', isLight() ? '#4A5158' : '#EAEEF4');
    colors.grid = cssVar('--sf-grid', 'rgba(226,232,240,0.075)');
    colors.route = cssVar('--sf-route', '#3FC9DE');
    colors.accent = cssVar('--sf-accent', '#EE9A2C');
    colors.line = cssVar('--sf-line-strong', 'rgba(226,232,240,0.2)');
    colors.vignette = cssVar('--sf-vignette', 'rgba(2,4,7,0.62)');
  }

  /**
   * Exclusion zones, padded so a stroke stops short of the text rather than
   * touching its edge. Callers hand in client rects; the engine works in
   * canvas space, which for a fixed full-viewport canvas is the same thing.
   */
  function avoidRects() {
    if (typeof opts.avoid !== 'function') return [];
    var list;
    try {
      list = opts.avoid() || [];
    } catch (error) {
      return [];
    }
    var rects = [];
    for (var i = 0; i < list.length; i += 1) {
      var rect = list[i];
      if (!rect || !rect.width || !rect.height) continue;
      rects.push({
        x: rect.left - 18,
        y: rect.top - 18,
        w: rect.width + 36,
        h: rect.height + 36,
      });
    }
    return rects;
  }

  /* ------------------------------------------------------------------ build */

  /** How many stars the current canvas calls for. */
  function starTarget() {
    return clamp(
      Math.round((state.width * state.height) / opts.starDensity),
      opts.minStars,
      opts.maxStars
    );
  }

  /**
   * One star's traits. `depth` 0 = far (small, dim, barely moves), 1 = near.
   * @param rng - seeded generator.
   * @param hero - an anchor star: bright, larger, at the near end of the depth range.
   * @param x - position in canvas space.
   * @param y - position in canvas space.
   */
  function makeStar(rng, hero, x, y) {
    var depth = hero ? 0.96 + rng() * 0.04 : Math.pow(rng(), 2.0);
    return {
      x: x,
      y: y,
      depth: depth,
      // Crisp, small dots: the map has no bloom, so the radius tops out just over
      // 1px for ordinary stars and ~2px for anchors.
      radius: hero ? 1.55 + rng() * 0.55 : 0.42 + depth * 0.95,
      base: hero ? 0.92 : 0.18 + depth * 0.6,
      tint: !hero && rng() < 0.055,
      phase: rng() * TAU,
      twinkle: 0.1 + rng() * 0.26,
      speed: (0.5 + depth * 1.9) * opts.drift,
    };
  }

  /**
   * Place the sky. The only step that resets star positions, so it runs on the
   * first paint and on a size change — and even then it *carries* the existing
   * sky across the resize instead of re-placing it, because a window resize
   * throwing the whole field back to its start reads as a bug, which it was.
   *
   * The drift loop owns star positions after the first paint.
   */
  function buildStars() {
    var count = starTarget();
    var heroes = Math.min(8, Math.round(count * 0.03));
    var stars = state.stars;
    var prevW = state.prevWidth;
    var prevH = state.prevHeight;

    if (stars.length && prevW > 0 && prevH > 0) {
      // Carry the sky across the size change: scale what is on screen, then
      // adjust the population to the new area.
      var sx = state.width / prevW;
      var sy = state.height / prevH;
      var i;
      for (i = 0; i < stars.length; i += 1) {
        stars[i].x *= sx;
        stars[i].y *= sy;
      }
      if (stars.length > count) stars.length = count;
      if (stars.length < count) {
        // Appended stars are ordinary ones; the seeded layout still owns the
        // original set, so a reload and a resize converge on the same identity.
        var appendRng = createRng(opts.seed + stars.length * 2654435761);
        while (stars.length < count) {
          stars.push(makeStar(appendRng, false, appendRng() * state.width, appendRng() * state.height));
        }
      }
      state.stars = stars;
    } else {
      var rng = createRng(opts.seed);
      stars = [];
      for (var k = 0; k < count; k += 1) {
        stars.push(makeStar(rng, k < heroes, rng() * state.width, rng() * state.height));
      }
      state.stars = stars;
    }

    state.prevWidth = state.width;
    state.prevHeight = state.height;
    state.skyBuilds += 1;
    buildStrokes();
  }

  /**
   * Everything that has to be re-derived when the exclusion zones move: the
   * waypoint rings, the routes and the plus-grid.
   *
   * This is the cheap half of a rebuild, and the one that scroll belongs to.
   * Calling `buildStars()` here instead was the bug behind "the stars jump back
   * to their start every time I scroll": the stars are rebuilt from the same
   * seed, so every rebuild teleported them to their seeded positions and threw
   * away the drift the loop had accumulated.
   */
  function buildStrokes() {
    // A fixed seed of its own, so a rebuild produces the same layout for the
    // same sky rather than reshuffling rings and chains on every scroll tick.
    var rng = createRng(opts.seed + 7);
    buildRings(rng);
    buildEdges(rng);
    buildCrosshairs();
  }

  /** Open rings around a few anchors — the map's waypoint selection. */
  function buildRings(rng) {
    state.rings = [];
    if (!opts.waypoints) return;
    var blocked = avoidRects();
    var anchors = state.stars.filter(function (star) {
      return star.depth > 0.9 && !pointBlocked(star.x, star.y, blocked);
    });
    var wanted = Math.min(opts.waypoints, anchors.length);
    for (var i = 0; i < wanted; i += 1) {
      var pick = anchors[Math.floor(rng() * anchors.length)];
      if (!pick) break;
      state.rings.push({ star: pick, radius: 9 + rng() * 7, phase: rng() * TAU });
    }
  }

  /**
   * Cyan routes: an anchor ring of seven bright stars (the orbit motif) plus a
   * hard budget of short chains. Every segment clears the exclusion zones by a
   * real intersection test — endpoint and midpoint sampling is not enough,
   * because a chord can clip a corner with all three sample points outside.
   */
  function buildEdges(rng) {
    state.edges = [];
    if (!opts.lines) return;

    var blocked = avoidRects();
    var clear = function (a, b) {
      return !strokeBlocked(a.x, a.y, b.x, b.y, blocked);
    };

    var bright = state.stars.filter(function (star) {
      return star.depth > 0.62;
    });
    if (!bright.length) return;

    var ring = [];
    var cx = state.width * 0.7;
    var cy = state.height * 0.38;
    var rx = Math.min(state.width, state.height) * 0.46;
    var ry = rx * 0.4;
    var spin = -0.34;
    for (var i = 0; i < 7; i += 1) {
      var angle = spin + (i / 7) * TAU;
      var ax = cx + Math.cos(angle) * rx;
      var ay = cy + Math.sin(angle) * ry;
      var nearest = null;
      var best = Infinity;
      for (var b = 0; b < bright.length; b += 1) {
        var dx = bright[b].x - ax;
        var dy = bright[b].y - ay;
        var dist = dx * dx + dy * dy;
        if (dist < best) {
          best = dist;
          nearest = bright[b];
        }
      }
      if (nearest) {
        ring.push(nearest);
        bright.splice(bright.indexOf(nearest), 1);
      }
    }
    for (var r = 0; r < ring.length; r += 1) {
      var from = ring[r];
      var to = ring[(r + 1) % ring.length];
      if (!clear(from, to)) continue;
      state.edges.push({ a: from, b: to, phase: rng() * TAU, weight: 0.85 });
    }

    var maxD2 = opts.edgeDistance * opts.edgeDistance;
    var candidates = [];
    for (var j = 0; j < bright.length; j += 1) {
      for (var k = j + 1; k < bright.length; k += 1) {
        var ddx = bright[k].x - bright[j].x;
        var ddy = bright[k].y - bright[j].y;
        var d2 = ddx * ddx + ddy * ddy;
        if (d2 <= maxD2) candidates.push({ a: bright[j], b: bright[k], d2: d2 });
      }
    }
    candidates.sort(function (p, q) {
      return p.d2 - q.d2;
    });

    var taken = 0;
    var claimed = [];
    for (var c = 0; c < candidates.length && taken < opts.edgeBudget; c += 1) {
      var pair = candidates[c];
      if (claimed.indexOf(pair.a) !== -1 || claimed.indexOf(pair.b) !== -1) continue;
      if (!clear(pair.a, pair.b)) continue;
      claimed.push(pair.a, pair.b);
      state.edges.push({ a: pair.a, b: pair.b, phase: rng() * TAU, weight: 0.5 });
      taken += 1;
    }
  }

  /** Loose jittered grid of plus marks; the map's surveying texture. */
  function buildCrosshairs() {
    state.crosshairs = [];
    if (!opts.crosshairs) return;
    var blocked = avoidRects();
    var spacing = clamp(Math.min(state.width, state.height) / 3.1, 170, 420);
    var rng = createRng(opts.seed + 31);
    for (var gy = spacing * 0.5; gy < state.height; gy += spacing) {
      for (var gx = spacing * 0.5; gx < state.width; gx += spacing) {
        var x = gx + (rng() - 0.5) * spacing * 0.34;
        var y = gy + (rng() - 0.5) * spacing * 0.34;
        var arm = 4 + rng() * 5;
        var alpha = 0.05 + rng() * 0.05;
        // A plus mark is a stroke, so it obeys the same ban as a route.
        if (pointBlocked(x, y, blocked)) continue;
        state.crosshairs.push({ x: x, y: y, arm: arm, alpha: alpha });
      }
    }
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(1, Math.round(rect.width || window.innerWidth));
    var height = Math.max(1, Math.round(rect.height || window.innerHeight));
    var dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
    var changed = width !== state.width || height !== state.height || dpr !== state.dpr;
    if (!changed) return false;
    state.width = width;
    state.height = height;
    state.dpr = dpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    readColors();
    buildStars(); // the sky is re-placed only when its canvas changed size
    if (prefersReduced()) draw(0, true);
    return true;
  }

  /* ------------------------------------------------------------------- draw */

  /** The sky: paper gradient, plus the surface's own edge treatment. */
  function drawSky() {
    var sky = ctx2d.createLinearGradient(0, 0, 0, state.height);
    sky.addColorStop(0, colors.paper2);
    sky.addColorStop(0.55, colors.paper1);
    sky.addColorStop(1, colors.paper2);
    ctx2d.fillStyle = sky;
    ctx2d.fillRect(0, 0, state.width, state.height);

    if (isLight()) {
      // Printed paper: a flat wash with no light source, and a bezel edge. The
      // wash fades out rather than ending on a rect — a hard alpha edge reads as
      // a band across the page at 42% of the viewport height.
      var wash = ctx2d.createLinearGradient(0, 0, 0, state.height * 0.62);
      wash.addColorStop(0, 'rgba(255, 255, 255, 0.20)');
      wash.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx2d.fillStyle = wash;
      ctx2d.fillRect(0, 0, state.width, state.height * 0.62);
      ctx2d.strokeStyle = 'rgba(52, 56, 66, 0.34)';
      ctx2d.lineWidth = 2;
      ctx2d.strokeRect(1, 1, state.width - 2, state.height - 2);
      return;
    }

    // The map has a light source: a cool bloom top-right, an amber one low-left,
    // then a vignette so the frame never touches the bright sky directly.
    var cool = ctx2d.createRadialGradient(
      state.width * 0.62, state.height * 0.18, 0,
      state.width * 0.62, state.height * 0.18, Math.max(state.width, state.height) * 0.55
    );
    cool.addColorStop(0, 'rgba(63, 201, 222, 0.055)');
    cool.addColorStop(1, 'rgba(63, 201, 222, 0)');
    ctx2d.fillStyle = cool;
    ctx2d.fillRect(0, 0, state.width, state.height);

    var warm = ctx2d.createRadialGradient(
      state.width * 0.18, state.height * 0.82, 0,
      state.width * 0.18, state.height * 0.82, Math.max(state.width, state.height) * 0.5
    );
    warm.addColorStop(0, 'rgba(238, 154, 44, 0.04)');
    warm.addColorStop(1, 'rgba(238, 154, 44, 0)');
    ctx2d.fillStyle = warm;
    ctx2d.fillRect(0, 0, state.width, state.height);

    var vignette = ctx2d.createRadialGradient(
      state.width * 0.5, state.height * 0.42, Math.min(state.width, state.height) * 0.32,
      state.width * 0.5, state.height * 0.42, Math.max(state.width, state.height) * 0.78
    );
    vignette.addColorStop(0, 'rgba(2, 4, 7, 0)');
    vignette.addColorStop(1, colors.vignette);
    ctx2d.fillStyle = vignette;
    ctx2d.fillRect(0, 0, state.width, state.height);
  }

  function drawCrosshairs() {
    if (!state.crosshairs.length) return;
    // The plus-mark grid is the identity carrier, so it is drawn from the ink,
    // not from the hairline colour: a hairline is already 8–16% alpha, and
    // multiplying that by the per-mark alpha made the grid effectively invisible
    // (0.4%) instead of merely quiet.
    ctx2d.strokeStyle = colors.star;
    ctx2d.lineWidth = 1;
    var dim = isLight() ? 0.7 : 1;
    for (var i = 0; i < state.crosshairs.length; i += 1) {
      var mark = state.crosshairs[i];
      ctx2d.globalAlpha = clamp(mark.alpha * dim, 0, 1);
      ctx2d.beginPath();
      ctx2d.moveTo(mark.x - mark.arm, mark.y);
      ctx2d.lineTo(mark.x + mark.arm, mark.y);
      ctx2d.moveTo(mark.x, mark.y - mark.arm);
      ctx2d.lineTo(mark.x, mark.y + mark.arm);
      ctx2d.stroke();
    }
  }

  function drawEdges(time) {
    if (!state.edges.length) return;
    ctx2d.strokeStyle = colors.route;
    ctx2d.lineWidth = 1;
    var scale = isLight() ? 0.55 : 1;
    for (var i = 0; i < state.edges.length; i += 1) {
      var edge = state.edges[i];
      var a = edge.a;
      var b = edge.b;
      var pulse = 0.5 + 0.5 * Math.sin(time * 0.22 + edge.phase);
      ctx2d.globalAlpha = clamp((0.1 + pulse * 0.1) * edge.weight * scale, 0, 1);
      ctx2d.beginPath();
      ctx2d.moveTo(
        a.x + state.pointer.x * a.depth * opts.parallax,
        a.y + state.pointer.y * a.depth * opts.parallax
      );
      ctx2d.lineTo(
        b.x + state.pointer.x * b.depth * opts.parallax,
        b.y + state.pointer.y * b.depth * opts.parallax
      );
      ctx2d.stroke();
    }
  }

  function drawRings(time) {
    if (!state.rings.length) return;
    ctx2d.strokeStyle = colors.route;
    ctx2d.lineWidth = 1;
    var scale = isLight() ? 0.6 : 1;
    for (var i = 0; i < state.rings.length; i += 1) {
      var ring = state.rings[i];
      var pulse = 0.5 + 0.5 * Math.sin(time * 0.5 + ring.phase);
      ctx2d.globalAlpha = clamp((0.1 + pulse * 0.1) * scale, 0, 1);
      ctx2d.beginPath();
      ctx2d.arc(
        ring.star.x + state.pointer.x * ring.star.depth * opts.parallax,
        ring.star.y + state.pointer.y * ring.star.depth * opts.parallax,
        ring.radius,
        0,
        TAU
      );
      ctx2d.stroke();
    }
  }

  function draw(time, staticFrame) {
    drawSky();
    drawCrosshairs();
    drawEdges(time);
    drawRings(time);
    for (var i = 0; i < state.stars.length; i += 1) {
      var star = state.stars[i];
      var px = star.x + state.pointer.x * star.depth * opts.parallax;
      var py = star.y + state.pointer.y * star.depth * opts.parallax;
      var alpha = star.base * (isLight() ? 0.8 : 1);
      if (!staticFrame) {
        alpha *= 0.74 + 0.26 * Math.sin(time * star.twinkle + star.phase);
      }
      ctx2d.globalAlpha = clamp(alpha, 0, 1);
      // Amber waypoint dots belong to the map; on paper they read as stray ink,
      // so the tint only applies to the dark surface.
      ctx2d.fillStyle = !isLight() && star.tint ? colors.accent : colors.star;
      ctx2d.beginPath();
      ctx2d.arc(px, py, star.radius, 0, TAU);
      ctx2d.fill();
      if (!isLight() && star.depth > 0.93) {
        // The single concession to bloom: a small additive halo on the anchors.
        ctx2d.globalAlpha = clamp(alpha * 0.1, 0, 1);
        ctx2d.beginPath();
        ctx2d.arc(px, py, star.radius * 2.6, 0, TAU);
        ctx2d.fill();
      }
    }
    ctx2d.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------- loop */

  function step(now) {
    state.raf = 0;
    if (state.paused) return;
    var time = now / 1000;
    var delta = state.lastTime ? Math.min((now - state.lastTime) / 1000, 0.05) : 0;
    state.lastTime = now;

    state.pointer.x += (state.pointer.tx - state.pointer.x) * 0.08;
    state.pointer.y += (state.pointer.ty - state.pointer.y) * 0.08;

    var drift = isLight() ? 0.35 : 1;
    for (var i = 0; i < state.stars.length; i += 1) {
      var star = state.stars[i];
      star.x -= star.speed * drift * delta;
      if (star.x < -4) {
        star.x = state.width + 4;
        star.y = Math.random() * state.height;
      }
    }
    draw(time, false);
    state.raf = window.requestAnimationFrame(step);
  }

  function start() {
    if (state.started) return;
    state.started = true;
    resize();
    if (prefersReduced()) {
      draw(0, true);
      return;
    }
    // Paint one frame before the loop starts: an empty canvas for the ~16ms
    // until the first rAF is a flash of the html background, and a headless
    // capture may never see that first frame at all.
    draw(0, false);
    state.raf = window.requestAnimationFrame(step);
  }

  function stop() {
    if (state.raf) window.cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.started = false;
  }

  /* ---------------------------------------------------------------- wiring */

  var resizeTimer = 0;
  function onResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      // resize() rebuilds the geometry and repaints the still frame itself when
      // motion is reduced; otherwise the running loop picks the new size up.
      resize();
    }, 140);
  }

  function onPointerMove(event) {
    state.pointer.tx = (event.clientX / Math.max(1, state.width) - 0.5) * 2;
    state.pointer.ty = (event.clientY / Math.max(1, state.height) - 0.5) * 2;
  }

  function onVisibility() {
    if (document.hidden) {
      state.paused = true;
      if (state.raf) window.cancelAnimationFrame(state.raf);
      state.raf = 0;
    } else if (state.started && !prefersReduced()) {
      state.paused = false;
      state.lastTime = 0;
      if (!state.raf) state.raf = window.requestAnimationFrame(step);
    }
  }

  function onReduceChange() {
    stop();
    state.started = false;
    start();
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  if (reduceMq) {
    if (reduceMq.addEventListener) reduceMq.addEventListener('change', onReduceChange);
    else if (reduceMq.addListener) reduceMq.addListener(onReduceChange);
  }

  start();

  return {
    destroy: function () {
      stop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibility);
      if (reduceMq) {
        if (reduceMq.removeEventListener) reduceMq.removeEventListener('change', onReduceChange);
        else if (reduceMq.removeListener) reduceMq.removeListener(onReduceChange);
      }
      canvas.remove();
    },
    /**
     * Re-derive the exclusion-dependent geometry after the layout moved (scroll,
     * transcript growth, a panel opening).
     *
     * Deliberately does *not* touch the stars: their positions belong to the
     * drift loop, and rebuilding them here made the sky snap back on every
     * scroll.
     */
    refresh: function () {
      readColors();
      buildStrokes();
      draw(0, prefersReduced());
    },
    /**
     * Switch surface. The palette is CSS, so only the colours and the two
     * light-only behaviours change; geometry is preserved.
     */
    setMode: function (mode) {
      if (opts.mode === mode) return;
      opts.mode = mode;
      this.refresh();
    },
    /** Exposed for the invariant test. */
    stats: function () {
      return {
        stars: state.stars.length,
        edges: state.edges.length,
        rings: state.rings.length,
        skyBuilds: state.skyBuilds,
      };
    },
    /**
     * Star positions, for the regression test that scroll must not reset them.
     * A copy: a test must not be able to move the sky.
     */
    positions: function () {
      return state.stars.map(function (star) {
        return { x: star.x, y: star.y };
      });
    },
  };
}

module.exports = { createStarfield: createStarfield, segmentHitsRect: segmentHitsRect, strokeBlocked: strokeBlocked };
