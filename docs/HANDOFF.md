# Handoff — read this first

Everything a fresh session needs to continue this project without re-deriving it.

**Status: packaged, built and offline-verified. Not installed.** The theme now
exists as a real DSH profile bundle in [`package/`](../package) (generated from
[`src/`](../src)), with passing tests for token coverage, the boot screen, the
field invariant and the client install path. What has *not* happened is the
in-situ step: the bundle is not in the profile, the app has not been restarted,
and no screenshot of the running app exists yet. That is the next task (§8).

Screenshots of the *packaged* theme on a DSH-shaped DOM are in `preview/`:
[`app-dark.png`](../preview/app-dark.png) (star map),
[`app-light.png`](../preview/app-light.png) (dataslate),
[`boot-sweep-400.png`](../preview/boot-sweep-400.png),
[`boot-sweep-900.png`](../preview/boot-sweep-900.png).

---

## 1. What this is

A theme for **DSH** (DeepSeek Harness) built on **Bethesda's Starfield** system
UI — not a literal star field, and no longer the Constellation *faction*.

Two surfaces, mapped onto DSH's own light/dark slots:

| DSH slot | Surface | Reference | Character |
| --- | --- | --- | --- |
| **dark** | the star map | the system/star map | near-black deep blue, crisp dots, cyan routes, plus-mark grid, light stencil plates |
| **light** | the dataslate | the in-game note | matte gray-lavender paper, slate ink, mid-gray plates, dark primary block |

The theme follows the app's Appearance setting; it never forces a scheme.

## 2. Locked decisions — do not relitigate without a reason

- **Two surfaces = DSH's two slots.** Light is *not* "dark minus colour".
- **Brand art is the real thing**: 17 per-glyph SVG paths + the fish path from the
  shipped bundle. The whale keeps DeepSeek blue `#4D6BFE`; the wordmark stays
  monochrome. See [`preview/wordmark-study.png`](../preview/wordmark-study.png).
- **Livery stripe** (`#D4AC63 #CD2435 #E56335 #2B4D7D #F4F5F7`) is *identity, not
  state*; it appears once, as a four-bar flag on the brand plate's leading edge.
  Boot uses all five (it has a dark ground); the plate uses four.
- **Boot is a 1.7s livery sweep**, CSS-only, widths allocated per load with bounds
  `[0.12, 0.31]`. The band passes **in front of** the whale.
- **The chart never crosses the reading column** — a real segment/rect
  intersection, covered by tests.
- **Typography**: Bahnschrift at `font-stretch: 88%` for chrome and labels, the
  system UI face for prose, Cascadia Mono for data.

## 3. File map

| Path | Purpose |
| --- | --- |
| [`src/palette.js`](../src/palette.js) | **Palette + token map source of truth**: `--sf-*` for both slots, all 107 `--dsw-alias-*` + surface tokens |
| [`src/components.css`](../src/components.css) | The four things a token cannot express: transparent frame + field layer, typography, brand plate, texture |
| [`src/field.js`](../src/field.js) | Field engine: sky, dots, plus-grid, waypoint rings, cyan routes, DOM-driven `avoid` |
| [`src/client.js`](../src/client.js) | Client half: token layer, stylesheet, canvas mount, refusal to cut the boot early |
| [`src/host.js`](../src/host.js) | Host half: index-injection row — pre-plugin canvas, curtain, livery sweep with per-load geometry |
| [`tools/build-package.js`](../tools/build-package.js) | Builds `package/` from `src/` (+ the whale data URI); `--check` proves it is current |
| [`tools/install-theme.ps1`](../tools/install-theme.ps1) | Copies the bundle into the profile, edits `dsh.profile.bundles`; dry-run by default |
| [`tools/preview-shots.ps1`](../tools/preview-shots.ps1) | Regenerates the harness screenshots with headless Edge |
| [`_tools/harness.html`](../_tools/harness.html) | **The visual harness**: a mock of DSH's client that mounts the *built* bundle |
| [`_tools/theme.test.js`](../_tools/theme.test.js) | Alias coverage, palette parity with `preview/tokens.css`, CSS balance |
| [`_tools/field.test.js`](../_tools/field.test.js) | The preview engine's invariant (kept, still passes) |
| [`_tools/field-app.test.js`](../_tools/field-app.test.js) | The shipped engine: sky painted, no stroke over prose or composer |
| [`_tools/boot.test.js`](../_tools/boot.test.js) | Allocation bounds, band geometry, readiness cut, regression guards |
| [`_tools/client.test.js`](../_tools/client.test.js) | Loads `package/client.js`, asserts install/teardown/idempotency |
| [`_tools/asar-*.js`](../_tools) | Read DSH's packed `app.asar`: list paths, pull one file, count token usage |
| [`tools/extract-token-values.js`](../tools/extract-token-values.js) | Rebuilds `_reference/token-values.json` (every shipped token, both slots) |
| [`preview/`](../preview) | The design-stage preview shell (still the palette study source) |
| [`_reference/`](../_reference) | Extracted DSH packages, token inventory, token values (research) |
| [`docs/DESIGN.md`](DESIGN.md) | Palette tables, components, livery, boot, field rules **+ implementation notes (§11)** |

