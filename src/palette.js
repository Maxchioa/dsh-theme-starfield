/* =============================================================================
 * dsh-theme-starfield — palette + token map
 * -----------------------------------------------------------------------------
 * Two surfaces, one per DSH colour-scheme slot, exactly as the design record
 * (docs/DESIGN.md) locks them:
 *
 *   DARK  — the star map   → body[data-ds-dark-theme]
 *   LIGHT — the dataslate  → everywhere else (DSH's light slot)
 *
 * The palette is declared once as CSS custom properties; the token map then
 * refers to those properties, so a colour is written in one place and both
 * DSH slots resolve through it. Only genuinely per-slot *structure* differences
 * get an explicit pair.
 *
 * Why the map is this broad: DSH's light token sheet resolves many surfaces to
 * pure white, so a partial palette leaves white cards under light text. Every
 * `--dsw-alias-*` token in the shipped inventory is mapped (coverage is asserted
 * by _tools/theme.test.js), plus the `--dsw-specific-*` surface tokens the
 * appearance system publishes, plus the font and radius scales.
 * ========================================================================== */

'use strict';

/**
 * The identity colours, written once.
 *
 * The livery and the brand blue are *not* palette steps — they are the game's
 * equipment marking and DeepSeek's logo — so they are constants that both the
 * palette CSS and the Host boot screen interpolate. One source, two consumers.
 */
const LIVERY = ['#D4AC63', '#CD2435', '#E56335', '#2B4D7D', '#F4F5F7'];
const BRAND_BLUE = '#4D6BFE';

/**
 * The boot screen's own colours. The launcher is always the star map, in both
 * DSH slots: it is the theme's own surface, shown before the app has decided
 * which palette it is in, and a dark curtain cannot flash.
 */
const BOOT = {
  ground: '#070A10',
  void: '#080B10',
  ink: '#E9EDF2',
  dim: '#6B747F',
};

