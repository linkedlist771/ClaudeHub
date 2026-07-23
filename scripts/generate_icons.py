#!/usr/bin/env python3
"""Generate the ChatGPT Hub application icons from a custom SVG mark."""

import ctypes.util as _ctu
from io import BytesIO
import os
import subprocess
import sys

_BREW_CAIRO = "/opt/homebrew/lib/libcairo.2.dylib"
if os.path.exists(_BREW_CAIRO):
    _original_find_library = _ctu.find_library

    def _find_library(name):  # noqa: ANN001
        if name and "cairo" in name.lower():
            return _BREW_CAIRO
        return _original_find_library(name)

    _ctu.find_library = _find_library

import cairosvg  # noqa: E402
from PIL import Image  # noqa: E402

SIZE = 1024
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


def build_svg() -> str:
    """Return a graphite hub mark that does not reproduce OpenAI's logo."""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#26302D"/>
      <stop offset="1" stop-color="#0C1210"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#63DDB8"/>
      <stop offset="1" stop-color="#0F9D7A"/>
    </linearGradient>
  </defs>

  <rect width="1024" height="1024" rx="230" fill="url(#background)"/>
  <g fill="none" stroke="#6FD9B9" stroke-width="42" stroke-linecap="round" opacity="0.72">
    <path d="M323 323 438 438"/>
    <path d="m701 323-115 115"/>
    <path d="m323 701 115-115"/>
    <path d="m701 701-115-115"/>
  </g>

  <rect x="160" y="160" width="220" height="220" rx="66" fill="#F3FAF7"/>
  <rect x="644" y="160" width="220" height="220" rx="66" fill="#B8C8DF"/>
  <rect x="160" y="644" width="220" height="220" rx="66" fill="#9CE0CB"/>
  <rect x="644" y="644" width="220" height="220" rx="66" fill="#F3FAF7"/>

  <rect x="376" y="376" width="272" height="272" rx="86" fill="#FFFFFF"/>
  <circle cx="512" cy="512" r="72" fill="url(#accent)"/>
  <circle cx="512" cy="512" r="27" fill="#11372C"/>
</svg>
'''


def rasterize(svg: str, size: int) -> Image.Image:
    png = cairosvg.svg2png(
        bytestring=svg.encode("utf-8"),
        output_width=size,
        output_height=size,
    )
    return Image.open(BytesIO(png)).convert("RGBA")


def build_icns(svg: str, build_dir: str) -> None:
    iconset = os.path.join(build_dir, "icon.iconset")
    os.makedirs(iconset, exist_ok=True)
    for name, size in ICNS_MAP.items():
        rasterize(svg, size).save(os.path.join(iconset, name))

    iconutil = "/usr/bin/iconutil"
    if not os.path.exists(iconutil):
        print("iconutil not found; left build/icon.iconset for manual conversion.")
        return

    output = os.path.join(build_dir, "icon.icns")
    try:
        subprocess.run(
            [iconutil, "-c", "icns", iconset, "-o", output],
            check=True,
            capture_output=True,
        )
        print("Wrote build/icon.icns")
        for name in ICNS_MAP:
            os.remove(os.path.join(iconset, name))
        os.rmdir(iconset)
    except subprocess.CalledProcessError as exc:  # pragma: no cover
        sys.stderr.write(exc.stderr.decode("utf-8", "replace"))
        raise


def main() -> None:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    build_dir = os.path.join(root, "build")
    icons_dir = os.path.join(build_dir, "icons")
    public_dir = os.path.join(root, "public")
    os.makedirs(icons_dir, exist_ok=True)
    os.makedirs(public_dir, exist_ok=True)

    svg = build_svg()
    for path in (os.path.join(build_dir, "icon.svg"), os.path.join(public_dir, "logo.svg")):
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(svg)

    rendered = {}
    for size in PNG_SIZES:
        image = rasterize(svg, size)
        rendered[size] = image
        image.save(os.path.join(icons_dir, f"{size}x{size}.png"))

    rendered[1024].save(os.path.join(build_dir, "icon-source.png"))
    rendered[512].save(os.path.join(build_dir, "icon.png"))
    rendered[512].save(os.path.join(public_dir, "logo.png"))
    rendered[256].save(
        os.path.join(build_dir, "icon.ico"),
        format="ICO",
        sizes=[(size, size) for size in ICO_SIZES],
    )
    build_icns(svg, build_dir)
    print("All ChatGPT Hub icons generated.")


if __name__ == "__main__":
    main()
