# Starfield — design record

Theme for DSH, built on **Bethesda's Starfield**. Two references carry the whole
language, both captured in `_reference/`-style screenshots during design:

| Reference | What it is | What we take |
| --- | --- | --- |
| the **star map** | near-black deep blue, crisp dots, cyan route lines, plus-mark grid | the dark surface and the field engine |
| the **dataslate** note | matte gray-lavender paper, slate ink, mid-gray tab bars, dark bezel | the light surface |

This started as "Constellation" (the in-game faction). The result is closer to
the game's **system UI** than to faction branding, so the name may become plain
`starfield` — the palette and components do not depend on it.

## Palette

Defined once in [`preview/tokens.css`](../preview/tokens.css) as `:root` (dark)
and `[data-sf-mode="light"]`. `tools/mockup.py` parses that file, so the rendered
studies cannot drift from the live preview.

### Dark — the star map

| Token | Value | Role |
| --- | --- | --- |
| `--sf-paper-1/2` | `#0A0E15` / `#070A10` | Sky gradient, deep blue-black |
| `--sf-hull` | `#10151E` | Rail, panels |
| `--sf-hull-sunken` | `#0B0F16` | Composer, code wells |
| `--sf-hull-raised` | `#161C26` | User bubble, hover plates |
| `--sf-bar` | `#C7CBD1` | **Stencil plate**: light bar with dark ink |
| `--sf-ink` | `#E9EDF2` | Body ink |
| `--sf-ink-2` | `#A8B0BA` | Labels, secondary |
| `--sf-ink-3` | `#6B747F` | Micro-labels, counts |
| `--sf-route` | `#3FC9DE` | Cyan: routes, selection, focus |
| `--sf-accent` | `#EE9A2C` | Orange: metrics, progress, waypoint dots |
| `--sf-ok` | `#67D14A` | Level / online |
| `--sf-action` | `#E4E8EC` | Primary block with dark ink, like JUMP |

### Light — the dataslate

| Token | Value | Role |
| --- | --- | --- |
| `--sf-paper-1/2` | `#C7C8D3` / `#B1B3C1` | Paper, gray-lavender |
| `--sf-hull-sunken` | `#BCBCC8` | Inset wells |
| `--sf-bar` | `#747879` | Plates, white ink on neutral gray |
| `--sf-ink` | `#363B43` | Slate ink, never black |
| `--sf-action` | `#363B43` | Primary block inverts to dark |
| `--sf-route` | `#267F91` | Teal, darkened for paper contrast |

**Not white.** The dataslate is matte gray-lavender; a pure-white inversion would
read as a website's light mode rather than a piece of hardware.

## Component vocabulary

These are the pieces the game's UI is actually made of, and the theme reuses all
five ([`preview/preview.css`](../preview/preview.css)):

| Class | Reference element | Used here as |
| --- | --- | --- |
| `.sf-plate` | `SYSTEM`, `TRAVEL DATA`, `TEXT LOG` header bars | rail groups, telemetry panel, brand plate |
| `.sf-rows` | `JUMPS 1` / `TYPE ROCK` label-value tables | tool-call details, session telemetry |
| `.sf-key` | boxed `L`, `V`, `TAB`, `X` keycaps | composer hints |
| `.sf-engage` | the big light `JUMP` block | send button |
| `.sf-meter` | `FUEL CONSUMPTION 25.48` bar | context-window usage |

Keycap labels are ASCII (`ENTER`, `SHIFT ENTER`, `CTRL K`): `⌘` and `↵` are
missing from Consolas, so they render as tofu.

## The livery stripe

The game's five-colour stripe — brass `#D4AC63`, red `#CD2435`, orange `#E56335`,
navy `#2B4D7D`, chalk `#F4F5F7` — is in the palette as `--sf-livery-1..5`, and it
appears **once**: as a flag on the brand plate's leading edge.

Four placements were rendered and compared ([`preview/livery.png`](../preview/livery.png),
from [`tools/livery.py`](../tools/livery.py)):

| Variant | Verdict |
| --- | --- |
| **A — flag on the plate edge** | **Chosen.** Contained, structural, survives both surfaces |
| B — ticks painted under the plate | Reads as stray decoration; nothing anchors it |
| C — full-width band across the top | Loud, and the chalk segment vanishes into the light surface |
| D — the four hues on the context meter | Dilutes meaning: orange and red already mean *metric* and *alert* |

Three decisions are encoded in that choice:

1. **A flag, not a bar under the wordmark.** A horizontal multicolour bar in a logo
   lockup is the Google/Slack trope. A vertical stack, flush to a plate's edge, reads
   as a colour code painted on equipment — same colours, different grammar.
2. **Four, not five.** In dark mode the plate is itself light, so a chalk segment has
   nothing to contrast against. Dropping it also keeps the flag identical on both
   surfaces.
3. **Outside the semantic layer.** Route cyan, metric orange and alert red carry
   meaning. The livery is identity only, and lives on one plate so it never competes
   with a state colour.

Known weakness: on the dark surface the plate is light, so **brass** is the quietest
of the four (`#D4AC63` against `#C7CBD1`). The flag is 20px wide partly to give it
mass; if it still reads too faint, the fix is to let the flag overrun the plate
vertically so every bar touches the dark page.

Plate tone was tuned against the dataslate reference: the first mid-gray
(`#9A9AA6`) carried a violet cast that read pink against the paper, so the light
plates are now neutral `#747879` with pure-white ink (~4.4:1) and a darker
`#5D6162` for secondary plates, keeping the inactive-tab hierarchy.