## 4. DSH internals this depends on

**A theme is a profile bundle package**, not a stylesheet. Two halves:

- **Host** (`index.js`, CJS) — hooks `webserver/index-inject`, which fires on
  *every* index response. That is how the pre-plugin boot screen gets styled, and
  the seam used for per-load randomisation (literal values, no client JS).
- **Client** (`client.js`) — registers through
  `window.__ModuleLoader__.load({ id, factory })`; `apply(ctx)` overrides tokens
  via `ctx.get('theme').overrideTokens(id, { '--dsw-alias-…': { light, dark } })`
  and injects CSS.

Wiring: `package.json` → `dsh.bundle.patch` + `dsh.client.inject`/`platform`, the
package goes in `$DSH_HOME/profiles/desktop/node_modules/`, and its name is added
to `dsh.profile.bundles` in the profile `package.json`. **A new bundle only loads
after the desktop app restarts.**

Facts established while packaging (all verified in the shipped code):

1. **`overrideTokens` accepts any CSS custom-property name**, not just aliases —
   `validateOverrides` only checks the `{ light, dark }` string-pair shape. That
   is why the `--dsw-specific-*` surfaces (sidebar, bubble, menu) could be claimed
   too; leaving them stock is what leaves a white column under a theme.
2. **The presenter writes the active scheme's values as inline custom properties
   on `body`** and sets `body[data-ds-dark-theme]`. So token values may be
   symbolic (`var(--sf-hull)`) and the palette CSS is what makes them per-slot.
3. **Both schemes compose through the same layer** — our `--sf-*` palette is
   declared on `:root` (light) and `body[data-ds-dark-theme]` (dark), so DSH's
   Appearance switch changes everything with no JS of ours in the path.
4. **A `var()` that resolves to nothing kills the whole declaration.** The boot
   band first shipped as `linear-gradient(… var(--sf-livery-1) …)`; `html::before`
   is not a descendant of `body`, where those variables are declared, so the
   background was invalid and the band never appeared. The Host now bakes literal
   colours (§11 of DESIGN.md).
5. **There are 107 `--dsw-alias-*` tokens, 403 `--dsw-*` in total.** Static
   (`--dsw-static-*`) tokens are referenced almost exclusively by ui-theme's own
   sheets (≈15 direct uses across one bundle), so overriding the alias + specific
   layers is enough; no static ladder is needed.
6. **The code font family is `--ds-font-family-code`** (no `w`), which is why the
   map carries one `--ds-*` entry.
7. **Brand is slot-based**: `sidebar.brand.mark` / `sidebar.brand.name`, and the
   official occupant renders `<FishLogo>` with `fill: currentColor`. The whale is
   therefore recoloured with plain CSS (`[class*='brandMark'] svg`), no slot
   registration needed.
8. **Currently installed and active: `dsh-theme-mls-desktop`.** It owns the token
   layer today, and its shell patch modified `app.asar` (transparent window,
   hidden captions, opens maximised). Pristine backup:
   `<install>/resources/app.asar.dsh-theme-marathon.bak`. Those shell changes
   survive this theme's install and are a separate decision.

## 5. Environment traps (this cost the most time)

1. **The workspace root must grant `WRITE_OWNER`.** DSH's sandbox stamps a Low
   integrity label via `LABEL_SECURITY_INFORMATION`. Repair:
   `icacls <folder> /grant '<user>:(OI)(CI)F'`.
2. **Elevated writes are undeletable from the sandbox** (Medium integrity). Clean
   them up with an escalated command too.
