#!/usr/bin/env python3
"""
Generate ClaudeHub app icons.

The icon is *drawn as SVG* (a Claude-flavoured coral "sunburst hub"): a warm
terracotta squircle in Claude's signature coral palette, with a cream
Anthropic-style radial burst whose central disc + 12 rays read as a hub
radiating outward — i.e. one ClaudeHub feeding many Claude sessions.

The SVG is then rasterised with cairosvg into every PNG size the app needs,
plus a multi-resolution Windows .ico and a macOS .icns.

Run:  python3 scripts/generate_icons.py
"""

import math
import os
import subprocess
import sys

# ---------------------------------------------------------------------------
# Make cairosvg find Homebrew's libcairo on macOS.
# /usr/bin/python3 is SIP-protected, so DYLD_* env vars are stripped; point
# ctypes' find_library straight at the dylib instead.
# ---------------------------------------------------------------------------
import ctypes.util as _ctu

_BREW_CAIRO = "/opt/homebrew/lib/libcairo.2.dylib"
if os.path.exists(_BREW_CAIRO):
    _orig_find = _ctu.find_library

    def _find(name):  # noqa: ANN001
        if name and "cairo" in name.lower():
            return _BREW_CAIRO
        return _orig_find(name)

    _ctu.find_library = _find

import cairosvg  # noqa: E402
from PIL import Image  # noqa: E402

# ---------------------------------------------------------------------------
# Design constants (master canvas is 1024x1024)
# ---------------------------------------------------------------------------
SIZE = 1024
CX = CY = SIZE / 2.0

# Claude / Anthropic coral palette
CORAL_LIGHT = "#E8946F"   # top-left, lifted highlight
CORAL_MID = "#D97757"     # Claude's signature coral
CORAL_DEEP = "#BD5836"    # bottom-right, deep terracotta
CREAM_TOP = "#FBF8F1"     # Anthropic ivory
CREAM_BOT = "#EFE7D7"     # warm cream shadow side

CORNER_R = 230            # squircle-ish corner radius

N_RAYS = 12
R_DISC = 100              # central hub disc radius
R_IN = 88                # ray base radius (tucked under the disc edge)
R_OUT = 338              # ray tip radius
RAY_HALF_DEG = 7.0       # half-width of each ray at its base
R_CORE = 46              # lighter "core" highlight inside the hub

# PNG sizes the project ships
PNG_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024]
ICO_SIZES = [16, 32, 48, 64, 128, 256]

# macOS iconset mapping: filename -> rendered pixel size
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


def _ray_path(theta: float) -> str:
    """Triangular ray: two base points at R_IN, tapering to a tip at R_OUT."""
    a = math.radians(RAY_HALF_DEG)
    tip = (CX + R_OUT * math.cos(theta), CY + R_OUT * math.sin(theta))
    bl = (CX + R_IN * math.cos(theta - a), CY + R_IN * math.sin(theta - a))
    br = (CX + R_IN * math.cos(theta + a), CY + R_IN * math.sin(theta + a))
    return (
        f"M{bl[0]:.2f},{bl[1]:.2f} "
        f"L{tip[0]:.2f},{tip[1]:.2f} "
        f"L{br[0]:.2f},{br[1]:.2f} Z"
    )