## Typography

- **Chrome and labels:** Bahnschrift at `font-stretch: 88%` — a DIN-flavoured
  variable face that ships with Windows and is the closest system match to the
  game's condensed instrument lettering. Uppercase with `0.17em` tracking.
- **Body prose:** the system UI face. Bahnschrift stays out of paragraphs:
  condensed type at 14px costs readability, and prose is the product.
- **Data:** Cascadia Mono / Consolas, right-aligned in value cells.

## The brand

The wordmark is the real thing: `FISH_LOGO_PATH` and the 17 glyph paths of
`BrandWordmark`, extracted from the shipped bundle by
[`tools/extract-brand-paths.js`](../tools/extract-brand-paths.js) into
[`preview/brand-paths.js`](../preview/brand-paths.js). Every glyph is an SVG path
filled with `currentColor`.

The artwork reads **`deepseek` + small-caps `HARNESS`**. That shape decides the
colour question ([study](../preview/wordmark-study.png)):

| Treatment | Verdict |
| --- | --- |
| **Whale in brand blue, wordmark in plate ink** | **Chosen.** The whale is an icon, so colour on it reads as a mark; letters stay quiet |
| Whale brass, `deep` red, `seek` orange, `harness` navy | Rejected: splits one word at a syllable, which reads as corruption, not design |
| Whale blue, `deep` brass, `seek` red, `harness` orange | Rejected: same split, and red mid-word reads as an error state |
| Everything monochrome | Safe but flat; the mark loses the one colour it owns |

Two structural reasons back the choice, beyond taste:

1. **The slots are already split.** `sidebar.brand.mark` and `sidebar.brand.name`
   are separate slots, so a theme can occupy the mark with the whale in brand blue
   and leave the wordmark to the shell. Per-word colouring has no such seam — it
   needs DOM surgery on paths that are not stored in reading order.
2. **`HARNESS` is small caps at low weight.** Colour on the lightest part of the
   lockup is the least legible place to put a saturated hue.

Brand blue is `#4D6BFE`, deliberately *not* one of the five livery colours: the
livery is equipment marking, the whale is the logo.

## Boot

[`preview/boot.html`](../preview/boot.html) — one sheared band of all five livery
colours crosses the screen once and the boot plate fades out behind it.

- **Timeline** — band 80 → 1480ms, mark 350 → 800ms, plate 1400 → 1820ms. ~1.8s
  total, and nothing is left on screen afterwards. The first cut ran the crossing
  in 680ms, which was over before the colours could be read; 1.4s is the slowest
  that still feels like a wipe rather than a loading screen.
- **Strip widths are allocated, not equal.** Each colour draws a weight from
  `[0.70, 1.40]`, the five are normalised to the band, then clamped to
  `[0.12, 0.31]` so no colour collapses or becomes a wall — an equal-fifths band
  reads as a logo template, uneven strips read as paint. Total band width and the
  shear angle (`-11°…-17°`) are drawn per load as well.
- **Randomisation belongs to the host, not the client.** `index-inject` fires on
  every index response, so the host half can emit the five width variables and
  the angle there — each page load gets a fresh layout while the boot path stays
  pure CSS with no JavaScript.
- **Geometry** — one flex row of five bars, `skewX(var(--skew))`, translated from
  `-band-26vw` to `+138vw` with 16vh overscan, so no band edge is ever visible.
- **Five colours here, four on the plate.** Chalk needs a dark ground; boot has
  one, the brand plate does not.
- **The band is in front of the whale.** The mark fades in behind it, so the wipe
  reveals the logo instead of painting colours over it.
- **`prefers-reduced-motion`** drops the band entirely and skips to the mark, so
  the wipe is never the only thing telling the user the app is starting.
- **The animation must not outlive its interval.** If plugins load faster than
  ~1.8s, a readiness marker on `<html>` should cut the overlay short rather than
  let a swipe play over an app that is already interactive.

The map layer is [`preview/starfield.js`](../preview/starfield.js).

1. **No stroke over prose.** Constituent edges and plus-marks that intersect the
   reading column are dropped, using a real segment/rect intersection. Endpoint
   plus midpoint sampling is *not* enough — a chord can clip a corner with all
   three sample points outside.
2. **Crisp, not glowing.** Dots are 0.4–2px with no bloom, except a small
   additive halo on the nine anchors. Bloom everywhere reads as a 2010s space
   wallpaper; the map has none.
3. **The grid is the texture.** A loose, jittered plus-mark grid (spacing ~⅓ of
   the short edge) does more for the identity than any gradient.
4. **Routes are cyan and rare.** Seven anchor stars on an off-centre ellipse plus
   a budget of ten short chains — never the "link every bright neighbour" web
   that drew ~140 edges and buried the text in the first attempt.
5. **Paper does not bloom.** In light mode the tinted waypoint dots and the halo
   are disabled, drift drops to 35%, and the dots read as printed specks.
6. **Reduced motion = one still frame.** Also pauses while the document is hidden,
   and the layer never takes input.

## Known gaps

- **No bundled font.** Bahnschrift is assumed present (Windows 10+). A licensed
  display face would sharpen the identity; so would a real game-style condensed
  grotesque.
- **The brand artwork is extracted, not licensed-in.** `brand-paths.js` is copied
  from the installed bundle for local prototyping. Shipping it inside a theme
  package is a redistribution question, and the honest alternative is to occupy
  the brand slots with artwork the deployment owns.
- **Light mode has no in-game UI reference** beyond the dataslate note, so its
  panel structure is extrapolated rather than observed.
