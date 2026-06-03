#!/usr/bin/env python3
"""
Build all ClaudeHub app icons from a raster source PNG.

Unlike generate_icons.py (which draws the icon as an SVG), this takes a
ready-made square artwork — build/icon-source.png — crops it tight to the
coral squircle, rounds the corners to transparency, and emits every asset the
app ships: PNG sizes, a multi-res Windows .ico, a macOS .icns, plus
public/logo.png for the renderer / favicon.

Run:  python3 scripts/icon_from_png.py
"""

import os
import subprocess
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
ICONS = os.path.join(BUILD, "icons")
PUBLIC = os.path.join(ROOT, "public")
SOURCE = os.path.join(BUILD, "icon-source.png")

MASTER = 1024
PNG_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024]
ICO_SIZES = [16, 32, 48, 64, 128, 256]
ICNS_MAP = {
    "icon_16x16.png": 16,
    "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32,
    "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128,
    "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256,
    "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512,
    "icon_512x512@2x.png": 1024,
}

# Corner radius of the squircle as a fraction of the icon side. ~0.224 matches
# the coral squircle in the source art (and Apple's rounded-rect proportion).
CORNER_FRAC = 0.224


def coral_mask(rgb: Image.Image) -> Image.Image:
    """L-mode mask: 255 where the saturated coral squircle is (burst/white = 0)."""
    s = rgb.convert("HSV").getchannel("S")
    return s.point(lambda v: 255 if v > 40 else 0)


def detect_corner_radius(mask: Image.Image, bbox) -> int:
    """Corner radius in source px ≈ inset of the leftmost coral pixel on the top edge."""
    left, top, right, _bottom = bbox
    px = mask.load()
    # sample a few rows just inside the top edge to dodge anti-aliasing
    best = right - left
    for y in range(top + 1, top + 6):
        row_min = None
        for x in range(left, right):
            if px[x, y]:
                row_min = x
                break
        if row_min is not None:
            best = min(best, row_min - left)
    return max(0, best)


def make_master() -> Image.Image:
    src = Image.open(SOURCE).convert("RGB")
    mask = coral_mask(src)
    bbox = mask.getbbox()
    if bbox is None:
        raise SystemExit("No coral content found in source image")

    left, _top, right, _bottom = bbox
    w, h = right - left, _bottom - _top
    crop = src.convert("RGBA").crop(bbox)  # fully opaque coral squircle

    # resize straight to the square master; the source is near-square (~1%),
    # so this is full-bleed with no transparent side strips to go wrong.
    master = crop.resize((MASTER, MASTER), Image.LANCZOS)

    # round the corners to transparency (detected radius, full-bleed art)
    r_src = detect_corner_radius(mask, bbox)
    radius = int(round(max(r_src * MASTER / w, MASTER * CORNER_FRAC)))
    radius = min(radius, MASTER // 2)

    corner = Image.new("L", (MASTER, MASTER), 0)
    ImageDraw.Draw(corner).rounded_rectangle(
        [0, 0, MASTER - 1, MASTER - 1], radius=radius, fill=255
    )
    # keep the art's own (opaque) alpha, but knock the corners out to transparent
    out_alpha = Image.composite(master.getchannel("A"), Image.new("L", (MASTER, MASTER), 0), corner)
    master.putalpha(out_alpha)
    print(f"  cropped {w}x{h}, corner radius ~{radius}px @ {MASTER}")
    return master


def main() -> None:
    os.makedirs(ICONS, exist_ok=True)
    os.makedirs(PUBLIC, exist_ok=True)

    master = make_master()

    rendered = {}
    for size in PNG_SIZES:
        img = master.resize((size, size), Image.LANCZOS) if size != MASTER else master
        rendered[size] = img
        img.save(os.path.join(ICONS, f"{size}x{size}.png"))
        print(f"  build/icons/{size}x{size}.png")

    rendered[512].save(os.path.join(BUILD, "icon.png"))
    rendered[512].save(os.path.join(PUBLIC, "logo.png"))
    print("Wrote build/icon.png and public/logo.png")

    rendered[256].save(
        os.path.join(BUILD, "icon.ico"), format="ICO", sizes=[(s, s) for s in ICO_SIZES]
    )
    print("Wrote build/icon.ico")

    _build_icns(master)
    print("\nAll ClaudeHub icons rebuilt from build/icon-source.png.")


def _build_icns(master: Image.Image) -> None:
    iconset = os.path.join(BUILD, "icon.iconset")
    os.makedirs(iconset, exist_ok=True)
    for name, size in ICNS_MAP.items():
        master.resize((size, size), Image.LANCZOS).save(os.path.join(iconset, name))

    iconutil = "/usr/bin/iconutil"
    if not os.path.exists(iconutil):
        print("iconutil not found; left build/icon.iconset for manual conversion.")
        return

    out = os.path.join(BUILD, "icon.icns")
    try:
        subprocess.run([iconutil, "-c", "icns", iconset, "-o", out], check=True, capture_output=True)
        print("Wrote build/icon.icns")
        for name in ICNS_MAP:
            os.remove(os.path.join(iconset, name))
        os.rmdir(iconset)
    except subprocess.CalledProcessError as exc:  # pragma: no cover
        sys.stderr.write(exc.stderr.decode("utf-8", "replace"))
        raise


if __name__ == "__main__":
    main()
