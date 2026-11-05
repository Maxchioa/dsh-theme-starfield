/**
 * Headless check for the field engine's two hard invariants.
 *
 * Runs `preview/starfield.js` against a stub canvas/DOM and asserts:
 *   1. no drawn segment (constellation edge OR dial stroke) intersects the
 *      rects handed in through `avoid`;
 *   2. the chart is actually drawn — an over-eager exclusion would "pass"
 *      the first check by drawing nothing.
 *
 * usage: node _tools/field.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'preview', 'starfield.js'),
  'utf8'
);

const READ_COLUMN = { left: 540, top: 58, width: 756, height: 880 };

function makeContext() {
  const segments = [];
  let cursor = null;
  const noop = () => {};
  const ctx = {
    globalAlpha: 1,
    fillStyle: '#fff',
    strokeStyle: '#fff',
    lineWidth: 1,
    setTransform: noop,
    clearRect: noop,
    beginPath() {
      cursor = null;
    },
    moveTo(x, y) {
      cursor = { x, y };
    },
    lineTo(x, y) {
      // A moveTo/lineTo pair is a constellation edge or a dial graduation.
      if (cursor) segments.push({ kind: 'line', points: [cursor, { x, y }] });
      cursor = { x, y };
    },
    arc(x, y, r, start, end) {
      // Stars and their halos are dots that are *allowed* over the prose.
      // Stroked arcs (the dial rings) must be checked, so they are flattened
      // into chords: a couple of chords is enough to catch a ring crossing.
      if (r <= 12) return;
      const steps = Math.abs(end - start) > Math.PI * 1.9 ? 24 : 4;
      const points = [];
      for (let i = 0; i <= steps; i += 1) {
        const angle = start + ((end - start) * i) / steps;
        points.push({ x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r });
      }
      segments.push({ kind: 'arc', points });
    },
    fill: noop,
    stroke: noop,
    _segments: segments,
  };
  return ctx;
}

function segmentHitsRect(x1, y1, x2, y2, rect) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [
    x1 - rect.left,
    rect.left + rect.width - x1,
    y1 - rect.top,
    rect.top + rect.height - y1,
  ];
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

const ctxStub = makeContext();
const canvas = {
  width: 0,
  height: 0,
  getContext: () => ctxStub,
  getBoundingClientRect: () => ({ width: 1600, height: 1000 }),
};

const listeners = new Set();
const sandbox = {
  console,
  Math,
  Object,
  Infinity,
  devicePixelRatio: 1,
  innerWidth: 1600,
  innerHeight: 1000,
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  addEventListener: (type, fn) => listeners.add([type, fn]),
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  getComputedStyle: () => ({ getPropertyValue: () => '#EAE6D8' }),
  document: {
    hidden: false,
    documentElement: {},
    addEventListener: () => {},
    removeEventListener: () => {},
  },
};
sandbox.window = sandbox;

vm.createContext(sandbox);
vm.runInContext(SOURCE, sandbox);

const field = sandbox.createStarfield(canvas, {
  seed: 20230906,
  avoid: () => [READ_COLUMN],
});
if (!field) {
  throw new Error('createStarfield returned null');
}

ctxStub._segments.length = 0;
field.redraw();

const segments = ctxStub._segments;
const crossings = [];
for (const segment of segments) {
  for (let i = 1; i < segment.points.length; i += 1) {
    const a = segment.points[i - 1];
    const b = segment.points[i];
    if (segmentHitsRect(a.x, a.y, b.x, b.y, READ_COLUMN)) {
      crossings.push(segment.kind);
      break;
    }
  }
}

const failures = [];
// Dial graduations are also moveTo/lineTo pairs but only ~10px long; a chart
// edge is tens of pixels. Counting long strokes keeps "the chart is missing"
// from being masked by the dial.
const chartLines = segments.filter(
  (s) =>
    s.kind === 'line' &&
    Math.hypot(
      s.points[1].x - s.points[0].x,
      s.points[1].y - s.points[0].y
    ) > 40
).length;
if (chartLines < 5) {
  failures.push(
    `only ${chartLines} chart lines drawn — the exclusion is too eager, so a clean pass would be meaningless`
  );
}
if (crossings.length > 0) {
  failures.push(
    `${crossings.length} of ${segments.length} segments cross the reading column (kinds: ${crossings.slice(0, 6).join(', ')})`
  );
}

if (failures.length) {
  console.error('FAIL');
  for (const line of failures) console.error('  - ' + line);
  process.exit(1);
}

console.log(
  `PASS  ${segments.length} strokes drawn (${chartLines} chart lines + dial), 0 crossing the reading column`
);
