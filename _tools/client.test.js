// Smoke test for the client half: does the *shipped* bundle install the theme?
//
// This loads package/client.js — the artifact DSH actually serves — through a
// stub `__ModuleLoader__`, so it covers the build (inlined stylesheet, bundled
// modules) as well as the install path. There is no jsdom on purpose: the client
// touches a small, known DOM surface, and a hand-written stub keeps the test
// honest about which APIs the theme depends on. A future edit that reaches for
// something new fails here instead of in the app.
//
// usage: node _tools/client.test.js   (build first: node tools/build-package.js)
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const bundlePath = path.join(root, 'package', 'client.js');

let failures = 0;
let checks = 0;
function ok(name, condition, detail) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error('FAIL ' + name + (detail ? '\n     ' + detail : ''));
}

if (!fs.existsSync(bundlePath)) {
  console.error('FAIL package/client.js is missing — run node tools/build-package.js');
  process.exit(1);
}

const { TOKENS } = require(path.join(root, 'src', 'palette.js'));

/* ------------------------------------------------------------------- the stub */

const timers = [];

function makeElement(tag, doc) {
  const element = {
    tagName: tag.toUpperCase(),
    id: '',
    style: { setProperty() {}, removeProperty() {} },
    attributes: {},
    children: [],
    textContent: '',
    parentNode: null,
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes[name];
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    remove() {
      if (!this.parentNode) return;
      const at = this.parentNode.children.indexOf(this);
      if (at !== -1) this.parentNode.children.splice(at, 1);
      this.parentNode = null;
    },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 1000 }),
  };
  void doc;
  return element;
}

const body = makeElement('body');
body.hasAttribute = function (name) {
  return Object.prototype.hasOwnProperty.call(this.attributes, name);
};
const head = makeElement('head');
const documentElement = makeElement('html');
const rootNode = makeElement('div');

const proseNode = {
  textContent: 'A paragraph of prose that a route must not cross.',
  getBoundingClientRect: () => ({ left: 520, top: 120, width: 700, height: 60 }),
};

function make2d() {
  const noop = () => {};
  return {
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    setTransform: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
  };
}

const document = {
  head,
  body,
  documentElement,
  createElement(tag) {
    const element = makeElement(tag, document);
    if (tag === 'canvas') {
      element.getContext = () => make2d();
      element.width = 0;
      element.height = 0;
    }
    return element;
  },
  getElementById(id) {
    return id === 'root' ? rootNode : null;
  },
  querySelectorAll(selector) {
    // Only the prose selector is expected to match anything.
    return /#root (p|li)/.test(selector) ? [proseNode] : [];
  },
  addEventListener() {},
  removeEventListener() {},
};

const windowStub = {
  document,
  innerWidth: 1600,
  innerHeight: 1000,
  devicePixelRatio: 1,
  requestAnimationFrame: () => 1,
  cancelAnimationFrame() {},
  setTimeout(fn, ms) {
    timers.push({ fn, ms });
    return timers.length;
  },
  clearTimeout() {},
  setInterval() {
    return 1;
  },
  clearInterval() {},
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
};

const observers = [];
class MutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.observations = [];
    observers.push(this);
  }
  observe(target, options) {
    this.observations.push({ target, options });
  }
  disconnect() {
    this.disconnected = true;
  }
}

global.window = windowStub;
global.document = document;
global.MutationObserver = MutationObserver;
global.performance = { now: () => 250 };
global.getComputedStyle = () => ({
  getPropertyValue: (name) => (name === '--sf-paper-1' ? '#0A0E15' : '#EAEEF4'),
});
global.matchMedia = windowStub.matchMedia;

/* ------------------------------------------------------ load the real bundle */

const loads = [];
windowStub.__ModuleLoader__ = {
  load(definition) {
    loads.push(definition);
  },
};
require(bundlePath);

ok('the bundle registers exactly one module', loads.length === 1, String(loads.length));
ok('the module id is the package id', loads[0] && loads[0].id === 'dsh-theme-starfield', loads[0] && loads[0].id);

const plugin = loads[0].factory();
ok('the module exposes apply', typeof plugin.apply === 'function');

