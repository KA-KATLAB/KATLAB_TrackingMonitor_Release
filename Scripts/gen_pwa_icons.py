"""v0.1.12.0 D2 (B.2): PWA icon generator - stdlib only (zlib + struct),
no PIL, no text. Draws the app mark: a slate-950 (#020617) rounded square
with a teal (#14b8a6) ring - the goal-rings motif. Outputs the two
manifest-pinned PNGs (192 + 512) into Frontend/public/icons/; the PNGs
are COMMITTED (the favicon public/ precedent) and this script stays for
regeneration only.

Run from anywhere:  python Scripts/gen_pwa_icons.py
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = REPO_ROOT / "Frontend" / "public" / "icons"

BG = (0x02, 0x06, 0x17)      # slate-950 - the app body (RV3 hex)
RING = (0x14, 0xB8, 0xA6)    # teal-500 - the goal-rings mark


def _png_chunk (tag: bytes, data: bytes) -> bytes:
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data)))


def _write_png (path: Path, size: int, rgba: bytearray) -> None:
    raw = b"".join(
        b"\x00" + bytes(rgba[y * size * 4:(y + 1) * size * 4])
        for y in range(size))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", zlib.compress(raw, 9))
        + _png_chunk(b"IEND", b""))


def _coverage (dist: float, edge: float) -> float:
    """Sub-pixel alpha: 1 inside, 0 outside, linear over a 1px band."""
    return max(0.0, min(1.0, edge - dist + 0.5))


def _draw_icon (size: int) -> bytearray:
    px = bytearray(size * size * 4)  # transparent canvas
    c = (size - 1) / 2.0
    corner_r = size * 0.18           # rounded-square corner radius
    half = size / 2.0
    ring_r = size * 0.30             # ring centerline radius
    ring_w = size * 0.09             # ring stroke thickness

    for y in range(size):
        for x in range(size):
            # rounded-square coverage: distance to the inset square with
            # circular corners (signed distance, Chebyshev-style)
            dx = abs(x - c) - (half - corner_r - 0.5)
            dy = abs(y - c) - (half - corner_r - 0.5)
            outside = ((dx * dx + dy * dy) ** 0.5 if (dx > 0 and dy > 0)
                       else max(dx, dy))
            a_bg = _coverage(outside, corner_r)
            if a_bg <= 0.0:
                continue
            # ring coverage: |distance from center - ring_r| within width/2
            d = ((x - c) ** 2 + (y - c) ** 2) ** 0.5
            a_ring = _coverage(abs(d - ring_r), ring_w / 2.0)
            r = BG[0] + (RING[0] - BG[0]) * a_ring
            g = BG[1] + (RING[1] - BG[1]) * a_ring
            b = BG[2] + (RING[2] - BG[2]) * a_ring
            i = (y * size + x) * 4
            px[i] = round(r)
            px[i + 1] = round(g)
            px[i + 2] = round(b)
            px[i + 3] = round(255 * a_bg)
    return px


def main () -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        out = OUT_DIR / f"icon-{size}.png"
        _write_png(out, size, _draw_icon(size))
        print(f"wrote {out.relative_to(REPO_ROOT)} ({size}x{size})")


if __name__ == "__main__":
    main()
