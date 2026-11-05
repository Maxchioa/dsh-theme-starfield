"""Render palette/atmosphere studies of the starfield theme.

Two surfaces, taken from the game:

  dark  — the star map: near-black deep blue, crisp ivory dots, cyan routes,
          plus-mark grid, light "stencil plate" panel headers.
  light — the dataslate: matte gray-lavender paper, slate ink, mid-gray plates,
          dark primary block, printed paper edge.

This is not a screenshot: it re-implements the preview page's field (same seed,
same star sizing rules, same exclusion of the reading column) and its component
vocabulary in Pillow, so the direction can be reviewed without opening a browser.
Colours are parsed from `preview/tokens.css` — the single source of truth — so a
palette change updates both surfaces.

usage: python tools/mockup.py [outdir]
"""

from __future__ import annotations

import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
TOKENS = ROOT / "preview" / "tokens.css"

W, H = 1600, 1000
S = 2  # supersample factor; downscaled at the end

FONT_FILES = {
    "display": r"C:\Windows\Fonts\bahnschrift.ttf",
    "ui": r"C:\Windows\Fonts\segoeui.ttf",
    "ui_sb": r"C:\Windows\Fonts\seguisb.ttf",
    "mono": r"C:\Windows\Fonts\consola.ttf",
}

TRACK = 0.17  # label tracking, in em


# --------------------------------------------------------------------- tokens


def _parse_block(css: str) -> dict[str, tuple[int, int, int, int]]:
    out: dict[str, tuple[int, int, int, int]] = {}
    for match in re.finditer(r"--sf-([a-z0-9-]+)\s*:\s*([^;]+);", css):
        name = match.group(1)
        value = match.group(2).strip()
        rgba = re.fullmatch(
            r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)", value
        )
        hexa = re.fullmatch(r"#([0-9a-fA-F]{6})", value)
        if rgba:
            r, g, b = (int(rgba.group(i)) for i in (1, 2, 3))
            alpha = float(rgba.group(4)) if rgba.group(4) else 1.0
            out[name] = (r, g, b, int(round(alpha * 255)))
        elif hexa:
            raw = hexa.group(1)
            out[name] = (int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16), 255)
    return out


def load_tokens() -> dict[str, dict[str, tuple[int, int, int, int]]]:
    css = TOKENS.read_text(encoding="utf-8")
    split = css.find('[data-sf-mode="light"]')
    dark_css, light_css = (css[:split], css[split:]) if split != -1 else (css, "")
    dark = _parse_block(dark_css)
    light = dict(dark)
    light.update(_parse_block(light_css))

    required = {
        "void", "hull", "hull-sunken", "hull-raised", "hull-high", "bar",
        "bar-ink", "bar-dim", "bar-dim-ink", "ink", "ink-2", "ink-3",
        "line", "line-strong", "action", "action-ink", "route", "accent",
        "ok", "cell-key", "cell-val", "cell-alt", "star", "grid", "vignette",
        "paper-1", "paper-2",
    }
    for mode, table in (("dark", dark), ("light", light)):
        missing = required - table.keys()
        if missing:
            raise SystemExit(f"{mode} palette is missing: {sorted(missing)}")
    return {"dark": dark, "light": light}


# ------------------------------------------------------------------------ rng


