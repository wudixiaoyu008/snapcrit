#!/usr/bin/env python3
"""Generate PNG icons for the SnapCrit extension."""
import struct, zlib

BG    = (24, 24, 27, 255)    # #18181b
WHITE = (255, 255, 255, 255)
BLUE  = (37, 99, 235, 255)

def make_png(size, get_color):
    rows = b''
    for y in range(size):
        rows += b'\x00'  # filter: None
        for x in range(size):
            rows += bytes(get_color(x, y, size))
    compressed = zlib.compress(rows, 9)

    def chunk(name, data):
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return (b'\x89PNG\r\n\x1a\n' +
            chunk(b'IHDR', ihdr) +
            chunk(b'IDAT', compressed) +
            chunk(b'IEND', b''))

def icon_color(x, y, s):
    nx = (x + 0.5) / s
    ny = (y + 0.5) / s

    # Border width scales with size
    bw = 0.13 if s <= 16 else (0.09 if s <= 48 else 0.065)
    # Handle size scales too
    hs = 0.22 if s <= 16 else (0.17 if s <= 48 else 0.13)

    # Outer box bounds (with padding)
    pad = 0.10
    bx1, by1 = pad, pad
    bx2, by2 = 1 - pad, 1 - pad

    color = BG

    # White rounded rectangle outline (element selection box)
    in_outer = bx1 <= nx <= bx2 and by1 <= ny <= by2
    in_inner = (bx1 + bw) <= nx <= (bx2 - bw) and (by1 + bw) <= ny <= (by2 - bw)
    if in_outer and not in_inner:
        color = WHITE

    # Blue corner handles (solid squares at each corner)
    corners = [
        (bx1 - hs / 2, by1 - hs / 2),
        (bx2 - hs / 2, by1 - hs / 2),
        (bx1 - hs / 2, by2 - hs / 2),
        (bx2 - hs / 2, by2 - hs / 2),
    ]
    for hx, hy in corners:
        if hx <= nx <= hx + hs and hy <= ny <= hy + hs:
            color = BLUE

    return color

for size in [16, 32, 48, 128]:
    data = make_png(size, lambda x, y, s=size: icon_color(x, y, s))
    path = f'icons/icon{size}.png'
    with open(path, 'wb') as f:
        f.write(data)
    print(f'Generated {path} ({len(data)} bytes)')
