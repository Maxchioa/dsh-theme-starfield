/* =============================================================================
 * dsh-theme-starfield — star map engine
 * -----------------------------------------------------------------------------
 * Paints the layer behind the app, in the vocabulary of the game's star map:
 *
 *   - crisp ivory dots (no bloom) on a near-black deep blue, a few of them
 *     tinted amber like the map's waypoint markers;
 *   - sparse plus-mark crosshairs on a loose, jittered grid;
 *   - open rings around a couple of bright stars — waypoint selection;
 *   - thin cyan route lines between bright neighbours, never over prose.
 *
 * In light mode ("dataslate") the same geometry is inverted: the dots become
 * faint printed specks, the routes go teal, and glow is disabled entirely —
 * paper does not bloom.
 *
 * Invariants that shaped it:
 *   - `pointer-events: none` and behind all content: atmosphere, not a widget.
 *   - No stroke may cross a rect handed in through `avoid` (the reading column).
 *   - `prefers-reduced-motion` paints one still frame instead of running a loop.
 *   - One rAF loop, resize only on debounce, DPR aware, paused while hidden.
 * ========================================================================== */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  var REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

  function cssVar(name, fallback) {
    try {
      var value = getComputedStyle(document.documentElement).getPropertyValue(name);
      value = value && value.trim();
      return value || fallback;
    } catch (error) {
      return fallback;
    }
  }

  /* Deterministic RNG (mulberry32) so a reload keeps the same sky. */
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

  function createStarfield(canvas, options) {
    var opts = Object.assign(
      {
        seed: 20230906,
        starDensity: 5000,   // one star per N css px²
        maxStars: 360,
        minStars: 70,
        drift: 1,
        parallax: 1,
        lines: true,
        edgeDistance: 190,
        edgeBudget: 10,
        waypoints: 3,
        crosshairs: true,
        avoid: null,
        mode: 'dark',        // 'dark' | 'light'
        reducedMotion: null, // null = follow the media query
      },
      options || {}
    );

    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

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
    };

    var reduceMq = global.matchMedia ? global.matchMedia(REDUCE_QUERY) : null;
    function prefersReduced() {
      if (opts.reducedMotion !== null) return !!opts.reducedMotion;
      return !!(reduceMq && reduceMq.matches);
    }

    function isLight() {
      return opts.mode === 'light';
    }

    var colors = {};
    function readColors() {
      colors.star = cssVar('--sf-star', '#eaeef4');
      colors.grid = cssVar('--sf-grid', 'rgba(226,232,240,0.075)');
      colors.route = cssVar('--sf-route', '#3fc9de');
      colors.accent = cssVar('--sf-accent', '#ee9a2c');
      colors.line = cssVar('--sf-line-strong', 'rgba(226,232,240,0.2)');
    }

    /* ------------------------------------------------------------- exclusion */

    /**
     * Callers hand in the regions that hold prose (canvas-space rects). Nothing
     * stroked may cross them: a star behind a paragraph is atmosphere, a line
     * behind a paragraph is a legibility bug.
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
        if (!rect) continue;
        rects.push({
          x: rect.left - 16,
          y: rect.top - 16,
          w: rect.width + 32,
          h: rect.height + 32,
        });
      }
      return rects;
    }

    /** Segment vs axis-aligned rect, slab method. */
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

    /* ----------------------------------------------------------------- build */

    function buildStars() {
      var rng = createRng(opts.seed);
      var area = state.width * state.height;
      var count = clamp(
        Math.round(area / opts.starDensity),
        opts.minStars,
        opts.maxStars
      );
      var heroes = Math.min(8, Math.round(count * 0.03));
      var stars = [];
      for (var i = 0; i < count; i += 1) {
        var hero = i < heroes;
        // depth 0 = far (small, dim, barely moves) → 1 = near.
        var depth = hero ? 0.96 + rng() * 0.04 : Math.pow(rng(), 2.0);
        stars.push({
          x: rng() * state.width,
          y: rng() * state.height,
          depth: depth,
          // Crisp, small dots: the map has no bloom, so the radius tops out
          // just over 1px for ordinary stars and ~2px for anchors.
          radius: hero ? 1.55 + rng() * 0.55 : 0.42 + depth * 0.95,
          base: hero ? 0.92 : 0.18 + depth * 0.6,
          tint: !hero && rng() < 0.055,
          phase: rng() * TAU,
          twinkle: 0.10 + rng() * 0.26,
          speed: (0.5 + depth * 1.9) * opts.drift,
        });
      }
      state.stars = stars;
      buildRings(rng);
      buildEdges(rng);
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
        state.rings.push({
          star: pick,
          radius: 9 + rng() * 7,
          phase: rng() * TAU,
        });
      }
    }

    /**
     * Cyan routes. An anchor ring of seven bright stars (the orbit motif) plus
     * a hard budget of short chains, every segment excluded from the reading
     * column by a real intersection test.
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

      var ringCount = 7;
      var ring = [];
      var cx = state.width * 0.7;
      var cy = state.height * 0.38;
      var rx = Math.min(state.width, state.height) * 0.46;
      var ry = rx * 0.4;
      var spin = -0.34;
      for (var i = 0; i < ringCount; i += 1) {
        var angle = spin + (i / ringCount) * TAU;
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
          if (pointBlocked(x, y, blocked)) continue;
          state.crosshairs.push({ x: x, y: y, arm: arm, alpha: alpha });
        }
      }
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      var width = Math.max(1, Math.round(rect.width || global.innerWidth));
      var height = Math.max(1, Math.round(rect.height || global.innerHeight));
      var dpr = clamp(global.devicePixelRatio || 1, 1, 2.5);
      var changed =
        width !== state.width || height !== state.height || dpr !== state.dpr;
      if (!changed) return;
      state.width = width;
      state.height = height;
      state.dpr = dpr;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      readColors();
      buildStars();
      buildCrosshairs();
      if (prefersReduced()) draw(0, true);
    }

    /* ------------------------------------------------------------------ draw */

    function drawCrosshairs() {
      if (!state.crosshairs.length) return;
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      var dim = isLight() ? 0.85 : 1;
      for (var i = 0; i < state.crosshairs.length; i += 1) {
        var mark = state.crosshairs[i];
        ctx.globalAlpha = clamp(mark.alpha * dim, 0, 1);
        ctx.beginPath();
        ctx.moveTo(mark.x - mark.arm, mark.y);
        ctx.lineTo(mark.x + mark.arm, mark.y);
        ctx.moveTo(mark.x, mark.y - mark.arm);
        ctx.lineTo(mark.x, mark.y + mark.arm);
        ctx.stroke();
      }
    }

    function drawEdges(time) {
      if (!state.edges.length) return;
      ctx.strokeStyle = colors.route;
      ctx.lineWidth = 1;
      var scale = isLight() ? 0.55 : 1;
      for (var i = 0; i < state.edges.length; i += 1) {
        var edge = state.edges[i];
        var a = edge.a;
        var b = edge.b;
        var pulse = 0.5 + 0.5 * Math.sin(time * 0.22 + edge.phase);
        ctx.globalAlpha = clamp((0.10 + pulse * 0.10) * edge.weight * scale, 0, 1);
        ctx.beginPath();
        ctx.moveTo(a.x + state.pointer.x * a.depth * opts.parallax,
                   a.y + state.pointer.y * a.depth * opts.parallax);
        ctx.lineTo(b.x + state.pointer.x * b.depth * opts.parallax,
                   b.y + state.pointer.y * b.depth * opts.parallax);
        ctx.stroke();
      }
    }

    function drawRings(time) {
      if (!state.rings.length) return;
      ctx.strokeStyle = colors.route;
      ctx.lineWidth = 1;
      var scale = isLight() ? 0.6 : 1;
      for (var i = 0; i < state.rings.length; i += 1) {
        var ring = state.rings[i];
        var pulse = 0.5 + 0.5 * Math.sin(time * 0.5 + ring.phase);
        ctx.globalAlpha = clamp((0.10 + pulse * 0.10) * scale, 0, 1);
        ctx.beginPath();
        ctx.arc(
          ring.star.x + state.pointer.x * ring.star.depth * opts.parallax,
          ring.star.y + state.pointer.y * ring.star.depth * opts.parallax,
          ring.radius,
          0,
          TAU
        );
        ctx.stroke();
      }
    }

    function draw(time, staticFrame) {
      ctx.clearRect(0, 0, state.width, state.height);
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
        ctx.globalAlpha = clamp(alpha, 0, 1);
        // Amber waypoint dots belong to the map; on paper they read as stray
        // ink, so the tint only applies to the dark surface.
        ctx.fillStyle = !isLight() && star.tint ? colors.accent : colors.star;
        ctx.beginPath();
        ctx.arc(px, py, star.radius, 0, TAU);
        ctx.fill();
        if (!isLight() && star.depth > 0.93) {
          ctx.globalAlpha = clamp(alpha * 0.10, 0, 1);
          ctx.beginPath();
          ctx.arc(px, py, star.radius * 2.6, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    /* ------------------------------------------------------------------ loop */

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
      state.raf = global.requestAnimationFrame(step);
    }

    function start() {
      if (state.started) return;
      state.started = true;
      resize();
      if (prefersReduced()) {
        draw(0, true);
        return;
      }
      state.raf = global.requestAnimationFrame(step);
    }

    function stop() {
      if (state.raf) global.cancelAnimationFrame(state.raf);
      state.raf = 0;
      state.started = false;
    }

    /* ---------------------------------------------------------------- wiring */

    var resizeTimer = 0;
    function onResize() {
      global.clearTimeout(resizeTimer);
      resizeTimer = global.setTimeout(function () {
        resize();
        if (prefersReduced()) draw(0, true);
      }, 120);
    }

    function onPointerMove(event) {
      state.pointer.tx = (event.clientX / state.width - 0.5) * 2;
      state.pointer.ty = (event.clientY / state.height - 0.5) * 2;
    }

    function onVisibility() {
      if (document.hidden) {
        state.paused = true;
        if (state.raf) global.cancelAnimationFrame(state.raf);
        state.raf = 0;
      } else if (state.started && !prefersReduced()) {
        state.paused = false;
        state.lastTime = 0;
        if (!state.raf) state.raf = global.requestAnimationFrame(step);
      }
    }

    function onReduceChange() {
      stop();
      state.started = false;
      start();
    }

    global.addEventListener('resize', onResize);
    global.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    if (reduceMq) {
      if (reduceMq.addEventListener) reduceMq.addEventListener('change', onReduceChange);
      else if (reduceMq.addListener) reduceMq.addListener(onReduceChange);
    }

    start();

    return {
      destroy: function () {
        stop();
        global.removeEventListener('resize', onResize);
        global.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('visibilitychange', onVisibility);
        if (reduceMq) {
          if (reduceMq.removeEventListener) reduceMq.removeEventListener('change', onReduceChange);
          else if (reduceMq.removeListener) reduceMq.removeListener(onReduceChange);
        }
      },
      setOptions: function (partial) {
        Object.assign(opts, partial || {});
        readColors();
        buildStars();
        buildCrosshairs();
        if (prefersReduced()) draw(0, true);
      },
      setMode: function (mode) {
        opts.mode = mode;
        readColors();
        buildStars();
        buildCrosshairs();
        if (prefersReduced()) draw(0, true);
      },
      redraw: function () {
        resize();
        draw(0, prefersReduced());
      },
    };
  }

  global.createStarfield = createStarfield;
})(typeof window !== 'undefined' ? window : globalThis);
