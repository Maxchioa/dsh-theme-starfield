"""Compare placements for the game's five-colour livery stripe.

The question this answers: the gold/red/orange/navy/chalk stripe is iconic, but
where does it belong — inside the brand lockup, or somewhere structural?

Four placements are drawn over both surfaces so they can be judged rather than
argued about:

  A  FLAG      the stripe as a vertical flag on the plate's leading edge
  B  TICKS     five short dashes painted under the plate
  C  SEAM      a full-width livery band across the top of the window
  D  METER     logo untouched; the hue sequence spent on the context meter

usage: python tools/livery.py [out.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

import mockup as M

CELL_W, CELL_H = 620, 160
GAP = 12
LABEL_W = 92
MARGIN = 16

LIVERY = ["livery-1", "livery-2", "livery-3", "livery-4", "livery-5"]


def mark(draw, cx: float, cy: float, ink, scale: float = 1.0):
    """The orbit mark: ring, dashed inner ring, core dot, orbiting dot."""
    s = scale
    draw.ellipse([(cx - 6 * s) * M.S, (cy - 6 * s) * M.S,
                  (cx + 6 * s) * M.S, (cy + 6 * s) * M.S],
                 outline=(*ink[:3], 150), width=max(1, M.S))
    draw.ellipse([(cx - 3.4 * s) * M.S, (cy - 3.4 * s) * M.S,
                  (cx + 3.4 * s) * M.S, (cy + 3.4 * s) * M.S],
                 outline=(*ink[:3], 85), width=max(1, M.S))
    draw.ellipse([(cx - 1.7 * s) * M.S, (cy - 1.7 * s) * M.S,
                  (cx + 1.7 * s) * M.S, (cy + 1.7 * s) * M.S],
                 fill=(*ink[:3], 255))
    draw.ellipse([(cx + 4.6 * s) * M.S, (cy - 1 * s) * M.S,
                  (cx + 6.6 * s) * M.S, (cy + 1 * s) * M.S],
                 fill=(*ink[:3], 255))


def brand_plate(draw, pal, x: float, y: float, width: float, indent: float = 0.0):
    draw.rectangle([x * M.S, y * M.S, (x + width) * M.S, (y + 32) * M.S],
                   fill=(*pal["bar"][:3], 255))
    ink = pal["bar-ink"]
    mx = x + 16 + indent
    mark(draw, mx, y + 16, ink)
    face = M.display(11, 600)
    text_x = mx + 14
    M.tracked(draw, (text_x * M.S, (y + 9.5) * M.S), "CONSTELLATION", face, ink, tracking=0.16)
    sub_x = text_x + M.tracked_width(draw, "CONSTELLATION", face, 0.16) / M.S + 8
    M.tracked(draw, (sub_x * M.S, (y + 11) * M.S), "// STAR MAP", M.mono(9),
              (*ink[:3], 150), tracking=0.08)


def variant_flag(draw, pal, livery, x: float, y: float):
    width = 252
    brand_plate(draw, pal, x + 18, y, width, indent=18)
    # vertical flag on the leading edge
    bar_w = 18 / len(LIVERY)
    for i, colour in enumerate(livery):
        left = x + 18 + i * bar_w
        draw.rectangle([left * M.S, y * M.S, (left + bar_w) * M.S, (y + 32) * M.S],
                       fill=(*colour[:3], 255))


def variant_ticks(draw, pal, livery, x: float, y: float):
    width = 252
    brand_plate(draw, pal, x + 18, y, width)
    # painted markings under the plate
    seg_w, gap = 16, 4
    for i, colour in enumerate(livery):
        left = x + 18 + i * (seg_w + gap)
        draw.rectangle([left * M.S, (y + 38) * M.S, (left + seg_w) * M.S, (y + 41) * M.S],
                       fill=(*colour[:3], 255))


def variant_seam(draw, pal, livery, x: float, y: float):
    brand_plate(draw, pal, x + 18, y + 6, 252)
    # full-bleed band across the top of the window
    seg_w = CELL_W / len(LIVERY)
    for i, colour in enumerate(livery):
        left = x + i * seg_w
        draw.rectangle([left * M.S, y * M.S, (left + seg_w) * M.S, (y + 3) * M.S],
                       fill=(*colour[:3], 255))


def variant_meter(draw, pal, livery, x: float, y: float):
    brand_plate(draw, pal, x + 18, y, 252)
    # logo untouched; the hue sequence encodes the context meter's buckets
    track_x, track_y, track_w, track_h = x + 18, y + 52, 252, 7
    draw.rectangle([track_x * M.S, track_y * M.S,
                    (track_x + track_w) * M.S, (track_y + track_h) * M.S],
                   fill=(226, 232, 240, 30))
    filled = track_w * 0.62
    seg = filled / 4
    for i, colour in enumerate(livery[:4]):
        left = track_x + i * seg
        draw.rectangle([left * M.S, track_y * M.S,
                        (left + seg) * M.S, (track_y + track_h) * M.S],
                       fill=(*colour[:3], 255))
    face = M.display(9, 500)
    M.tracked(draw, (track_x * M.S, (track_y + 13) * M.S), "CONTEXT", face, pal["ink-3"],
              tracking=0.15)
    M.tracked(draw, ((track_x + 70) * M.S, (track_y + 13) * M.S), "62%", M.mono(10),
              pal["accent"], tracking=0.06)


VARIANTS = [
    ("A", "FLAG", variant_flag),
    ("B", "TICKS", variant_ticks),
    ("C", "SEAM", variant_seam),
    ("D", "METER", variant_meter),
]


def cell(pal, variant, mode: str) -> Image.Image:
    image = Image.new("RGB", (CELL_W * M.S, CELL_H * M.S), pal["paper-1"][:3])
    draw = ImageDraw.Draw(image, "RGBA")
    livery = [pal[name] for name in LIVERY]
    variant(draw, pal, livery, 16, 22)
    label = M.display(9, 500)
    M.tracked(draw, (16 * M.S, (CELL_H - 22) * M.S), mode.upper(), label, pal["ink-3"],
              tracking=0.16)
    return image.resize((CELL_W, CELL_H), Image.LANCZOS)


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else M.ROOT / "preview" / "livery.png"
    palettes = M.load_tokens()

    rows = len(VARIANTS)
    width = LABEL_W + MARGIN + CELL_W + GAP + CELL_W + MARGIN
    height = MARGIN + rows * (CELL_H + 26)

    sheet = Image.new("RGB", (width * M.S, height * M.S), (18, 19, 21))
    draw = ImageDraw.Draw(sheet, "RGBA")

    head = M.display(10, 600)
    for column, mode in enumerate(("dark", "light")):
        x = LABEL_W + MARGIN + column * (CELL_W + GAP)
        M.tracked(draw, (x * M.S, 10 * M.S), f"{mode.upper()} SURFACE", head,
                  (210, 214, 220) if mode == "dark" else (230, 232, 236), tracking=0.18)

    for row, (letter, name, fn) in enumerate(VARIANTS):
        top = MARGIN + 18 + row * (CELL_H + 26)
        face = M.display(12, 600)
        M.tracked(draw, (4 * M.S, (top + 8) * M.S), letter, face, (240, 242, 245),
                  tracking=0.1)
        M.tracked(draw, (4 * M.S, (top + 26) * M.S), name, M.display(9, 500),
                  (150, 156, 164), tracking=0.14)
        for column, mode in enumerate(("dark", "light")):
            x = LABEL_W + MARGIN + column * (CELL_W + GAP)
            tile = cell(palettes[mode], fn, mode)
            sheet.paste(tile, (int(x * M.S), int(top * M.S)))

    sheet = sheet.resize((width, height), Image.LANCZOS)
    sheet.save(out, "PNG")
    print(f"wrote {out} ({sheet.width}x{sheet.height})")


if __name__ == "__main__":
    main()
