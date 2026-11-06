# Handoff — read this first

Everything a fresh session needs to continue this project without re-deriving it.
Written at the end of the session that produced the design and the preview.

**Status:** design locked, preview complete and verified with real renders. **Not
installed** — nothing has been added to DSH yet. The next real task is packaging
the theme as a profile bundle (`§8`).

---

## 1. What this is

A theme for **DSH** (DeepSeek Harness) built on **Bethesda's Starfield** system UI —
not a literal star field, and no longer the Constellation *faction* (the result is
closer to the game's map UI, so the package name may become plain `starfield`).

Two surfaces, taken from two different in-game screens:

| Surface | Reference | Character |
| --- | --- | --- |
| **Dark — star map** | the system/star map | near-black deep blue, crisp dots, cyan routes, plus-mark grid, light stencil plates |
| **Light — dataslate** | the in-game note | matte gray-lavender paper, slate ink, mid-gray plates, dark primary block |

## 2. Locked decisions — do not relitigate without a reason

- **The two surfaces map onto DSH's own light/dark slots** rather than forcing one
  palette. The theme follows the app's Appearance setting.
- **Brand art is the real thing**: 17 per-glyph SVG paths + the fish path, extracted
  from the shipped bundle. The whale keeps DeepSeek blue `#4D6BFE`; the wordmark
  stays monochrome. Per-word colouring was studied and rejected — it splits
  `deepseek` mid-syllable and destroys the lighter small-caps `HARNESS`.
  See [`preview/wordmark-study.png`](../preview/wordmark-study.png).
- **Livery stripe** (`#D4AC63 #CD2435 #E56335 #2B4D7D #F4F5F7`) is *identity, not
  state*. It appears once, as a 4-bar flag on the brand plate's leading edge.
  Chalk is dropped there because the dark-mode plate is itself light. Orange and
  red already mean *metric* and *alert*, so the livery never touches data.
- **Boot is a 1.7s livery sweep**, CSS-only, widths allocated per load with bounds
  `[0.12, 0.31]` after normalisation. The band passes **in front of** the whale.
- **The chart never crosses the reading column** — enforced by a segment/rect
  intersection, covered by a headless test.
- **Typography**: Bahnschrift at `font-stretch: 88%` for chrome and labels, the
  system UI face for prose, Cascadia Mono for data.

## 3. File map

| Path | Purpose |
| --- | --- |
| [`preview/index.html`](../preview/index.html) | The preview shell; `?mode=light` renders the dataslate |
| [`preview/tokens.css`](../preview/tokens.css) | **Palette source of truth** — dark `:root`, light `[data-sf-mode="light"]` |
| [`preview/preview.css`](../preview/preview.css) | Component vocabulary: `.sf-plate`, `.sf-rows`, `.sf-key`, `.sf-engage`, `.sf-meter` |
| [`preview/starfield.js`](../preview/starfield.js) | Field engine: dots, plus-grid, waypoint rings, cyan routes, `avoid` rects |
| [`preview/boot.html`](../preview/boot.html) | Boot sweep; `?seed=` layout, `?freeze=` keyframe pause, `?still=` computed frame |
| [`preview/brand-paths.js`](../preview/brand-paths.js) | Real brand geometry (generated) |
| [`preview/wordmark.html`](../preview/wordmark.html) | Wordmark colour study |
| [`docs/DESIGN.md`](DESIGN.md) | Palette tables, components, livery, boot, field rules, gaps |
| [`_tools/field.test.js`](../_tools/field.test.js) | Headless invariant test (no stroke over prose) |
| [`_tools/asar-one.js`](../_tools/asar-one.js) | Extract a single file from `app.asar` reliably |
| [`tools/extract-brand-paths.js`](../tools/extract-brand-paths.js) | Regenerates `brand-paths.js` from the primitives bundle |
| [`tools/mockup.py`](../tools/mockup.py) / [`livery.py`](../tools/livery.py) | Offline palette / livery studies (superseded by real renders) |
| [`_reference/`](../_reference) | Extracted DSH packages + token inventory (research, see `§7`) |

## 4. DSH internals this project depends on

**A theme is a profile bundle package**, not a stylesheet. Two halves:

- **Host** (`index.js`, CJS) — hooks `webserver/index-inject`, which fires on *every*
  index response. That is how the pre-plugin boot screen gets styled, and it is the
  seam to use for per-load randomisation (emit literal values, no client JS).
- **Client** (`client.js`) — registers through `window.__ModuleLoader__.load({ id,
  factory })`; `apply(ctx)` overrides tokens via
  `ctx.get('theme').overrideTokens(id, { '--dsw-alias-…': { light, dark } })` and
  injects CSS.

Wiring: `package.json` → `dsh.bundle.patch` + `dsh.client.inject`/`platform`, the
package goes in `$DSH_HOME/profiles/desktop/node_modules/`, and its name is added to
`dsh.profile.bundles` in the profile `package.json`. **A new bundle only loads after
the desktop app restarts.**

**Scale of the token job:** 403 `--dsw-*` tokens, **107 `--dsw-alias-*`** — inventory
in [`_reference/tokens.txt`](../_reference/tokens.txt). Coverage must be *complete*:
DSH's light tokens resolve many surfaces to pure white, so a partial palette leaves
light text on white cards.

**Brand is slot-based:** `sidebar.brand.mark` and `sidebar.brand.name` are separate
slots — a theme can occupy the mark alone (whale in blue) and leave the wordmark to
the shell. That split is why the V4 treatment is the cheap one.

**Currently installed and active:** `dsh-theme-mls-desktop` (the Marathon theme) owns
the UI today, and its shell patch has modified `app.asar` (transparent window, hidden
captions, opens maximised). Pristine backup:
`<install>/resources/app.asar.dsh-theme-marathon.bak`. Wiring this theme means
removing the MLS entry from `dsh.profile.bundles`.

## 5. Environment traps (this cost the most time)

1. **The workspace root must grant `WRITE_OWNER`.** DSH's sandbox stamps a Low
   integrity label via `LABEL_SECURITY_INFORMATION`, which needs it. Inherited
   `Modify` is not enough and every command dies with
   `SetNamedSecurityInfoW failed (Win32 5)`. Repair:
   `icacls <folder> /grant '<user>:(OI)(CI)F'`.
2. **Elevated writes are undeletable from the sandbox.** Files created by an
   escalated command carry Medium integrity; the Low-integrity shell then gets
   "access denied" on delete. Clean those up with an escalated command too.
3. **Headless Chrome fails under the sandbox** (crashpad `OpenProcess: Access is
   denied`). Edge works:
   `msedge --headless=new --disable-gpu --disable-crashpad --disable-breakpad
   --allow-file-access-from-files --user-data-dir=<tmp> --virtual-time-budget=2500
   --window-size=1600,1000 --screenshot=<png> "file:///…"`. Launching a browser
   needs `danger-full-access`.
4. **Virtual-time screenshots do not reliably advance CSS animations**, so frozen
   frames lie. Test motion with `?freeze=<ms>` (offset `animation-delay` + paused),
   which renders the real keyframes. `?still=` computes its own transform and can
   therefore never catch a bug in the animation — it already hid one.
5. **`node -e` with quotes breaks in PowerShell.** Write a `.js` file and run it.
6. **`app.asar` extraction**: the header is a padded pickle — payload starts at
   `8 + uint32@4`, JSON length is `uint32@12`. Naive header walkers silently return
   0 bytes for some entries; use [`_tools/asar-one.js`](../_tools/asar-one.js).
7. **`--skew` / `--from` style variables must hold values, not functions**: CSS
   already wraps them (`skewX(var(--skew))`), so storing `skewX(…)` produced
   `skewX(skewX(…))` → invalid → `transform: none` → a static band.

## 6. Verification recipes

```powershell
# invariant: no stroke crosses the reading column
node _tools/field.test.js

# real screenshots of both surfaces (needs danger-full-access for the browser)
msedge --headless=new --disable-gpu --disable-crashpad --disable-breakpad `
  --allow-file-access-from-files --user-data-dir=$env:TEMP\sf `
  --virtual-time-budget=3500 --window-size=1600,1000 `
  --screenshot=$env:TEMP\shot.png "file:///D:/!Sparetime/dsh-theme-starfield/preview/index.html?mode=dark"

# boot keyframes at a given instant
"…preview/boot.html?freeze=900&seed=31"

# palette studies without a browser
python tools/mockup.py ; python tools/livery.py
```

## 7. Repo hygiene / open questions

- **`_reference/` is tracked** (10 files): extracted DSH packages including
  DeepSeek's own LICENSE, READMEs and brand artwork. Fine for a private repo;
  untrack before publishing: `git rm -r --cached _reference`.
- **`preview/brand-paths.js` is DeepSeek artwork** copied from the shipped bundle.
  Shipping it inside a published theme is a redistribution question — the clean
  route is to occupy the brand slots with artwork the deployment owns.
- A `.gitignore` was added late (`__pycache__`, `preview/_*.png`).
- The name may become `starfield` rather than `dsh-theme-starfield`.

## 8. Next steps, in order

1. **Package skeleton** — `package.json` (bundle patch + client contract),
   `cordis.patch.yml`, `index.js` host half, `client.js` client half.
2. **Host half**: inject the boot CSS *and* the five strip widths + shear as literal
   values per response (this is what keeps the boot JS-free and immune to `§5.7`).
   Also inject the pre-plugin palette so the first paint is already dark.
3. **Token mapping** — all 107 aliases, both slots, from `tokens.txt`. Verify no
   white surface survives in light mode.
4. **Client half** — `overrideTokens` for the palette, the field engine with `avoid`
   rects derived from **DSH's real transcript element** (not the preview's column),
   and the `.sf-*` component CSS.
5. **Install** — package into `$DSH_HOME/profiles/desktop/node_modules/`, add to
   `dsh.profile.bundles`, remove `dsh-theme-mls-desktop`, restart the app.
6. **In-situ verification** — screenshot the running app on both DSH themes; check
   the boot sweep against a real cold start; add a readiness marker on `<html>` so
   the sweep cannot outlive the boot interval.

## 9. Migrating to a clean session

This session ran with its workspace path junctioned to this repo
(`D:\!Sparetime\dsh_starfield_constellation_theme` → `D:\!Sparetime\dsh-theme-starfield`)
because a running session cannot be re-rooted. To migrate cleanly:

1. In this repo: commit the working tree (see `git status`).
2. Remove the junction: `rmdir 'D:\!Sparetime\dsh_starfield_constellation_theme'`
   — this deletes the link, never the repo.
3. In the app: **Add workspace** → `D:\!Sparetime\dsh-theme-starfield`.
4. Start the new session and read this file first.

Note: this repo's folder was granted `FullControl` for the current user so the
sandbox could stamp its integrity label — that is a normal owner state, not damage.
