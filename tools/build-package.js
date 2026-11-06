// Build the shippable bundle from src/ into package/.
//
// The installed package has to be self-contained: DSH loads `index.js` as a
// CommonJS plugin in the Host and serves `client.js` to the browser through the
// `exports["./client"]` entry. Neither can follow a relative import into a
// repository that is not installed, and the browser cannot fetch a stylesheet
// from the package, so every local module and every stylesheet is inlined here.
//
// What is generated, and why:
//   package/index.js   Host half. Boot CSS + the whale data URI baked in, so the
//                      boot screen paints without a single extra request.
//   package/client.js  Client half. Palette CSS + components CSS + the field
//                      engine, wrapped in the __ModuleLoader__ contract.
//
// usage: node tools/build-package.js [--check]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const outDir = path.join(root, 'package');
const checkOnly = process.argv.includes('--check');

const PLUGIN_ID = 'dsh-theme-starfield';

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

/* ------------------------------------------------------------------ brand art */

/**
 * Read the extracted brand geometry. `preview/brand-paths.js` is a generated
 * script that assigns `window.BRAND_PATHS`; running it in a scratch context is
 * the only way to read it without duplicating the artwork.
 */
function readBrandPaths() {
  const source = read('preview/brand-paths.js');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.window.BRAND_PATHS;
}

/**
 * The whale as a data URI: one path, filled with the brand blue, no font and no
 * external file. `#` is percent-encoded, which is the one character that would
 * otherwise end the URI at the fragment.
 * @param paths - BRAND_PATHS from the extracted artwork.
 * @param blue - brand blue.
 * @returns a CSS-safe `url()` payload.
 */