def mulberry32(seed: int):
    state = seed & 0xFFFFFFFF

    def imul(a: int, b: int) -> int:
        return (a * b) & 0xFFFFFFFF

    def rnd() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = imul(t ^ (t >> 15), (t | 1) & 0xFFFFFFFF)
        t = (t ^ ((t + imul(t ^ (t >> 7), (t | 61) & 0xFFFFFFFF)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return rnd


# ------------------------------------------------------------------------ fonts


def display(size: float, weight: float = 400, stretch: float = 88.0):
    try:
        face = ImageFont.truetype(FONT_FILES["display"], int(round(size * S)))
        face.set_variation_by_axes([weight, stretch])
        return face
    except (OSError, ValueError):
        try:
            return ImageFont.truetype(FONT_FILES["display"], int(round(size * S)))
        except OSError:
            return ImageFont.load_default()


def ui(size: float, bold: bool = False):
    try:
        return ImageFont.truetype(
            FONT_FILES["ui_sb" if bold else "ui"], int(round(size * S))
        )
    except OSError:
        return ImageFont.load_default()


def mono(size: float):
    try:
        return ImageFont.truetype(FONT_FILES["mono"], int(round(size * S)))
    except OSError:
        return ImageFont.load_default()


def tracked(draw, xy, text: str, face, fill, tracking: float = TRACK):
    x, y = xy
    step = tracking * (face.size / S) * S
    for char in text:
        draw.text((x, y), char, font=face, fill=fill)
        x += draw.textlength(char, font=face) + step


def tracked_width(draw, text: str, face, tracking: float = TRACK) -> float:
    step = tracking * (face.size / S) * S
    return sum(draw.textlength(c, font=face) + step for c in text)


def wrap(draw, text: str, face, max_width: float) -> list[str]:
    lines, current = [], ""
    for word in text.split():
        probe = (current + " " + word).strip()
        if draw.textlength(probe, font=face) > max_width:
            lines.append(current)
            current = word
        else:
            current = probe
    if current:
        lines.append(current)
    return lines


# ----------------------------------------------------------------------- field


def build_stars(width: float, height: float, seed: int = 20230906):
    rng = mulberry32(seed)
    count = max(70, min(360, round(width * height / 5000)))
    heroes = min(8, round(count * 0.03))
    stars = []
    for index in range(count):
        hero = index < heroes
        depth = 0.96 + rng() * 0.04 if hero else rng() ** 2.0
        x = rng() * width
        y = rng() * height
        tint = not hero and rng() < 0.055
        phase = rng() * math.tau
        rng()  # twinkle, unused in a still
        stars.append(
            {
                "x": x,
                "y": y,
                "depth": depth,
                "radius": 1.55 + rng() * 0.55 if hero else 0.42 + depth * 0.95,
                "base": 0.92 if hero else 0.18 + depth * 0.60,
                "tint": tint,
                "phase": phase,
            }
        )
    return stars


def build_edges(stars, width: float, height: float, avoid, seed: int = 20230906):
    rng = mulberry32(seed + 7)

    def hits_rect(x1, y1, x2, y2, rect) -> bool:
        dx, dy = x2 - x1, y2 - y1
        t0, t1 = 0.0, 1.0
        p = (-dx, dx, -dy, dy)
        q = (x1 - rect[0], rect[0] + rect[2] - x1,
             y1 - rect[1], rect[1] + rect[3] - y1)
        for i in range(4):
            if p[i] == 0:
                if q[i] < 0:
                    return False
            else:
                t = q[i] / p[i]
                if p[i] < 0:
                    if t > t1:
                        return False
                    t0 = max(t0, t)
                else:
                    if t < t0:
                        return False
                    t1 = min(t1, t)
        return True

    def clear(a, b) -> bool:
        return not any(hits_rect(a["x"], a["y"], b["x"], b["y"], r) for r in avoid)

    bright = [s for s in stars if s["depth"] > 0.62]
    edges = []
    cx, cy = width * 0.70, height * 0.38
    rx = min(width, height) * 0.46
    ry = rx * 0.40
    ring = []
    for i in range(7):
        angle = -0.34 + i / 7 * math.tau
        ax, ay = cx + math.cos(angle) * rx, cy + math.sin(angle) * ry
        if not bright:
            break
        nearest = min(bright, key=lambda s: (s["x"] - ax) ** 2 + (s["y"] - ay) ** 2)
        ring.append(nearest)
        bright.remove(nearest)
    for i, node in enumerate(ring):
        other = ring[(i + 1) % len(ring)]
        if clear(node, other):
            edges.append((node, other, 0.85, rng() * math.tau))

    candidates = []
    for i, a in enumerate(bright):
        for b in bright[i + 1:]:
            d2 = (b["x"] - a["x"]) ** 2 + (b["y"] - a["y"]) ** 2
            if d2 <= 190**2:
                candidates.append((d2, a, b))
    candidates.sort(key=lambda item: item[0])
    claimed: list = []
    taken = 0
    for _, a, b in candidates:
        if taken >= 10:
            break
        if a in claimed or b in claimed:
            continue
        if not clear(a, b):
            continue
        claimed.extend([a, b])
        edges.append((a, b, 0.5, rng() * math.tau))
        taken += 1
    return edges


def build_crosshairs(width: float, height: float, avoid, seed: int = 20230906):
    rng = mulberry32(seed + 31)
    spacing = max(170.0, min(420.0, min(width, height) / 3.1))
    marks = []
    gy = spacing * 0.5
    while gy < height:
        gx = spacing * 0.5
        while gx < width:
            x = gx + (rng() - 0.5) * spacing * 0.34
            y = gy + (rng() - 0.5) * spacing * 0.34
            arm = 4 + rng() * 5
            alpha = 0.05 + rng() * 0.05
            inside = any(
                r[0] <= x <= r[0] + r[2] and r[1] <= y <= r[1] + r[3] for r in avoid
            )
            if not inside:
                marks.append((x, y, arm, alpha))
            gx += spacing
        gy += spacing
    return marks


def build_rings(stars, avoid, seed: int = 20230906, wanted: int = 3):
    rng = mulberry32(seed + 53)
    anchors = [
        s for s in stars
        if s["depth"] > 0.9
        and not any(r[0] <= s["x"] <= r[0] + r[2] and r[1] <= s["y"] <= r[1] + r[3] for r in avoid)
    ]
    rings = []
    for _ in range(min(wanted, len(anchors))):
        pick = anchors[int(rng() * len(anchors))]
        rings.append((pick, 9 + rng() * 7, rng() * math.tau))
    return rings


# ------------------------------------------------------------------- painting


def radial(width: int, height: int, cx: float, cy: float, rx: float, ry: float,
           color) -> np.ndarray:
    ys, xs = np.mgrid[0:height, 0:width]
    dist = np.sqrt(((xs - cx) / rx) ** 2 + ((ys - cy) / ry) ** 2)
    falloff = np.clip(1.0 - dist, 0.0, 1.0) ** 2
    layer = np.zeros((height, width, 4), dtype=np.float32)
    layer[..., 0], layer[..., 1], layer[..., 2] = color[0], color[1], color[2]
    layer[..., 3] = falloff * color[3]
    return layer


def over(base: np.ndarray, layer: np.ndarray) -> np.ndarray:
    a = layer[..., 3:] / 255.0
    out = base.copy()
    out[..., :3] = base[..., :3] * (1 - a) + layer[..., :3] * a
    out[..., 3] = 255
    return out


def sky(pal, mode: str) -> Image.Image:
    """Opaque RGB base. Everything drawn later must blend, and Pillow only
    blends when the *image* is RGB and the draw mode is RGBA."""
    width, height = W * S, H * S
    top = pal["paper-2"] if mode == "dark" else pal["paper-1"]
    mid = pal["paper-1"]
    bottom = pal["paper-2"]
    stops = np.array([top[:3], mid[:3], bottom[:3]], dtype=np.float32)
    rows = np.linspace(0.0, 1.0, height)
    rgb = np.stack([np.interp(rows, [0.0, 0.58, 1.0], stops[:, c]) for c in range(3)], axis=1)
    base = np.zeros((height, width, 4), dtype=np.float32)
    base[..., :3] = rgb[:, None, :]
    base[..., 3] = 255

    if mode == "dark":
        base = over(base, radial(width, height, width * 0.62, height * 0.18,
                                 width * 0.46, width * 0.46, (63, 201, 222, 13)))
        base = over(base, radial(width, height, width * 0.18, height * 0.82,
                                 width * 0.50, width * 0.50, (238, 154, 44, 10)))
    else:
        base = over(base, radial(width, height, width * 0.5, 0,
                                 width * 0.7, height * 0.62, (255, 255, 255, 88)))
    return Image.fromarray(base[:, :, :3].astype(np.uint8), mode="RGB")


def paint_field(canvas: Image.Image, pal, mode: str, avoid) -> Image.Image:
    draw = ImageDraw.Draw(canvas, "RGBA")
    light = mode == "light"
    star_rgb = pal["star"]
    route_rgb = pal["route"]
    accent_rgb = pal["accent"]

    stars = build_stars(W, H)
    edges = build_edges(stars, W, H, avoid)
    marks = build_crosshairs(W, H, avoid)
    rings = build_rings(stars, avoid)

    # plus-mark grid
    grid_rgb = pal["grid"]
    for x, y, arm, alpha in marks:
        a = int(alpha * (0.85 if light else 1.0) * grid_rgb[3])
        col = (*grid_rgb[:3], max(0, min(255, a)))
        draw.line([(x * S - arm * S, y * S), (x * S + arm * S, y * S)], fill=col, width=max(1, S))
        draw.line([(x * S, y * S - arm * S), (x * S, y * S + arm * S)], fill=col, width=max(1, S))

    # cyan routes
    scale = 0.55 if light else 1.0
    for a, b, weight, phase in edges:
        alpha = int((0.10 + 0.10 * (0.5 + 0.5 * math.sin(phase))) * weight * scale * 255)
        draw.line([(a["x"] * S, a["y"] * S), (b["x"] * S, b["y"] * S)],
                  fill=(*route_rgb[:3], max(0, alpha)), width=max(1, S))

    # waypoint rings
    for star, radius, phase in rings:
        alpha = int((0.10 + 0.10 * (0.5 + 0.5 * math.sin(phase))) * (0.6 if light else 1.0) * 255)
        draw.ellipse(
            [star["x"] * S - radius * S, star["y"] * S - radius * S,
             star["x"] * S + radius * S, star["y"] * S + radius * S],
            outline=(*route_rgb[:3], max(0, alpha)), width=max(1, S),
        )

    # stars, with a small bloom on anchors in dark mode only
    glow = Image.new("L", canvas.size, 0)
    glow_draw = ImageDraw.Draw(glow)
    for star in stars:
        cx, cy = star["x"] * S, star["y"] * S
        radius = max(star["radius"], 0.4) * S
        alpha = star["base"] * (0.8 if light else 1.0) * 235
        alpha *= 0.74 + 0.26 * math.sin(star["phase"])
        colour = accent_rgb if (star["tint"] and not light) else star_rgb
        draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius],
                     fill=(*colour[:3], max(0, min(255, int(alpha)))))
        if not light and star["depth"] > 0.93:
            hr = star["radius"] * 2.6 * S
            glow_draw.ellipse([cx - hr, cy - hr, cx + hr, cy + hr], fill=70)

    if not light:
        glow = glow.filter(ImageFilter.GaussianBlur(3 * S))
        mask = np.array(glow).astype(np.float32) / 255.0
        arr = np.array(canvas).astype(np.float32)
        # Additive bloom reads as light; alpha-pasting it would grey the sky.
        arr += mask[..., None] * np.array(star_rgb[:3], dtype=np.float32) * 0.55
        canvas = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    return canvas


def vignette(canvas: Image.Image, pal, mode: str) -> Image.Image:
    width, height = canvas.size
    ys, xs = np.mgrid[0:height, 0:width]
    dist = np.sqrt(((xs - width / 2) / (width * 0.66)) ** 2
                   + ((ys - height * 0.46) / (height * 0.8)) ** 2)
    if mode == "dark":
        strength = pal["vignette"][3] / 255.0
        mask = np.clip((dist - 0.55) / 0.72, 0.0, 1.0) ** 1.4 * strength
    else:
        # dataslate: print darkening at the edges, plus a 1px inner bezel
        mask = np.clip((dist - 0.62) / 0.7, 0.0, 1.0) ** 1.6 * 0.30
    arr = np.array(canvas).astype(np.float32)
    arr[..., :3] *= (1.0 - mask[..., None])
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    if mode == "light":
        d = ImageDraw.Draw(out, "RGBA")
        d.rectangle([0, 0, width - 1, height - 1], outline=(52, 56, 66, 88), width=max(1, S))
    return out


# ---------------------------------------------------------------------- chrome


def plate(draw, x, y, width, height, pal, mode: str, text: str, right: str | None = None,
          dim: bool = False):
    fill = pal["bar-dim" if dim else "bar"]
    ink = pal["bar-dim-ink" if dim else "bar-ink"]
    draw.rectangle([x * S, y * S, (x + width) * S, (y + height) * S],
                   fill=(*fill[:3], 255))
    face = display(9.5, 600)
    tracked(draw, ((x + 10) * S, (y + height / 2 - 6.3) * S), text.upper(), face, ink)
    if right:
        mono_face = mono(9)
        w = draw.textlength(right, font=mono_face)
        draw.text(((x + width) * S - w - 10 * S, (y + height / 2 - 6) * S), right,
                  font=mono_face, fill=(*ink[:3], 170))


def rows_table(draw, x, y, width, pal, items: list[tuple[str, str, str | None]]):
    key_w = max(110, width * 0.34)
    row_h = 20
    for index, (key, value, tone) in enumerate(items):
        top = y + index * row_h
        draw.rectangle([x * S, top * S, (x + key_w) * S, (top + row_h) * S],
                       fill=(*pal["cell-key"][:3], pal["cell-key"][3]))
        draw.rectangle([(x + key_w) * S, top * S, (x + width) * S, (top + row_h) * S],
                       fill=((*pal["cell-alt"][:3], pal["cell-alt"][3]) if index % 2
                             else (*pal["cell-val"][:3], pal["cell-val"][3])))
        key_face = display(9, 500)
        tracked(draw, ((x + 9) * S, (top + 5.4) * S), key.upper(), key_face,
                (*pal["ink-2"][:3], 255), tracking=0.15)
        colour = pal["ink"]
        if tone == "ok":
            colour = pal["ok"]
        elif tone == "route":
            colour = pal["route"]
        val_face = mono(10.5)
        w = draw.textlength(value, font=val_face)
        draw.text(((x + width) * S - w - 10 * S, (top + 4.6) * S), value,
                  font=val_face, fill=(*colour[:3], 255))
    # hairlines between rows + outer box
    for index in range(1, len(items)):
        top = y + index * row_h
        draw.line([(x * S, top * S), ((x + width) * S, top * S)],
                  fill=(*pal["line"][:3], pal["line"][3]), width=max(1, S))
    draw.rectangle([x * S, y * S, (x + width) * S, (y + len(items) * row_h) * S],
                   outline=(*pal["line"][:3], pal["line"][3]), width=max(1, S))


def keycap(draw, x, y, label, pal, ink=None, height=17):
    """Boxed key. Width follows the label: a fixed 17px box clipped '⌘K'."""
    face = mono(9)
    text_w = draw.textlength(label, font=face)
    width = max(height, text_w / S + 10)
    draw.rectangle([x * S, y * S, (x + width) * S, (y + height) * S],
                   outline=(*pal["line-strong"][:3], pal["line-strong"][3]),
                   width=max(1, S))
    draw.text(((x + width / 2) * S - text_w / 2, (y + 4) * S), label, font=face,
              fill=(*(ink or pal["ink-2"])[:3], 255))
    return width


def render(mode: str, pal) -> Image.Image:
    avoid = [(COL_X - 22 - 16, TOP_H + 10, COL_W + 44 + 32, COMP_Y - TOP_H - 26)]

    canvas = sky(pal, mode)
    canvas = paint_field(canvas, pal, mode, avoid)
    canvas = vignette(canvas, pal, mode)
    draw = ImageDraw.Draw(canvas, "RGBA")

    ink, ink2, ink3 = pal["ink"], pal["ink-2"], pal["ink-3"]
    line, line_strong = pal["line"], pal["line-strong"]
    route, accent, ok = pal["route"], pal["accent"], pal["ok"]

    # -- top bar ------------------------------------------------------------
    draw.line([(0, TOP_H * S), (W * S, TOP_H * S)], fill=line, width=max(1, S))

    brand_w = 232
    plate(draw, 16, 6, brand_w, 32, pal, mode, "")
    # Livery flag: four bars flush to the plate's leading edge. Four, not five:
    # the plate is light in dark mode, so chalk would vanish into it.
    bar_w = 5
    for i in range(4):
        colour = pal[f"livery-{i + 1}"]
        left = 16 + i * bar_w
        draw.rectangle([left * S, 6 * S, (left + bar_w) * S, 38 * S],
                       fill=(*colour[:3], 255))
    ink_bar = pal["bar-ink"]
    # orbit mark, matching the preview's inline SVG
    mx, my = 48.0, 22.0
    draw.ellipse([(mx - 6) * S, (my - 6) * S, (mx + 6) * S, (my + 6) * S],
                 outline=(*ink_bar[:3], 150), width=max(1, S))
    draw.ellipse([(mx - 3.4) * S, (my - 3.4) * S, (mx + 3.4) * S, (my + 3.4) * S],
                 outline=(*ink_bar[:3], 85), width=max(1, S))
    draw.ellipse([(mx - 1.7) * S, (my - 1.7) * S, (mx + 1.7) * S, (my + 1.7) * S],
                 fill=(*ink_bar[:3], 255))
    draw.ellipse([(mx + 4.6) * S, (my - 1) * S, (mx + 6.6) * S, (my + 1) * S],
                 fill=(*ink_bar[:3], 255))

    brand_face = display(11, 600)
    tracked(draw, (62 * S, 9.5 * S), "CONSTELLATION", brand_face, ink_bar, tracking=0.16)
    sub_x = 62 + tracked_width(draw, "CONSTELLATION", brand_face, 0.16) / S + 8
    tracked(draw, (sub_x * S, 11 * S), "// STAR MAP", mono(9),
            (*ink_bar[:3], 150), tracking=0.08)

    meta = mono(9.5)
    labels = [("ORBIT 001", W - 300), ("SOL 4.2 AU", W - 214), ("SES 0042", W - 128)]
    for text, x in labels:
        draw.text((x * S, 15 * S), text, font=meta, fill=ink3)

    toggle_w = 58
    draw.rectangle([(W - 16 - toggle_w) * S, 12 * S, (W - 16) * S, 32 * S],
                   outline=(*line_strong[:3], line_strong[3]), width=max(1, S))
    toggle_face = display(9, 500)
    tracked(draw, ((W - 16 - toggle_w + 9) * S, 17 * S),
            "STAR MAP" if mode == "light" else "PAPER", toggle_face, ink2, tracking=0.13)

    # -- rail ---------------------------------------------------------------
    draw.line([(RAIL_W * S, TOP_H * S), (RAIL_W * S, (H - STATUS_H) * S)],
              fill=line, width=max(1, S))

    y = TOP_H
    plate(draw, 0, y, RAIL_W, 22, pal, mode, "Trajectory", right="04")
    y += 22

    item_face = ui(12.5)
    count_face = display(9.5, 500)
    items = [("Plotting a jump", "12", True), ("Grav-drive calibration", "04", False),
             ("Lodge resupply", "07", False), ("Survey: Kreet", "21", False)]
    y += 5
    for name, count, active in items:
        if active:
            draw.rectangle([0, y * S, 2 * S, (y + 26) * S], fill=route)
            draw.rectangle([0, y * S, RAIL_W * S, (y + 26) * S],
                           fill=(*pal["hull-raised"][:3], 235))
        draw.text((13 * S, (y + 5) * S), name, font=item_face,
                  fill=(*ink[:3], 255) if active else (*ink2[:3], 255))
        cw = draw.textlength(count, font=count_face)
        draw.text(((RAIL_W - 13) * S - cw, (y + 8) * S), count, font=count_face,
                  fill=(*(route if active else ink3)[:3], 255))
        y += 26
    y += 6

    draw.line([(0, y * S), (RAIL_W * S, y * S)], fill=line, width=max(1, S))
    plate(draw, 0, y, RAIL_W, 22, pal, mode, "Systems", dim=True)
    y += 22 + 5
    for name in ("Charts", "Instrumentation", "Ships & crews"):
        draw.text((13 * S, (y + 5) * S), name, font=item_face, fill=(*ink2[:3], 255))
        y += 26

    # -- telemetry (rail bottom) -------------------------------------------
    telem_h = 22 + 60 + 52
    telem_y = H - STATUS_H - telem_h
    draw.rectangle([0, (telem_y - 1) * S, RAIL_W * S, (H - STATUS_H) * S],
                   fill=(*pal["hull"][:3], 220))
    plate(draw, 0, telem_y, RAIL_W, 22, pal, mode, "Session data")
    rows_table(draw, 0, telem_y + 22, RAIL_W, pal,
               [("Turns", "12", None), ("Tokens", "41.2K", None), ("Cost", "$0.38", None)])

    meter_y = telem_y + 22 + 60 + 16
    tracked(draw, (11 * S, meter_y * S), "CONTEXT", display(9, 500), ink3, tracking=0.15)
    pct = "62%"
    pf = mono(10)
    draw.text(((RAIL_W - 11) * S - draw.textlength(pct, font=pf), (meter_y - 1) * S),
              pct, font=pf, fill=(*accent[:3], 255))
    track_y = meter_y + 15
    draw.rectangle([11 * S, track_y * S, (RAIL_W - 11) * S, (track_y + 7) * S],
                   fill=(226, 232, 240, 33) if mode == "dark" else (62, 68, 78, 46))
    draw.rectangle([11 * S, track_y * S, (11 + (RAIL_W - 22) * 0.62) * S, (track_y + 7) * S],
                   fill=(*accent[:3], 255))
    tick_x = 11 + (RAIL_W - 22) * 0.80
    draw.rectangle([tick_x * S, (track_y - 2) * S, (tick_x + 1) * S, (track_y + 9) * S],
                   fill=(226, 232, 240, 90))

    # -- transcript ---------------------------------------------------------
    body = ui(14)
    label_face = display(9, 600)
    ty = TOP_H + 26

    # user turn
    user_text = ("Plot a jump from Jemison to Cheyenne and keep the grav drive "
                 "under eighty percent. I want margin if the array drops.")
    bubble_w = COL_W * 0.78
    lines = wrap(draw, user_text, body, (bubble_w - 26) * S)
    bubble_h = len(lines) * 21 + 20
    bx = COL_X + COL_W - bubble_w
    who = "PILOT · 21:04"
    tracked(draw, ((COL_X + COL_W) * S - tracked_width(draw, who, label_face), (ty - 16) * S),
            who, label_face, ink3)
    draw.rectangle([bx * S, ty * S, (bx + bubble_w) * S, (ty + bubble_h) * S],
                   fill=(*pal["hull-raised"][:3], 240), outline=line, width=max(1, S))
    for i, ln in enumerate(lines):
        draw.text((bx * S + 13 * S, ty * S + 10 * S + i * 21 * S), ln, font=body, fill=ink)
    ty += bubble_h + 26

    # assistant label
    tracked(draw, (COL_X * S, ty * S), "CONSTELLATION", label_face, route)
    draw.text(((COL_X + 108) * S, (ty + 0.5) * S), "· 21:04", font=mono(9.5), fill=ink3)
    draw.line([((COL_X + 150) * S, (ty + 6) * S), ((COL_X + COL_W) * S, (ty + 6) * S)],
              fill=line, width=max(1, S))
    ty += 24

    # paragraphs
    def paragraph(text: str, top: float, face, colour) -> float:
        parts = wrap(draw, text, face, COL_W * S)
        for i, ln in enumerate(parts):
            draw.text((COL_X * S, (top + i * 22) * S), ln, font=face, fill=colour)
        return top + len(parts) * 22

    ty = paragraph(
        "Trajectory is plotted. Jemison to Cheyenne runs 18.4 ly — a single hop "
        "with the array at 74%, leaving a 6% reserve on the drive.",
        ty, body, ink,
    )
    ty += 16

    rows_table(draw, COL_X, ty, COL_W, pal, [
        ("File", "star-charts/cheyenne.jump", None),
        ("Latency", "42 ms", None),
        ("Status", "OK", "ok"),
    ])
    ty += 3 * 20 + 16

    # code block
    code_lines = [
        ("// jump plan · sol → cheyenne", ink3),
        ("const jump = {", accent),
        ('  from: "Jemison",', ink2),
        ("  safety: 0.80", ink2),
        ("}", accent),
    ]
    code_h = len(code_lines) * 19 + 20
    draw.rectangle([COL_X * S, ty * S, (COL_X + COL_W) * S, (ty + code_h) * S],
                   fill=(*pal["hull-sunken"][:3], 245), outline=line, width=max(1, S))
    draw.rectangle([COL_X * S, ty * S, (COL_X + 2) * S, (ty + code_h) * S], fill=route)
    code_face = mono(11.5)
    for i, (text, colour) in enumerate(code_lines):
        draw.text(((COL_X + 12) * S, (ty + 10 + i * 19) * S), text, font=code_face,
                  fill=(*colour[:3], 255))
    ty += code_h + 16

    paragraph(
        "Two things to flag: the margin sits inside tolerance but not inside the "
        "drive's own envelope at 0.61c — it holds, it just gets loud.",
        ty, body, ink,
    )

    # -- composer -----------------------------------------------------------
    comp_x = COL_X
    comp_w = COL_W
    comp_y = COMP_Y
    comp_h = 46
    draw.rectangle([comp_x * S, comp_y * S, (comp_x + comp_w) * S, (comp_y + comp_h) * S],
                   fill=(*pal["hull-sunken"][:3], 250), outline=line_strong, width=max(1, S))
    draw.text(((comp_x + 13) * S, (comp_y + 12) * S), "Message Constellation…",
              font=ui(13.5), fill=ink3)

    engage_w = 128
    ex = comp_x + comp_w - engage_w
    draw.rectangle([ex * S, comp_y * S, (comp_x + comp_w) * S, (comp_y + comp_h) * S],
                   fill=(*pal["action"][:3], 255))
    eng_face = display(10, 600)
    tracked(draw, ((ex + 14) * S, (comp_y + 16) * S), "ENGAGE", eng_face,
            pal["action-ink"], tracking=0.16)
    keycap(draw, ex + engage_w - 44, comp_y + 14, "ENTER", pal, ink=pal["action-ink"])

    # hints
    hint_face = display(9, 500)
    hx = comp_x
    hy = comp_y + comp_h + 8
    for label, key in (("SEND", "ENTER"), ("NEWLINE", "SHIFT ENTER"), ("TOOLS", "CTRL K"),
                       ("COMPLETE", "TAB")):
        hx += keycap(draw, hx, hy - 1, key, pal) + 6
        tracked(draw, (hx * S, (hy + 3) * S), label, hint_face, ink3, tracking=0.14)
        hx += tracked_width(draw, label, hint_face, 0.14) / S + 15

    # -- status bar ---------------------------------------------------------
    draw.line([(0, (H - STATUS_H) * S), (W * S, (H - STATUS_H) * S)],
              fill=line, width=max(1, S))
    status_face = display(9, 400)
    sx = 16.0
    for text, colour in (("PREVIEW", ink3), ("FIELD · ONLINE", ok)):
        tracked(draw, (sx * S, (H - STATUS_H + 8) * S), text, status_face, colour,
                tracking=0.12)
        sx += tracked_width(draw, text, status_face, 0.12) / S + 16
    right = "MASS 1.00G   O₂ 98%   SHELL v0.2"
    rw = tracked_width(draw, right, status_face, 0.12)
    tracked(draw, ((W - 16) * S - rw, (H - STATUS_H + 8) * S), right, status_face,
            ink3, tracking=0.12)

    return canvas.convert("RGB").resize((W, H), Image.LANCZOS)


RAIL_W, TOP_H, STATUS_H = 240, 44, 26
COL_W = 700
COL_X = RAIL_W + (W - RAIL_W - COL_W) / 2
COMP_Y = H - STATUS_H - 46 - 30


def main() -> None:
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "preview"
    palettes = load_tokens()
    for mode in ("dark", "light"):
        image = render(mode, palettes[mode])
        target = out_dir / f"mockup-{mode}.png"
        image.save(target, "PNG")
        print(f"wrote {target} ({image.width}x{image.height})")


if __name__ == "__main__":
    main()