/* ------------------------------------------------------------------ the test */

const overrides = [];
const themeService = {
  overrideTokens(source, tokens) {
    overrides.push({ source, tokens });
    return () => {
      overrides.disposed = true;
    };
  },
};

const effects = [];
const ctx = {
  get(name) {
    return name === 'theme' ? themeService : null;
  },
  on() {
    return () => {};
  },
  effect(fn, label) {
    effects.push({ label, dispose: fn() });
    return () => {};
  },
};

plugin.apply(ctx);

ok('one stylesheet is appended to <head>', head.children.length === 1 && head.children[0].tagName === 'STYLE');
const css = head.children[0] ? head.children[0].textContent : '';
ok('the stylesheet carries the palette', css.includes('--sf-void'));
ok('the stylesheet carries the structural rules', css.includes('#sf-field'));
ok('the stylesheet is the built artifact, not a placeholder', css.length > 8000, css.length + ' bytes');

ok('the token layer is registered once', overrides.length === 1, String(overrides.length));
ok('the token layer is named after the package', overrides[0] && overrides[0].source === 'dsh-theme-starfield');

const applied = overrides[0] ? overrides[0].tokens : {};
const aliasCount = Object.keys(TOKENS).filter((name) => name.startsWith('--dsw-alias-')).length;
ok('every alias token reached the theme service',
  Object.keys(applied).filter((n) => n.startsWith('--dsw-alias-')).length === aliasCount,
  Object.keys(applied).filter((n) => n.startsWith('--dsw-alias-')).length + '/' + aliasCount);
ok('every value is a { light, dark } pair',
  Object.values(applied).every((v) => v && typeof v.light === 'string' && typeof v.dark === 'string'));

const canvas = body.children.find((child) => child.id === 'sf-field');
ok('the field canvas is mounted on <body>', !!canvas);
ok('the canvas is decorative', canvas && canvas.attributes['aria-hidden'] === 'true');

const allObservations = observers.flatMap((o) => o.observations);
ok('the surface is observed for changes',
  allObservations.some((o) => o.options && o.options.attributeFilter),
  JSON.stringify(allObservations.map((o) => Object.keys(o.options || {}))));
ok('the transcript is observed for growth', allObservations.some((o) => o.options && o.options.childList));
ok('only <body> is observed for attributes', allObservations.some((o) => o.options && o.options.attributeFilter && o.target === body));

const liveTimer = timers.find((t) => t.ms === 1800 - 250);
ok('the readiness flag is scheduled after the sweep floor', !!liveTimer, JSON.stringify(timers.map((t) => t.ms)));
if (liveTimer) {
  liveTimer.fn();
  ok('the readiness flag lands on <html>', documentElement.attributes['data-sf-live'] === '');
}

ok('teardown is registered with the context', effects.length === 1);

// A duplicate activation (HMR racing, a duplicated bundle row) must not mount a
// second canvas or register a second token layer.
plugin.apply(ctx);
ok('a second activation while installed is a no-op',
  overrides.length === 1 && body.children.filter((c) => c.id === 'sf-field').length === 1,
  'overrides=' + overrides.length + ' canvases=' + body.children.filter((c) => c.id === 'sf-field').length);

if (effects.length === 1) {
  effects[0].dispose();
  ok('teardown disconnects the observer', observers.every((o) => o.disconnected));
  ok('teardown withdraws the token layer', overrides.disposed === true);
  ok('teardown removes the stylesheet and the canvas',
    head.children.length === 0 && !body.children.some((c) => c.id === 'sf-field'),
    'head=' + head.children.length + ' body=' + body.children.length);

  // ...and the guard must release, or a re-enable in Settings would do nothing.
  plugin.apply(ctx);
  ok('the theme installs again after teardown',
    overrides.length === 2 && body.children.filter((c) => c.id === 'sf-field').length === 1,
    'overrides=' + overrides.length);
}

console.log('\n' + (failures === 0 ? 'PASS' : 'FAIL') + ' — ' + checks + ' checks, ' + failures + ' failure(s)');
process.exit(failures === 0 ? 0 : 1);
