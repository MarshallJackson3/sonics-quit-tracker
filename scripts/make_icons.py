"""Draw the app icon (a gold basketball on Sonics green) as PNG files, using only built-in Python.

Run: python3 scripts/make_icons.py
"""
import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = (0, 101, 58)
GOLD = (255, 199, 44)
SEAM = (11, 42, 32)


def color_at(x, y):
    # x, y run from -1 to 1 across the icon.
    r = math.hypot(x, y)
    if r > 0.72:
        return BG
    w = 0.035
    seams = (
        abs(x) < w,
        abs(y) < w,
        abs(math.hypot(x - 1.0, y) - 0.62) < w,
        abs(math.hypot(x + 1.0, y) - 0.62) < w,
    )
    if any(seams) or r > 0.72 - w * 1.5:
        return SEAM
    return GOLD


def png(size, path):
    ss = 3  # samples per pixel side, for smooth edges
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    x = ((px + (sx + 0.5) / ss) / size) * 2 - 1
                    y = ((py + (sy + 0.5) / ss) / size) * 2 - 1
                    c = color_at(x, y)
                    for i in range(3):
                        acc[i] += c[i]
            row += bytes(round(a / ss / ss) for a in acc)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    out = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(out)


for s in (180, 512):
    png(s, os.path.join(ROOT, "app", f"icon-{s}.png"))
print("Wrote app/icon-180.png and app/icon-512.png")
