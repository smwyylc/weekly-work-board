import struct

W = H = 256
bg = (0x33, 0x70, 0xFF)   # #3370ff 主色
card = (0xFF, 0xFF, 0xFF) # 白色卡片
bar = (0xC8, 0xD3, 0xE8)  # 浅蓝灰任务条

def rounded_rect(x0, y0, x1, y1, r):
    def inside(px, py):
        if px < x0 or px > x1 or py < y0 or py > y1:
            return False
        cx = x0 + r if px < x0 + r else (x1 - r if px > x1 - r else px)
        cy = y0 + r if py < y0 + r else (y1 - r if py > y1 - r else py)
        return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
    return inside

rr = rounded_rect(46, 46, 210, 210, 30)

pixels = [[bg for _ in range(W)] for _ in range(H)]
for y in range(H):
    for x in range(W):
        if rr(x, y):
            pixels[y][x] = card

# 卡片内三条任务条
for (bx0, by0, bx1, by1) in [(80, 95, 176, 109), (80, 125, 150, 139), (80, 155, 168, 169)]:
    for y in range(by0, by1):
        for x in range(bx0, bx1):
            if rr(x, y):
                pixels[y][x] = bar

# 自底向上写入 BGRA
bmp = bytearray()
for y in range(H - 1, -1, -1):
    for x in range(W):
        r, g, b = pixels[y][x]
        bmp += bytes([b, g, r, 0])
    bmp += b'\x00' * ((4 - (W * 4) % 4) % 4)

bih = struct.pack('<IiiHHIIiiII', 40, W, H, 1, 32, 0, len(bmp), 0, 0, 0, 0)

ico = b'\x00\x00' + b'\x01\x00' + b'\x01\x00'
ico += bytes([0, 0]) + b'\x00' + b'\x00'
ico += struct.pack('<H', 1) + struct.pack('<H', 32)
ico += struct.pack('<I', len(bih) + len(bmp))
ico += struct.pack('<I', 6 + 16)
ico += bih + bmp

out = 'assets/icon.ico'
with open(out, 'wb') as f:
    f.write(ico)
print('icon written:', len(ico), 'bytes ->', out)