/** `--sf-*` custom properties for both surfaces. */
const PALETTE_CSS = `
/* ---------------------------------------------------------------------------
 * LIGHT — the dataslate. Default, because DSH marks dark explicitly.
 * Matte gray-lavender paper, slate ink, mid-gray plates, dark primary block.
 * Never white: a pure-white inversion reads as a website, not as hardware.
 * ------------------------------------------------------------------------- */
:root {
  --sf-void:        #C7C8D3;
  --sf-hull-sunken: #BCBCC8;
  --sf-hull:        #C2C2CE;
  /* The rail is the dataslate's bezel: a shade below the paper, so the column
     edge reads as a stamped seam rather than a colour change. */
  --sf-rail:        #B6B7C4;
  --sf-hull-raised: #D4D4DD;
  --sf-hull-high:   #DEDEE5;
  --sf-raise-hover: #E6E6EC;

  --sf-bar:         #747879;
  --sf-bar-ink:     #FFFFFF;
  --sf-bar-dim:     #5D6162;
  --sf-bar-dim-ink: #F2F3F4;

  --sf-border-1:    rgba(52, 58, 68, 0.14);
  --sf-border-2:    rgba(52, 58, 68, 0.20);
  --sf-border-3:    rgba(52, 58, 68, 0.28);
  --sf-border-4:    rgba(52, 58, 68, 0.40);
  --sf-line:        rgba(52, 58, 68, 0.26);
  --sf-line-strong: rgba(52, 58, 68, 0.42);

  --sf-ink:         #363B43;
  --sf-ink-2:       #4E5560;
  --sf-ink-3:       #6E767F;
  --sf-ink-inverse: #EDEDF1;

  --sf-action:        #363B43;
  --sf-action-hover:  #2B2F36;
  --sf-action-dimmed: rgba(54, 59, 67, 0.45);
  --sf-action-ink:    #EFEFF3;

  --sf-route:     #267F91;
  --sf-route-tint: rgba(38, 127, 145, 0.16);
  --sf-accent:    #B4681A;
  --sf-ok:        #4A7A36;
  --sf-alert:     #A8443C;

  --sf-cell-key:        rgba(52, 58, 68, 0.10);
  --sf-cell-key-strong: rgba(52, 58, 68, 0.18);
  --sf-cell-val:        rgba(52, 58, 68, 0.04);
  --sf-cell-alt:        rgba(255, 255, 255, 0.06);

  --sf-scrim-1:            rgba(24, 28, 36, 0.30);
  --sf-scrim-2:            rgba(24, 28, 36, 0.16);
  --sf-scrim-3:            rgba(24, 28, 36, 0.52);
  --sf-scrim-drop:         rgba(199, 200, 211, 0.72);
  --sf-scrim-toolbar:      rgba(28, 31, 38, 0.22);
  --sf-scrim-toolbar-strong: rgba(28, 31, 38, 0.32);
  --sf-scrim-invisible:    rgba(28, 31, 38, 0.10);
  --sf-skeleton:           rgba(52, 58, 68, 0.08);
  --sf-shimmer:            rgba(54, 59, 67, 0.22);
  --sf-switch-thumb:       #FFFFFF;

  --sf-scroll:       #A9ABB8;
  --sf-scroll-hover: #8E909E;
  --sf-scroll-2:     #B4B6C1;
  --sf-scroll-hover-2: #9A9CA9;

  --sf-star:     #4A5158;
  --sf-grid:     rgba(52, 58, 68, 0.16);
  --sf-vignette: rgba(74, 78, 90, 0.26);
  --sf-paper-1:  #C7C8D3;
  --sf-paper-2:  #B1B3C1;
}

/* ---------------------------------------------------------------------------
 * DARK — the star map. Near-black deep blue, crisp dots, cyan routes.
 * ------------------------------------------------------------------------- */
body[data-ds-dark-theme] {
  --sf-void:        #080B10;
  --sf-hull-sunken: #0B0F16;
  --sf-hull:        #10151E;
  /* A touch darker than the panels, so the rail is the frame and the panels sit
     inside it rather than the other way round. */
  --sf-rail:        #0C1018;
  --sf-hull-raised: #161C26;
  --sf-hull-high:   #1E2531;
  --sf-raise-hover: #232B38;

  --sf-bar:         #C7CBD1;
  --sf-bar-ink:     #191D24;
  --sf-bar-dim:     #939AA4;
  --sf-bar-dim-ink: #10141A;

  --sf-border-1:    rgba(226, 232, 240, 0.08);
  --sf-border-2:    rgba(226, 232, 240, 0.12);
  --sf-border-3:    rgba(226, 232, 240, 0.18);
  --sf-border-4:    rgba(226, 232, 240, 0.26);
  --sf-line:        rgba(226, 232, 240, 0.10);
  --sf-line-strong: rgba(226, 232, 240, 0.20);

  --sf-ink:         #E9EDF2;
  --sf-ink-2:       #A8B0BA;
  --sf-ink-3:       #6B747F;
  --sf-ink-inverse: #0D1117;

  --sf-action:        #E4E8EC;
  --sf-action-hover:  #F2F5F8;
  --sf-action-dimmed: rgba(228, 232, 236, 0.42);
  --sf-action-ink:    #10141A;

  --sf-route:      #3FC9DE;
  --sf-route-tint: rgba(63, 201, 222, 0.18);
  --sf-accent:     #EE9A2C;
  --sf-ok:         #67D14A;
  --sf-alert:      #E0564B;

  --sf-cell-key:        rgba(226, 232, 240, 0.12);
  --sf-cell-key-strong: rgba(226, 232, 240, 0.20);
  --sf-cell-val:        rgba(3, 6, 10, 0.34);
  --sf-cell-alt:        rgba(226, 232, 240, 0.03);

  --sf-scrim-1:            rgba(0, 0, 0, 0.42);
  --sf-scrim-2:            rgba(0, 0, 0, 0.24);
  --sf-scrim-3:            rgba(0, 0, 0, 0.56);
  --sf-scrim-drop:         rgba(7, 10, 16, 0.72);
  --sf-scrim-toolbar:      rgba(226, 232, 240, 0.08);
  --sf-scrim-toolbar-strong: rgba(226, 232, 240, 0.14);
  --sf-scrim-invisible:    rgba(0, 0, 0, 0.14);
  --sf-skeleton:           rgba(226, 232, 240, 0.06);
  --sf-shimmer:            rgba(233, 237, 242, 0.30);
  --sf-switch-thumb:       #E9EDF2;

  --sf-scroll:       #2C3440;
  --sf-scroll-hover: #3A4453;
  --sf-scroll-2:     #333C49;
  --sf-scroll-hover-2: #414C5C;

  --sf-star:     #EAEEF4;
  --sf-grid:     rgba(226, 232, 240, 0.075);
  --sf-vignette: rgba(2, 4, 7, 0.62);
  --sf-paper-1:  #0A0E15;
  --sf-paper-2:  #070A10;
}

/* The livery is identity, not state, and does not change between surfaces. */
body {
  --sf-livery-1: ${LIVERY[0]};
  --sf-livery-2: ${LIVERY[1]};
  --sf-livery-3: ${LIVERY[2]};
  --sf-livery-4: ${LIVERY[3]};
  --sf-livery-5: ${LIVERY[4]};

  /* DeepSeek brand blue — deliberately not one of the five livery colours:
     the livery is equipment marking, the whale is the logo. */
  --sf-brand-blue: ${BRAND_BLUE};

  --sf-font-display: Bahnschrift, "DIN Alternate", "Segoe UI", system-ui, sans-serif;
  --sf-font-ui: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
  --sf-font-mono: "Cascadia Mono", Consolas, ui-monospace, monospace;
  --sf-tracking-label: 0.17em;
  --sf-stretch: 88%;
  --sf-tracking-data: 0.05em;
}
`;