def build_svg() -> str:
    """Return the master ClaudeHub icon as an SVG string."""
    rays = []
    for i in range(N_RAYS):
        theta = -math.pi / 2 + i * (2 * math.pi / N_RAYS)
        rays.append(f'      <path d="{_ray_path(theta)}"/>')
    rays_svg = "\n".join(rays)

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{CORAL_LIGHT}"/>
      <stop offset="52%" stop-color="{CORAL_MID}"/>
      <stop offset="100%" stop-color="{CORAL_DEEP}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="46%" r="58%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.16"/>
      <stop offset="55%" stop-color="#FFFFFF" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cream" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="{CREAM_TOP}"/>
      <stop offset="100%" stop-color="{CREAM_BOT}"/>
    </linearGradient>
  </defs>

  <!-- Claude coral squircle -->
  <rect width="{SIZE}" height="{SIZE}" rx="{CORNER_R}" fill="url(#bg)"/>
  <!-- soft top highlight for depth -->
  <rect width="{SIZE}" height="{SIZE}" rx="{CORNER_R}" fill="url(#glow)"/>

  <!-- Anthropic-style sunburst: a hub radiating outward -->
  <g fill="url(#cream)">
{rays_svg}
      <circle cx="{CX:.0f}" cy="{CY:.0f}" r="{R_DISC}"/>
  </g>
  <!-- lighter core to give the hub a focal point -->
  <circle cx="{CX:.0f}" cy="{CY:.0f}" r="{R_CORE}" fill="{CREAM_TOP}"/>
  <circle cx="{CX:.0f}" cy="{CY:.0f}" r="{R_CORE}" fill="{CORAL_MID}" opacity="0.10"/>
</svg>
'''


def rasterize(svg: str, size: int) -> Image.Image:
    """Render the SVG to a PIL RGBA image at the given pixel size."""
    png_bytes = cairosvg.svg2png(
        bytestring=svg.encode("utf-8"),
        output_width=size,
        output_height=size,
    )
    from io import BytesIO

    return Image.open(BytesIO(png_bytes)).convert("RGBA")


def main() -> None:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(script_dir)
    build_dir = os.path.join(root, "build")
    icons_dir = os.path.join(build_dir, "icons")
    public_dir = os.path.join(root, "public")
    os.makedirs(icons_dir, exist_ok=True)
    os.makedirs(public_dir, exist_ok=True)

    svg = build_svg()

    # 1. Write the source SVGs.
    with open(os.path.join(build_dir, "icon.svg"), "w") as fh:
        fh.write(svg)
    with open(os.path.join(public_dir, "logo.svg"), "w") as fh:
        fh.write(svg)
    print("Wrote build/icon.svg and public/logo.svg")

    # 2. Rasterize every PNG size.
    rendered: dict[int, Image.Image] = {}
    for size in PNG_SIZES:
        img = rasterize(svg, size)
        rendered[size] = img
        img.save(os.path.join(icons_dir, f"{size}x{size}.png"))
        print(f"  build/icons/{size}x{size}.png")

    # 3. Main PNGs for app + web.
    rendered[512].save(os.path.join(build_dir, "icon.png"))
    rendered[512].save(os.path.join(public_dir, "logo.png"))
    print("Wrote build/icon.png and public/logo.png")

    # 4. Windows .ico (multi-resolution).
    ico_path = os.path.join(build_dir, "icon.ico")
    base = rendered[256]
    base.save(
        ico_path,
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
    )
    print("Wrote build/icon.ico")

    # 5. macOS .icns via iconutil (skips cleanly if not on macOS).
    _build_icns(svg, build_dir)

    print("\nAll ClaudeHub icons generated.")


def _build_icns(svg: str, build_dir: str) -> None:
    iconset = os.path.join(build_dir, "icon.iconset")
    os.makedirs(iconset, exist_ok=True)
    for name, size in ICNS_MAP.items():
        rasterize(svg, size).save(os.path.join(iconset, name))

    iconutil = "/usr/bin/iconutil"
    if not os.path.exists(iconutil):
        print("iconutil not found; left build/icon.iconset for manual conversion.")
        return

    out = os.path.join(build_dir, "icon.icns")
    try:
        subprocess.run(
            [iconutil, "-c", "icns", iconset, "-o", out],
            check=True,
            capture_output=True,
        )
        print("Wrote build/icon.icns")
        # clean up the intermediate iconset
        for name in ICNS_MAP:
            os.remove(os.path.join(iconset, name))
        os.rmdir(iconset)
    except subprocess.CalledProcessError as exc:  # pragma: no cover
        sys.stderr.write(exc.stderr.decode("utf-8", "replace"))
        raise


if __name__ == "__main__":
    main()
