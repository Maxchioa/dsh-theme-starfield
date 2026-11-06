// Headless check for the *app* engine (src/field.js).
//
// The preview's test (_tools/field.test.js) proves the exclusion geometry against
// one fixed column. This one proves the shipped engine against the set the client
// half hands it — several prose bands plus the composer — and additionally:
//   - the sky is actually painted (the field is the page, not an overlay), and
//   - light mode takes the no-bloom branch.
//
// usage: node _tools/field-app.test.js
'use strict';
const path = require('path');

const engine = require(path.resolve(__dirname, '..', 'src', 'field.js'));

/** Rects as the client half derives them: viewport coordinates, prose + composer. */
const PROSE = [
  { left: 520, top: 90, width: 720, height: 180 },
  { left: 520, top: 300, width: 720, height: 240 },
  { left: 520, top: 570, width: 720, height: 120 },
];
const COMPOSER = { left: 520, top: 820, width: 720, height: 96 };
const AVOID = PROSE.concat([COMPOSER]);

function makeContext() {
  const strokes = [];
  const fills = [];
  const skys = [];
  let path = [];
  let cursor = null;

  const gradient = {
    addColorStop() {},
  };

  const ctx = {
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    setTransform() {},
    clearRect() {},
    createLinearGradient() {
      return gradient;
    },
    createRadialGradient() {
      return gradient;
    },
    fillRect(x, y, w, h) {
      skys.push({ x, y, w, h });
    },
    strokeRect() {},
    beginPath() {
      path = [];
      cursor = null;
    },
    moveTo(x, y) {
      cursor = { x, y };
      path.push({ kind: 'move', x, y });
    },
    lineTo(x, y) {
      if (cursor) path.push({ kind: 'line', from: cursor, to: { x, y } });
      cursor = { x, y };
    },
    arc(x, y, r, start, end) {
      // A closed arc is flattened into chords; rings are 9–16px, dots are < 3px.
      const steps = Math.abs(end - start) > Math.PI * 1.9 ? 16 : 4;
      const points = [];
      for (let i = 0; i <= steps; i += 1) {
        const a = start + ((end - start) * i) / steps;
        points.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
      }
      path.push({ kind: 'arc', points });
      cursor = points[points.length - 1];
    },
    fill() {
      for (const op of path) if (op.kind === 'arc') fills.push(op);
    },
    stroke() {
      for (const op of path) {
        if (op.kind === 'line') strokes.push({ kind: 'line', points: [op.from, op.to] });
        if (op.kind === 'arc') strokes.push({ kind: 'arc', points: op.points });
      }
    },
    _strokes: strokes,
    _fills: fills,
    _skys: skys,
  };
  return ctx;
}

function segmentHitsRect(x1, y1, x2, y2, rect) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rect.left, rect.left + rect.width - x1, y1 - rect.top, rect.top + rect.height - y1];
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
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

function makeWindow() {
  const listeners = new Map();
  // The engine debounces resize; the test keeps the callbacks so it can drive a
  // real resize instead of reaching inside.
  const pending = [];
  const win = {
    innerWidth: 1600,
    innerHeight: 1000,
    devicePixelRatio: 1,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    setTimeout: (fn) => {
      pending.push(fn);
      return pending.length;
    },
    clearTimeout(id) {
      if (id) pending[id - 1] = null;
    },
    flushTimers() {
      for (let i = 0; i < pending.length; i += 1) {
        const fn = pending[i];
        pending[i] = null;
        if (typeof fn === 'function') fn();
      }
      pending.length = 0;
    },
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener() {},
    emit(type) {
      const fn = listeners.get(type);
      if (typeof fn === 'function') fn();
    },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  win.window = win;
  return win;
}

const failures = [];
function check(name, condition, detail) {
  if (condition) return;
  failures.push(name + (detail ? ' — ' + detail : ''));
}

/* ------------------------------------------------------------ dark surface */

function run(mode, size) {
  const ctxStub = makeContext();
  const canvasSize = { width: 1600, height: 1000 };
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => ctxStub,
    getBoundingClientRect: () => ({ width: canvasSize.width, height: canvasSize.height }),
    remove() {},
  };
  const win = makeWindow();
  global.window = win;
  global.document = {
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
    body: { style: {} },
  };
  global.matchMedia = win.matchMedia;
  global.getComputedStyle = () => ({ getPropertyValue: () => '' });
  global.requestAnimationFrame = win.requestAnimationFrame;
  global.cancelAnimationFrame = win.cancelAnimationFrame;

  const field = engine.createStarfield(canvas, {
    seed: 424242,
    mode,
    avoid: () => AVOID,
  });
  check(mode + ': engine constructed', !!field);
  if (!field) return null;

  ctxStub._strokes.length = 0;
  ctxStub._skys.length = 0;
  field.refresh();

  return { field, ctxStub, canvas: canvasSize, win };
}

const dark = run('dark');
check('dark: the sky is painted before anything else', dark && dark.ctxStub._skys.length >= 1);

const crossings = [];
let longLines = 0;
for (const stroke of dark.ctxStub._strokes) {
  const points = stroke.points;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (stroke.kind === 'line' && Math.hypot(b.x - a.x, b.y - a.y) > 40) longLines += 1;
    for (const rect of AVOID) {
      if (segmentHitsRect(a.x, a.y, b.x, b.y, rect)) {
        crossings.push(stroke.kind);
        i = points.length;
        break;
      }
    }
  }
}

check('dark: routes and marks are drawn at all', longLines >= 3, longLines + ' long strokes');
check('dark: no stroke crosses prose or the composer', crossings.length === 0, crossings.length + ' crossings (' + crossings.slice(0, 5).join(', ') + ')');