/** Value used in both slots — most of the map, since the palette does the work. */
const both = (value) => ({ light: value, dark: value });

/**
 * Alias-token map: `--dsw-*` name → `{ light, dark }`.
 *
 * Values stay symbolic (`var(--sf-…)`) rather than baked colours: the presenter
 * writes them onto `body` as inline custom properties, and they resolve against
 * the palette block above, which is the one place a colour is edited.
 *
 * Grouped by the job the token does in DSH's own vocabulary.
 */
const TOKENS = {
  /* -- surfaces -------------------------------------------------------------
   * `bg-base` is the frame and the transcript column. It is deliberately
   * transparent: the star field is the page, and every surface that must stay
   * legible (cards, menus, the composer) paints one of the layer tokens.
   *
   * The two surfaces disagree about which way a card sits, and that is not an
   * accident. On the star map the sky is the ground and a panel is a step *down*
   * into it, so layer-1 is the hull. On the dataslate the paper is the ground
   * and a card is a plate laid *on top* of it, so layer-1 is the lighter raise —
   * mapping both slots to one ramp would bury every card in the paper. */
  '--dsw-alias-bg-base': both('transparent'),
  '--dsw-alias-bg-layer-1': { light: 'var(--sf-hull-raised)', dark: 'var(--sf-hull)' },
  '--dsw-alias-bg-layer-2': { light: 'var(--sf-hull-high)', dark: 'var(--sf-hull-raised)' },
  '--dsw-alias-bg-layer-3': { light: 'var(--sf-raise-hover)', dark: 'var(--sf-hull-high)' },
  '--dsw-alias-bg-overlay': { light: 'var(--sf-hull-high)', dark: 'var(--sf-hull-raised)' },
  '--dsw-alias-bg-document-preview': both('var(--sf-hull-sunken)'),
  '--dsw-alias-bg-module-platform': both('var(--sf-hull-sunken)'),
  '--dsw-alias-bg-multi-select': { light: 'var(--sf-raise-hover)', dark: 'var(--sf-hull-high)' },
  '--dsw-alias-bg-document-selection': both('color-mix(in srgb, var(--sf-route) 38%, transparent)'),
  '--dsw-alias-bg-skeleton': both('var(--sf-skeleton)'),

  /* -- scrims (masks, photo drops, toolbar chips) -------------------------- */
  '--dsw-alias-bg-mask-1': both('var(--sf-scrim-1)'),
  '--dsw-alias-bg-mask-2': both('var(--sf-scrim-2)'),
  '--dsw-alias-bg-mask-3': both('var(--sf-scrim-3)'),
  '--dsw-alias-bg-mask-drop': both('var(--sf-scrim-drop)'),
  '--dsw-alias-bg-mask-photo': both('rgba(0, 0, 0, 0.88)'),

  /* -- hairlines ------------------------------------------------------------ */
  '--dsw-alias-border-l1': both('var(--sf-border-1)'),
  '--dsw-alias-border-l2': both('var(--sf-border-2)'),
  '--dsw-alias-border-l2-darkmode-thin': both('var(--sf-border-1)'),
  '--dsw-alias-border-l3': both('var(--sf-border-3)'),
  '--dsw-alias-border-l4': both('var(--sf-border-4)'),
  '--dsw-alias-border-inverted': both('var(--sf-line)'),
  '--dsw-alias-border-inverted2': both('var(--sf-line-strong)'),

  /* -- brand ----------------------------------------------------------------
   * The wordmark is monochrome plate ink; the whale keeps the blue and is
   * painted by CSS, not through these tokens (see components.css). */
  '--dsw-alias-brand-primary': both('var(--sf-ink)'),
  '--dsw-alias-brand-primary-invert': both('var(--sf-ink-inverse)'),
  '--dsw-alias-brand-primary-new-colorprimary-new-color': both('var(--sf-brand-blue)'),
  '--dsw-alias-brand-text': both('var(--sf-ink)'),

  /* -- buttons --------------------------------------------------------------
   * The primary block is the "JUMP" grammar: a solid block that inverts against
   * the surface, with dark ink on the light dark-mode block and vice versa. */
  '--dsw-alias-button-primary-fill': both('var(--sf-action)'),
  '--dsw-alias-button-primary-hover': both('var(--sf-action-hover)'),
  '--dsw-alias-button-primary-dimmed': both('var(--sf-action-dimmed)'),
  '--dsw-alias-button-contrast-fill': both('var(--sf-action)'),
  '--dsw-alias-button-elevated-fill': both('var(--sf-hull-raised)'),
  '--dsw-alias-button-floating-fill': both('var(--sf-hull-high)'),
  '--dsw-alias-button-floating-hover': both('var(--sf-raise-hover)'),
  '--dsw-alias-button-ghost-active-border': both('var(--sf-line-strong)'),
  '--dsw-alias-button-ghost-active-fill': both('var(--sf-cell-key)'),
  '--dsw-alias-button-ghost-active-hover': both('var(--sf-cell-key-strong)'),
  '--dsw-alias-button-info-fill': both('var(--sf-route-tint)'),
  '--dsw-alias-button-info-hover': both('color-mix(in srgb, var(--sf-route) 28%, transparent)'),
  '--dsw-alias-button-tool-bar-fill': both('var(--sf-scrim-toolbar)'),
  '--dsw-alias-button-tool-bar-fill-invisible': both('var(--sf-scrim-invisible)'),
  '--dsw-alias-button-tool-bar-hover': both('var(--sf-scrim-toolbar-strong)'),

  /* -- interaction tints --------------------------------------------------- */
  '--dsw-alias-interactive-bg-hover': both('var(--sf-cell-key)'),
  '--dsw-alias-interactive-bg-active': both('var(--sf-cell-key-strong)'),
  '--dsw-alias-interactive-bg-hover-accent': both('color-mix(in srgb, var(--sf-route) 16%, transparent)'),
  '--dsw-alias-interactive-bg-hover-danger': both('color-mix(in srgb, var(--sf-alert) 16%, transparent)'),
  '--dsw-alias-interactive-bg-hover-solid': both('var(--sf-hull-high)'),

  /* -- labels --------------------------------------------------------------
   * Three ink steps only. Captions stay on the third; nothing is pure black. */
  '--dsw-alias-label-primary': both('var(--sf-ink)'),
  '--dsw-alias-label-primary-bluish': both('var(--sf-ink)'),
  '--dsw-alias-label-primary-dimmed': both('var(--sf-ink-2)'),
  '--dsw-alias-label-primary-foreground': both('var(--sf-action-ink)'),
  '--dsw-alias-label-primary-inverted': both('var(--sf-ink-inverse)'),
  '--dsw-alias-label-secondary': both('var(--sf-ink-2)'),
  '--dsw-alias-label-tertiary': both('var(--sf-ink-3)'),
  '--dsw-alias-label-caption': both('var(--sf-ink-3)'),
  '--dsw-alias-label-dimmed': both('var(--sf-ink-3)'),
  '--dsw-alias-label-document-preview': both('var(--sf-ink-2)'),
  '--dsw-alias-label-shimmer': both('var(--sf-shimmer)'),
  '--dsw-alias-link': both('var(--sf-route)'),

  /* The activity label is a route signal, so it takes the cyan — the one
     "something is happening" colour the map owns. */
  '--dsw-alias-label-deep-diving': both('var(--sf-route)'),
  '--dsw-alias-label-deep-diving-shimmer': both('color-mix(in srgb, var(--sf-route) 30%, transparent)'),

  /* -- markdown ------------------------------------------------------------ */
  '--dsw-alias-markdown-citation': both('var(--sf-cell-key)'),
  '--dsw-alias-markdown-code-block': both('var(--sf-hull-sunken)'),
  '--dsw-alias-markdown-code-block-banner': both('var(--sf-hull)'),
  '--dsw-alias-markdown-code-segment-selected': both('var(--sf-hull-high)'),
  '--dsw-alias-markdown-code-segment-unselected': both('var(--sf-hull-sunken)'),
  '--dsw-alias-markdown-inline-code': both('var(--sf-cell-key)'),
  '--dsw-alias-markdown-placeholder': both('var(--sf-ink-3)'),
  '--dsw-alias-markdown-tag': both('var(--sf-hull-high)'),

  /* -- menus, toasts, tooltips ---------------------------------------------
   * Both the toast and the tooltip are stencil plates: a solid bar with dark
   * ink, the same grammar as a panel header in the game. */
  '--dsw-alias-menu-group-header-fill': both('color-mix(in srgb, var(--sf-hull-raised) 94%, transparent)'),
  '--dsw-alias-menu-icon': both('var(--sf-ink-2)'),
  '--dsw-alias-toast-bg': both('var(--sf-bar)'),
  '--dsw-alias-toast-label': both('var(--sf-bar-ink)'),
  '--dsw-alias-tooltip-bg': both('var(--sf-bar)'),
  '--dsw-alias-tooltip-key-bg': both('var(--sf-bar-dim)'),
  '--dsw-alias-turn-trigger-bg': both('var(--sf-hull)'),
  '--dsw-alias-turn-trigger-bg-hover': both('var(--sf-hull-high)'),

  /* -- states -------------------------------------------------------------
   * Business = route cyan (selection, focus, brand). Warn = metric orange.
     Error = alert red. Success = level green. Four meanings, four hues, and
     the livery never touches any of them. */
  '--dsw-alias-state-business-primary': both('var(--sf-route)'),
  '--dsw-alias-state-business-tertiary': both('color-mix(in srgb, var(--sf-route) 14%, transparent)'),
  '--dsw-alias-state-error-primary': both('var(--sf-alert)'),
  '--dsw-alias-state-error-secondary': both('color-mix(in srgb, var(--sf-alert) 70%, var(--sf-ink))'),
  '--dsw-alias-state-idle-primary': both('var(--sf-ink-3)'),
  '--dsw-alias-state-success-primary': both('var(--sf-ok)'),
  '--dsw-alias-state-success-secondary': both('var(--sf-ok)'),
  '--dsw-alias-state-success-tertiary': both('color-mix(in srgb, var(--sf-ok) 14%, transparent)'),
  '--dsw-alias-state-warn-primary': both('var(--sf-accent)'),
  '--dsw-alias-state-warn-secondary': both('var(--sf-accent)'),
  '--dsw-alias-state-warn-label': both('var(--sf-accent)'),
  '--dsw-alias-state-warn-tertiary': both('color-mix(in srgb, var(--sf-accent) 14%, transparent)'),

  /* -- diffs --------------------------------------------------------------- */
  '--dsw-alias-code-diff-added': both('color-mix(in srgb, var(--sf-ok) 14%, transparent)'),
  '--dsw-alias-code-diff-deleted': both('color-mix(in srgb, var(--sf-alert) 14%, transparent)'),
  '--dsw-alias-file-diff-added-bg': both('color-mix(in srgb, var(--sf-ok) 12%, var(--sf-hull-sunken))'),
  '--dsw-alias-file-diff-added-gutter': both('color-mix(in srgb, var(--sf-ok) 20%, var(--sf-hull-sunken))'),
  '--dsw-alias-file-diff-added-marker': both('var(--sf-ok)'),
  '--dsw-alias-file-diff-deleted-bg': both('color-mix(in srgb, var(--sf-alert) 12%, var(--sf-hull-sunken))'),
  '--dsw-alias-file-diff-deleted-gutter': both('color-mix(in srgb, var(--sf-alert) 20%, var(--sf-hull-sunken))'),
  '--dsw-alias-file-diff-deleted-marker': both('var(--sf-alert)'),

  /* -- controls ------------------------------------------------------------ */
  '--dsw-alias-switch-thumb': both('var(--sf-switch-thumb)'),
  '--dsw-alias-scrollbar-bg-l1': both('var(--sf-scroll)'),
  '--dsw-alias-scrollbar-bg-l2': both('var(--sf-scroll-2)'),
  '--dsw-alias-scrollbar-hover-l1': both('var(--sf-scroll-hover)'),
  '--dsw-alias-scrollbar-hover-l2': both('var(--sf-scroll-hover-2)'),

  /* -- settings + onboarding ---------------------------------------------- */
  '--dsw-alias-settings-card-fill': { light: 'var(--sf-hull-raised)', dark: 'var(--sf-hull)' },
  '--dsw-alias-settings-card-stroke': both('var(--sf-border-4)'),
  '--dsw-alias-onboarding-accent': both('var(--sf-route)'),
  '--dsw-alias-onboarding-card-fill': both('color-mix(in srgb, var(--sf-hull-raised) 85%, transparent)'),
  '--dsw-alias-onboarding-secondary-fill': both('var(--sf-hull-raised)'),
  '--dsw-alias-onboarding-checkbox-border': both('var(--sf-border-3)'),

  /* -- surface tokens DSH publishes outside the alias namespace ------------
   * These are what the sidebar, the user bubble and the menu actually paint
   * with; leaving them stock is what leaves a white column under a theme. */
  '--dsw-specific-sidebar-fill': both('var(--sf-rail)'),
  '--dsw-specific-sidebar-nav-item-active': both('var(--sf-hull-raised)'),
  '--dsw-specific-sidebar-nav-item-active-accent': both('color-mix(in srgb, var(--sf-route) 18%, transparent)'),
  '--dsw-specific-sidebar-nav-item-hover': both('var(--sf-hull-raised)'),
  '--dsw-specific-bubble': { light: 'var(--sf-hull-high)', dark: 'var(--sf-hull-raised)' },
  '--dsw-specific-bubble-highlight': { light: 'var(--sf-raise-hover)', dark: 'var(--sf-hull-high)' },
  '--dsw-specific-input-major': both('var(--sf-hull)'),
  '--dsw-specific-login-input': both('var(--sf-hull-sunken)'),
  '--dsw-specific-selector': { light: 'var(--sf-raise-hover)', dark: 'var(--sf-hull-high)' },
  '--dsw-specific-tip': { light: 'var(--sf-hull-raised)', dark: 'var(--sf-hull-raised)' },
  '--dsw-specific-menu': {
    light: 'color-mix(in srgb, var(--sf-hull-high) 98%, transparent)',
    dark: 'color-mix(in srgb, var(--sf-hull-raised) 98%, transparent)',
  },
  '--dsw-menu-surface-fill': {
    light: 'color-mix(in srgb, var(--sf-hull-high) 97%, transparent)',
    dark: 'color-mix(in srgb, var(--sf-hull-raised) 97%, transparent)',
  },

  /* -- type scale -----------------------------------------------------------
   * Chrome and labels take Bahnschrift (on the width axis, see components.css);
   * prose keeps the system UI face, which is the readable one at 14px.
   * The code family is `--ds-font-family-code` (not `--dsw-`): the token sheets
   * reference it directly, so it has to be overridden under its own name. */
  '--dsw-font-family': both('var(--sf-font-ui)'),
  '--ds-font-family-code': both('var(--sf-font-mono)'),
  '--dsw-font-family-brand': both('var(--sf-font-display)'),

  /* -- corner scale ---------------------------------------------------------
   * The game's chrome is square with a small machined radius; DSH's defaults
   * are much rounder, which is the largest single tell that a theme is a
   * recolour rather than a design. */
  '--dsw-radius-xs': both('2px'),
  '--dsw-radius-sm': both('2px'),
  '--dsw-radius-md': both('3px'),
  '--dsw-radius-lg': both('4px'),
  '--dsw-radius-xl': both('6px'),
  '--dsw-radius-panel': both('4px'),
};

module.exports = { PALETTE_CSS, TOKENS, LIVERY, BRAND_BLUE, BOOT };
