"""生成居中白色对勾 + 青底圆角方框图标（多尺寸独立优化）"""
from PIL import Image, ImageDraw
import struct, os

def draw_check(img_size, line_w):
    """画对勾图标，line_w 控制线条粗细（每个尺寸独立优化）"""
    img = Image.new('RGBA', (img_size, img_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # 圆角背景
    r = max(2, img_size // 6)
    draw.rounded_rectangle([(1, 1), (img_size-2, img_size-2)], radius=r, fill=(0x0f, 0x76, 0x6e))
    # 对勾（按比例缩放坐标）
    s = img_size
    p1 = (int(0.31*s), int(0.48*s))   # 左上起笔
    p2 = (int(0.43*s), int(0.66*s))   # 折点底部
    p3 = (int(0.69*s), int(0.34*s))   # 右上收笔
    draw.line([p1, p2, p3], fill=(255, 255, 255), width=line_w, joint='curve')
    # 端点画圆防止截断
    hw = line_w // 2
    for pt in [p1, p2, p3]:
        draw.ellipse([pt[0]-hw, pt[1]-hw, pt[0]+hw, pt[1]+hw], fill=(255, 255, 255))
    return img

# 每个尺寸独立优化线条粗细（小尺寸更粗，避免缩放后细节丢失）
configs = [
    (16,  4),
    (32,  6),
    (48,  7),
    (64,  9),
    (128, 13),
    (256, 20),
]

sizes = [c[0] for c in configs]
frames = [draw_check(s, lw) for s, lw in configs]

# 生成纯 BMP 格式 ICO（rcedit 兼容）
ico_header = b'\x00\x00\x01\x00' + struct.pack('<H', len(frames))
dir_entries = b''
all_data = b''
data_offset = 6 + len(frames) * 16

for s, frame in zip(sizes, frames):
    bgra = bytearray()
    for y in range(s-1, -1, -1):
        for x in range(s):
            r_, g_, b_, a_ = frame.getpixel((x, y))
            bgra += bytes([b_, g_, r_, a_])
        bgra += b'\x00' * ((4 - (s*4) % 4) % 4)
    bih = struct.pack('<IiiHHIIiiII', 40, s, s, 1, 32, 0, len(bgra), 0, 0, 0, 0)
    frame_bytes = bih + bgra
    wb = s if s < 256 else 0
    dir_entries += struct.pack('<BBBBHHII', wb, wb, 0, 0, 1, 32, len(frame_bytes), data_offset)
    all_data += frame_bytes
    data_offset += len(frame_bytes)

ico = ico_header + dir_entries + all_data
out = os.path.join(os.path.dirname(__file__), 'icon.ico')
with open(out, 'wb') as f:
    f.write(ico)
print('icon written: %d bytes -> %s' % (len(ico), out))
