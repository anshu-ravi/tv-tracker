#!/usr/bin/env python3
"""Generate PWA icons for tv-tracker in the "Bold" neo-brutalist style.

Regenerate with:
    python3 scripts/generate-icons.py

Produces (in public/):
    icon-192.png            - standard icon, acid-green bg, ink border + "TV" mark
    icon-512.png            - standard icon, larger
    icon-512-maskable.png   - full-bleed acid-green bg, no border, content in safe zone

Brand colors (see CLAUDE.md -> Design language "Bold"):
    paper       #f3eedf
    ink         #14110e
    acid-green  #c7ff3e
"""

import os

from PIL import Image, ImageDraw, ImageFont

PAPER = "#f3eedf"
INK = "#14110e"
ACID = "#c7ff3e"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public")

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_centered_text(draw: ImageDraw.ImageDraw, box_center, text, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = box_center[0] - w / 2 - bbox[0]
    y = box_center[1] - h / 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=fill)


def make_standard_icon(size: int, path: str) -> None:
    """Acid-green background, thick ink frame (offset hard-drop shadow),
    heavy ink "TV" monogram centered."""
    img = Image.new("RGB", (size, size), PAPER)
    draw = ImageDraw.Draw(img)

    margin = round(size * 0.08)
    border_w = max(round(size * 0.035), 3)
    shadow_off = round(size * 0.035)

    # Hard-drop shadow block (offset down-right), then the main card.
    shadow_box = [margin + shadow_off, margin + shadow_off, size - margin + shadow_off, size - margin + shadow_off]
    draw.rectangle(shadow_box, fill=INK)

    card_box = [margin, margin, size - margin, size - margin]
    draw.rectangle(card_box, fill=ACID, outline=INK, width=border_w)

    font_size = round(size * 0.42)
    font = load_font(font_size)
    cx = (card_box[0] + card_box[2]) / 2
    cy = (card_box[1] + card_box[3]) / 2
    draw_centered_text(draw, (cx, cy), "TV", font, INK)

    img.save(path, "PNG")


def make_maskable_icon(size: int, path: str) -> None:
    """Full-bleed acid-green background (no border that could get clipped),
    heavy ink "TV" monogram kept within the ~80% safe zone."""
    img = Image.new("RGB", (size, size), ACID)
    draw = ImageDraw.Draw(img)

    font_size = round(size * 0.34)
    font = load_font(font_size)
    cx, cy = size / 2, size / 2
    draw_centered_text(draw, (cx, cy), "TV", font, INK)

    img.save(path, "PNG")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    make_standard_icon(192, os.path.join(OUT_DIR, "icon-192.png"))
    make_standard_icon(512, os.path.join(OUT_DIR, "icon-512.png"))
    make_maskable_icon(512, os.path.join(OUT_DIR, "icon-512-maskable.png"))
    print("Generated icon-192.png, icon-512.png, icon-512-maskable.png in public/")


if __name__ == "__main__":
    main()