function markDataUri(paths, blue) {
  if (!paths || typeof paths.fish !== 'string' || paths.fish.length < 40) {
    throw new Error('brand artwork missing: preview/brand-paths.js has no fish path');
  }
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23.16 17.04">' +
    '<path fill="' + blue + '" d="' + paths.fish + '"/></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/* --------------------------------------------------------------- bundling core */

/**
 * Wrap module sources in the tiny loader both halves use.
 *
 * Each source stays a normal CommonJS module (`module.exports = …`), which is
 * what lets `node --check` and the tests load it directly; the wrapper only
 * supplies the `require` those sources call with repository-relative specifiers.
 * @param modules - [{ name, body }] in dependency order.
 * @returns the loader source (module table + `__require`).
 */
function loader(modules) {
  const parts = ['var __mods = {'];
  for (const mod of modules) {
    parts.push(
      '  ' + JSON.stringify(mod.name) + ': function (module, exports, require) {\n' +
        mod.body +
        '\n},'
    );
  }
  parts.push('};');
  parts.push(
    [
      'var __cache = {};',
      'function __require(spec) {',
      '  var key = String(spec).replace(/^\\.\\//, "").replace(/\\.js$/, "");',
      '  if (Object.prototype.hasOwnProperty.call(__cache, key)) return __cache[key].exports;',
      '  var mod = { exports: {} };',
      '  __cache[key] = mod;',
      '  var factory = __mods[key];',
      '  if (!factory) throw new Error("[dsh-theme-starfield] unknown module: " + spec);',
      '  factory(mod, mod.exports, __require);',
      '  return mod.exports;',
      '}',
    ].join('\n')
  );
  return parts.join('\n');
}

const GENERATED_BANNER = [
  '/* =============================================================================',
  ' * dsh-theme-starfield — GENERATED FILE, do not edit.',
  ' *',
  ' * Built by tools/build-package.js from src/ (and preview/brand-paths.js for the',
  ' * brand geometry). Edit the sources and rebuild; a hand edit here is lost on',
  ' * the next build and is not covered by the tests.',
  ' * ========================================================================== */',
  '',
].join('\n');

/* ------------------------------------------------------------------- the build */

function build() {
  const palette = require(path.join(srcDir, 'palette.js'));
  const components = read('src/components.css');
  const styleSheet = palette.PALETTE_CSS + '\n' + components;

  /* -- client ------------------------------------------------------------- */
  const clientSource = read('src/client.js');
  const stylePlaceholder = 'var STYLE_SHEET = null; // BUILD:FILL-STYLE';
  if (!clientSource.includes(stylePlaceholder)) {
    throw new Error('src/client.js no longer carries the BUILD:FILL-STYLE placeholder');
  }
  const clientBody = clientSource.replace(stylePlaceholder, 'var STYLE_SHEET = ' + JSON.stringify(styleSheet) + ';');

  const clientBundle =
    GENERATED_BANNER +
    'window.__ModuleLoader__.load({\n' +
    '  id: ' + JSON.stringify(PLUGIN_ID) + ',\n' +
    '  factory: function () {\n' +
    loader([
      { name: 'palette', body: read('src/palette.js') },
      { name: 'field', body: read('src/field.js') },
      { name: 'client', body: clientBody },
    ]) +
    '\n    return __require("client");\n' +
    '  },\n' +
    '});\n';

  /* -- host --------------------------------------------------------------- */
  const hostSource = read('src/host.js');
  const markPlaceholder = 'var BOOT_MARK_URI = null; // BUILD:FILL-MARK';
  if (!hostSource.includes(markPlaceholder)) {
    throw new Error('src/host.js no longer carries the BUILD:FILL-MARK placeholder');
  }
  const paths = readBrandPaths();
  const markUri = markDataUri(paths, palette.BRAND_BLUE);
  const hostBody = hostSource.replace(markPlaceholder, 'var BOOT_MARK_URI = ' + JSON.stringify(markUri) + ';');

  const hostBundle =
    GENERATED_BANNER +
    "'use strict';\n" +
    loader([
      { name: 'palette', body: read('src/palette.js') },
      { name: 'host', body: hostBody },
    ]) +
    '\nvar __host = __require("host");\n' +
    'module.exports = {\n' +
    '  name: ' + JSON.stringify(PLUGIN_ID) + ',\n' +
    '  apply: __host.apply,\n' +
    '  bootStyle: __host.bootStyle,\n' +
    '  allocateBand: __host.allocateBand,\n' +
    '};\n';

  /* -- package metadata --------------------------------------------------- */
  const packageJson = {
    name: PLUGIN_ID,
    version: '0.1.0',
    description:
      'Starfield theme for DeepSeek Harness: the star map on the dark slot, the dataslate on the light slot, a CSS-only livery boot sweep, and a star-field layer that never draws a route behind prose.',
    license: 'MIT',
    private: true,
    main: 'index.js',
    files: ['index.js', 'client.js', 'cordis.patch.yml', 'README.md'],
    keywords: ['dsh', 'deepseek-harness', 'theme', 'starfield', 'desktop'],
    exports: {
      '.': './index.js',
      './client': './client.js',
      './package.json': './package.json',
    },
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
      client: {
        inject: [
          '@deepseek-ai/dsh-client-runtime',
          '@deepseek-ai/dsh-client-ui-slots',
          '@deepseek-ai/dsh-client-ui-theme',
        ],
        platform: 'web',
      },
    },
    engines: { node: '>=18' },
  };

  const patchYml = [
    '# dsh-theme-starfield — bundle patch.',
    '#',
    '# Added to `dsh.profile.bundles` in the profile package.json, this row mounts',
    '# the Host half (which owns the boot screen) and makes the package visible to',
    '# the Web client roster, which serves `exports["./client"]` → client.js.',
    '- insert:',
    '    - id: theme-starfield',
    "      name: '" + PLUGIN_ID + "'",
    '',
  ].join('\n');

  const readme = read('docs/PACKAGE.md');

  const files = {
    'index.js': hostBundle,
    'client.js': clientBundle,
    'package.json': JSON.stringify(packageJson, null, 2) + '\n',
    'cordis.patch.yml': patchYml,
    'README.md': readme,
  };

  /* -- validate before writing anything ---------------------------------- */
  const problems = [];
  for (const [name, text] of Object.entries(files)) {
    if (text.includes('BUILD:FILL-')) problems.push(name + ': placeholder not filled');
  }
  for (const name of ['index.js', 'client.js']) {
    try {
      new vm.Script(files[name], { filename: name });
    } catch (error) {
      problems.push(name + ': ' + error.message);
    }
  }
  if (problems.length) {
    for (const problem of problems) console.error('FAIL ' + problem);
    process.exit(1);
  }

  if (checkOnly) {
    // A rebuild in memory must match what is on disk, byte for byte: this is how
    // "the package is stale" is caught without rewriting it.
    let stale = false;
    for (const [name, text] of Object.entries(files)) {
      const target = path.join(outDir, name);
      const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
      if (current !== text) {
        stale = true;
        console.error('stale: package/' + name);
      }
    }
    console.log(stale ? 'FAIL — package/ is out of date; run node tools/build-package.js' : 'PASS — package/ is current');
    process.exit(stale ? 1 : 0);
  }

  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(outDir, name), text);
  }

  // The visual harness needs the boot row the Host would serve. It is written
  // next to the harness (not into package/) because it is a review artifact, and
  // it comes from the same builder, so the geometry under review is the shipped
  // geometry rather than a copy.
  {
    const hostModule = require(path.join(root, 'src', 'host.js'));
    let state = 31;
    const seeded = function () {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    fs.writeFileSync(path.join(root, '_tools', 'boot-sample.css'), hostModule.bootStyle(markUri, seeded));
  }

  const sizes = Object.entries(files)
    .map(([name, text]) => name + ' ' + (text.length / 1024).toFixed(1) + ' KiB')
    .join(', ');
  console.log('built package/ (' + sizes + ')');
  console.log('boot mark: ' + markUri.length + ' bytes of data URI');
}

build();