3. **Headless Chrome fails under the sandbox** (crashpad `OpenProcess: Access is
   denied`). Edge works, and needs `danger-full-access`:
   `msedge --headless=new --disable-gpu --disable-crashpad --disable-breakpad
   --allow-file-access-from-files --user-data-dir=<tmp> --virtual-time-budget=4000
   --window-size=1600,1000 --screenshot=<png> "file:///…"`.
4. **Virtual-time screenshots do not advance CSS animations.** A 220ms fade can
   be captured at 30% and look like a permanent veil. Freeze motion with
   `animation-delay` + `animation-play-state: paused` (the harness `?t=`), never by
   computing a transform in script.
5. **There is no `pwsh` here** — only Windows PowerShell 5.1 (`powershell.exe`).
   Scripts must be ASCII-only and must not assign `$args`.
6. **PS 5.1 `Get-Content -Raw` reads UTF-8 without a BOM as ANSI.** Editing a
   UTF-8 script with `Get-Content`/`Set-Content` mangles every em dash. Use the
   editing tool, and write JSON with `[IO.File]::WriteAllText(path, json,
   UTF8Encoding($false))` so no BOM appears.
7. **A native command that writes to stderr aborts a `-File` script** when
   `$ErrorActionPreference = 'Stop'`. Edge does this on every run; scope the
   preference around the call (see `tools/preview-shots.ps1`).
8. **`app.asar` extraction**: the header is a padded pickle — payload starts at
   `8 + uint32@4`, JSON length is `uint32@12`. Naive header walkers silently
   return 0 bytes; use [`_tools/asar-one.js`](../_tools/asar-one.js).
9. **`localhost:19387` returns 401 to a plain fetch** (loopback token). The theme
   cannot be screenshot through the served page from outside the app.
10. **`--skew` / `--from` style variables must hold values, not functions** (from
    the preview build): CSS already wraps them, so `skewX(skewX(…))` is invalid and
    silently drops to `transform: none`.

## 6. Verification recipes

```powershell
# everything that can be proven offline
npm test                # or: node _tools/theme.test.js && … (see package.json)

# the package is current with src/
node tools/build-package.js --check

# rebuild after editing src/
node tools/build-package.js

# review screenshots (needs danger-full-access for the browser)
powershell -NoProfile -File tools/preview-shots.ps1

# what the installer would do (writes nothing)
powershell -NoProfile -File tools/install-theme.ps1

# install + register (then restart the app)
powershell -NoProfile -File tools/install-theme.ps1 -Apply
```

## 7. Repo hygiene / open questions

- **`_reference/` is tracked** (extracted DSH packages, DeepSeek's LICENSE and
  brand artwork). Fine for a private repo; untrack before publishing:
  `git rm -r --cached _reference`.
- **The whale path is DeepSeek artwork.** It now ships inside `package/` as a data
  URI in the Host half and as CSS in the brand plate. Shipping it in a published
  theme is a redistribution question.
- `package/` and `_tools/boot-sample.css` are build outputs and gitignored.
- The name may become `starfield` rather than `dsh-theme-starfield`.
- **Uppercase + tracking is applied by heuristic** (`button`, `[class*='label']`,
  `[class*='caption']`, `kbd`, `th`, `[role=tab]`). If it proves shouty on a real
  surface, narrow the list in `src/components.css` — nothing else depends on it.

## 8. Next steps, in order

1. **Install** — `tools/install-theme.ps1 -Apply` (copies the bundle, removes the
   MLS entry from `dsh.profile.bundles`, backs the manifest up). Then **restart
   the desktop app**; the bundle is not resolved before that.
2. **Look at the real app**, both Appearance settings. The known unknowns:
   - whether any DSH surface still paints an opaque background over the field
     (the theme makes `bg-base` transparent and assumes cards/menus keep layers);
   - whether the transcript column is the only wide transparent region;
   - whether the boot sweep reads against DSH's real first paint, and whether the
     readiness cut lands at the right moment on this machine.
3. **Capture proof** — screenshot the running app on both slots; put them in
   `preview/` next to the harness shots and note in this file that they are real.
4. **Tune what only the app can show**: composer contrast over the field, sidebar
   rail tone, whether the brand plate's plate-and-flag survives DSH's own sidebar
   padding, and whether uppercase-on-buttons is too loud.
5. **Decide the shell patch question** — the window is currently MLS's patch
   (transparent, no captions, maximised). Either revert to the pristine
   `app.asar.dsh-theme-marathon.bak` or adopt it as part of this theme.
6. **Only then** consider the packaging polish: publishable `README`/LICENSE for
   the bundle, a versioned build, and the artwork question in §7.
