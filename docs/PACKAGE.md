# dsh-theme-starfield — package README

A DeepSeek Harness theme built on Bethesda's **Starfield** system UI, in two
surfaces that follow the app's own Appearance setting:

| DSH slot | Surface | Character |
| --- | --- | --- |
| **dark** | the star map | near-black deep blue, crisp dots, cyan routes, plus-mark grid, light stencil plates |
| **light** | the dataslate | matte gray-lavender paper, slate ink, mid-gray plates, dark primary block |

Nothing here is a recolour: the palette, the typographic voice (Bahnschrift on
the width axis for chrome), the plate-and-flag brand lockup, and a real star
field behind the app are all part of the theme.

## What it does

- **Occupies the whole alias-token layer.** All 107 `--dsw-alias-*` tokens are
  mapped for both slots, plus the `--dsw-specific-*` surfaces (sidebar, bubble,
  menu) and the font/radius scales. DSH's light sheet resolves most surfaces to
  pure white, so a partial palette is what leaves white cards under light text.
- **The page is the map.** `--dsw-alias-bg-base` is transparent, so the frame and
  the transcript column become windows onto a canvas painted with the sky, the
  plus-grid, waypoint rings and cyan routes. Surfaces that must stay readable
  (cards, menus, sidebar, composer) keep opaque layer tokens.
- **No stroke over prose.** Routes and plus-marks are excluded from the live
  transcript, composer and user-bubble rects by a real segment/rect
  intersection. Dots behind prose are the point; lines behind prose are a bug.
- **A CSS-only boot sweep.** The Host half writes the curtain, the whale and one
  sheared band of the five livery colours into the served index, with the strip
  widths, band width and shear angle allocated per page load. No boot script.
- **A readiness cut.** The client half sets `html[data-sf-live]` only after the
  sweep has finished, so the curtain never lifts on a half-built app and the
  band never crosses an app the user can see.

## Install

The package must live in the profile's `node_modules`, and its name must be in
the profile's bundle list:

```powershell
# 1. copy the package into the profile
$profile = "$env:DSH_HOME\profiles\desktop"
Copy-Item -Recurse -Force .\package "$profile\node_modules\dsh-theme-starfield"

# 2. add it to dsh.profile.bundles in $profile\package.json
#    (and remove any other theme bundle — two themes both own the token layer)
```

Then **restart the desktop app**: a profile bundle is only resolved at startup.

To uninstall, remove the bundle row and the folder.

## What it cannot do by itself

- **The light slot needs DSH's own switch.** The theme follows Appearance; it
  never forces a scheme.
- **The window chrome is DSH's.** If another theme patched `app.asar` (transparent
  window, hidden captions, forced maximise), that patch is still in place. See
  the repository's `docs/HANDOFF.md` for the pristine backup path.
- **Bahnschrift is assumed present** (Windows 10+). There is no bundled font.

## Verifying it

```powershell
node _tools/theme.test.js       # alias coverage, palette parity, CSS balance
node _tools/field-app.test.js   # no stroke over prose or the composer
node _tools/boot.test.js        # boot allocation bounds + CSS shape
node _tools/client.test.js      # this bundle installs, tears down, no double mount
node tools/build-package.js --check   # package/ matches src/
```

The offline tests prove the invariants that can be proven without a running app.
The rest — how it actually reads — has to be judged on screen.