const stats = dark.field.stats();
check('dark: stars are placed', stats.stars > 50, String(stats.stars));
check('dark: waypoints exist', stats.rings >= 1, String(stats.rings));
check('dark: anchors and dots are filled, not stroked', dark.ctxStub._fills.length > 50, String(dark.ctxStub._fills.length));

/* ------------------------------------------------- scroll must not reset sky */

// The bug: refresh() rebuilt the stars from their seed, so every scroll (which
// re-derives the exclusion rects) teleported the sky back to its start. Drift is
// what makes the jump visible in the app, but the honest invariant is stronger
// and doesn't need drift at all: a refresh must not re-place the sky.
const before = dark.field.positions();
check('dark: the engine exposes star positions for this test', before.length === stats.stars);
const buildsBefore = dark.field.stats().skyBuilds;
check('dark: the sky has been placed exactly once so far', buildsBefore === 1, String(buildsBefore));

// A scroll moves the prose, so the rects the engine sees move with it.
AVOID.length = 0;
AVOID.push(
  { left: 520, top: 40, width: 720, height: 180 },
  { left: 520, top: 250, width: 720, height: 240 },
  { left: 520, top: 520, width: 720, height: 120 },
  COMPOSER
);
// Only the strokes this rebuild draws are under test.
dark.ctxStub._strokes.length = 0;
dark.field.refresh();
const after = dark.field.positions();
const buildsAfter = dark.field.stats().skyBuilds;

check('dark: a scroll refresh does not re-place the sky', buildsAfter === buildsBefore,
  buildsBefore + ' -> ' + buildsAfter);
check('dark: scrolling leaves the routes drawn', dark.ctxStub._strokes.length > 0,
  String(dark.ctxStub._strokes.length));

/* ------------------------------------------------- resize carries, not resets */

// A real resize *does* re-place the sky (the area changed), but it must carry the
// existing stars across the new size rather than teleport them to their seeded
// positions: stretching is a layout change, re-seeding is a bug the user sees.
const beforeResize = dark.field.positions();
const resizeBuildsBefore = dark.field.stats().skyBuilds;
dark.canvas.width = 1200;
dark.canvas.height = 800;
dark.win.emit('resize');
dark.win.flushTimers();
const afterResize = dark.field.positions();

check('resize re-places the sky exactly once', dark.field.stats().skyBuilds === resizeBuildsBefore + 1,
  resizeBuildsBefore + ' -> ' + dark.field.stats().skyBuilds);
const sx = 1200 / 1600;
const sy = 800 / 1000;
const kept = Math.min(beforeResize.length, afterResize.length);
const offScale = beforeResize.slice(0, kept).filter((p, i) => {
  const q = afterResize[i];
  return !q || Math.abs(q.x - p.x * sx) > 0.5 || Math.abs(q.y - p.y * sy) > 0.5;
});
check('resize scales the existing sky instead of re-seeding it', offScale.length === 0,
  offScale.length + '/' + kept + ' stars are not the scaled originals');
check('resize trims the population to the smaller area',
  afterResize.length < beforeResize.length && afterResize.length >= 60,
  beforeResize.length + ' -> ' + afterResize.length);
check('resize keeps every star on the canvas',
  afterResize.every((p) => p.x >= -4 && p.x <= 1204 && p.y >= 0 && p.y <= 808),
  JSON.stringify(afterResize.slice(0, 3)));

const moved = before.filter((p, i) => !after[i] || Math.abs(p.x - after[i].x) > 1e-6 || Math.abs(p.y - after[i].y) > 1e-6);
check('dark: scrolling keeps every star where it was', moved.length === 0,
  moved.length + '/' + before.length + ' stars jumped');
check('dark: the star count is unchanged', after.length === before.length);

// ...and the exclusion still holds against the moved rects.
let scrollCrossings = 0;
for (const stroke of dark.ctxStub._strokes) {
  for (let i = 1; i < stroke.points.length; i += 1) {
    const a = stroke.points[i - 1];
    const b = stroke.points[i];
    for (const rect of AVOID) {
      if (segmentHitsRect(a.x, a.y, b.x, b.y, rect)) {
        scrollCrossings += 1;
        i = stroke.points.length;
        break;
      }
    }
  }
}
check('dark: the rebuilt routes still clear the moved prose', scrollCrossings === 0, String(scrollCrossings));

/* ----------------------------------------------------------- light surface */

const light = run('light');
check('light: engine constructed', !!light);
check('light: the paper is painted', light && light.ctxStub._skys.length >= 1);

let lightCrossings = 0;
for (const stroke of light.ctxStub._strokes) {
  for (let i = 1; i < stroke.points.length; i += 1) {
    const a = stroke.points[i - 1];
    const b = stroke.points[i];
    for (const rect of AVOID) {
      if (segmentHitsRect(a.x, a.y, b.x, b.y, rect)) {
        lightCrossings += 1;
        i = stroke.points.length;
        break;
      }
    }
  }
}
check('light: no stroke crosses prose either', lightCrossings === 0, String(lightCrossings));

// 1.15 regime: switching surfaces must not throw, and must keep the geometry.
light.field.setMode('dark');
check('setMode survives', true);
light.field.refresh();

global.window = undefined;
global.document = undefined;

if (failures.length) {
  console.error('FAIL');
  for (const failure of failures) console.error('  - ' + failure);
  process.exit(1);
}
console.log(
  'PASS — ' + longLines + ' long strokes, 0 crossing ' + AVOID.length + ' exclusion rects, ' +
  stats.stars + ' stars, ' + stats.edges + ' routes, ' + stats.rings + ' waypoints'
);
