"""从 icon-source.png 生成应用图标 icon.ico（多尺寸）

处理流程：
1. 按连通域去掉与图像边缘相连的白色背景（保留内部白色图形，如对勾/W 字样），
   并对背景边缘做距离羽化，避免缩放后出现硬白边；
2. 以内容中心裁剪为正方形；
3. 生成 16/24/32/48/64/128/256 多尺寸 ICO（BMP 编码帧，rcedit / electron-builder 兼容）。

用法：python assets/gen_icon.py
源图：assets/icon-source.png  →  输出：assets/icon.ico
"""
from PIL import Image
from collections import deque
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'icon-source.png')
OUT = os.path.join(HERE, 'icon.ico')
SIZES = [16, 24, 32, 48, 64, 128, 256]

# 白色判定阈值（浅蓝底色 b 通道接近 255，须同时要求 r/g 足够高）
WHITE_TH = 230


def remove_white_bg(img):
    """把与图像边缘相连的白色背景变为透明，保留内部白色图形；边缘做羽化过渡。"""
    w, h = img.size
    px = img.load()

    def is_white(x, y):
        r, g, b, a = px[x, y]
        return r > WHITE_TH and g > WHITE_TH and b > WHITE_TH and a > 128

    # BFS：从四条边向内，标记与边缘连通的白色区域为背景
    bg = [[False] * h for _ in range(w)]
    visited = [[False] * h for _ in range(w)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_white(x, y) and not visited[x][y]:
                visited[x][y] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_white(x, y) and not visited[x][y]:
                visited[x][y] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        bg[x][y] = True
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny] and is_white(nx, ny):
                visited[nx][ny] = True
                q.append((nx, ny))

    # 距离变换：背景像素到图形（非背景）的 4 连通距离，用于羽化
    dist = [[-1] * h for _ in range(w)]
    dq = deque()
    for x in range(w):
        for y in range(h):
            if bg[x][y]:
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1),
                               (x + 1, y + 1), (x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not bg[nx][ny]:
                        dist[x][y] = 0
                        dq.append((x, y))
                        break
    while dq:
        x, y = dq.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and bg[nx][ny] and dist[nx][ny] < 0:
                dist[nx][ny] = dist[x][y] + 1
                dq.append((nx, ny))

    out = img.copy()
    po = out.load()
    for x in range(w):
        for y in range(h):
            if bg[x][y]:
                d = dist[x][y]
                if d < 0 or d > 2:
                    alpha = 0      # 背景深处：全透明
                elif d == 2:
                    alpha = 90
                elif d == 1:
                    alpha = 150
                else:
                    alpha = 220
                r, g, b, a = po[x, y]
                po[x, y] = (r, g, b, alpha)
    return out


def to_square(img):
    """以内容中心裁剪为正方形（取较短边）。"""
    w, h = img.size
    side = min(w, h)
    px = img.load()
    # 找内容边界（alpha > 32）
    xs, ys = [], []
    for x in range(w):
        for y in range(h):
            if px[x, y][3] > 32:
                xs.append(x)
                ys.append(y)
    if not xs:
        raise ValueError('源图内容为空（全部透明）')
    cw, ch = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
    # 以内容中心为基准取正方形
    cx, cy = (min(xs) + max(xs)) // 2, (min(ys) + max(ys)) // 2
    half = side // 2
    left, top = cx - half, cy - half
    left = max(0, min(left, w - side))
    top = max(0, min(top, h - side))
    return img.crop((left, top, left + side, top + side))


def save_ico(img, out, sizes):
    """全 PNG 帧 ICO（bWidth/bHeight 按规范写入）。

    为什么不用 BMP 帧：ICO 中 BMP 帧的 BITMAPINFOHEADER.biHeight 按规范应为
    图标高度的 2 倍（XOR+AND mask 合并高度），Windows 读取时按 2×高度解析；
    若写单倍高度（如 biHeight=32），Windows 渲染会错乱（图标只显示一半/拼接）。
    此外 rcedit 内部用 16 位整数存帧字节数，128×128 以上 BMP 帧（>65536 字节）
    会溢出截断，损坏 GROUP_ICON 资源。PNG 帧无 biHeight 字段（尺寸在 PNG 头
    内自描述），压缩后字节数也远小于 65536，两种坑都能避开。PNG 帧为
    Windows Vista+ 标准（256 帧本来就必须用 PNG），electron-builder 自身
    转换图标时大尺寸帧同样是 PNG。
    """
    import struct
    import io
    frames = []  # (size, data_bytes)
    for s in sizes:
        f = img.resize((s, s), Image.LANCZOS)
        buf = io.BytesIO()
        f.save(buf, format='PNG')
        frames.append((s, buf.getvalue()))

    ico_header = b'\x00\x00\x01\x00' + struct.pack('<H', len(frames))
    dir_entries = b''
    all_data = b''
    data_offset = 6 + len(frames) * 16

    for s, frame_bytes in frames:
        wb = 0 if s == 256 else s
        dir_entries += struct.pack('<BBBBHHII', wb, wb, 0, 0, 0, 32, len(frame_bytes), data_offset)
        all_data += frame_bytes
        data_offset += len(frame_bytes)

    ico = ico_header + dir_entries + all_data
    with open(out, 'wb') as f:
        f.write(ico)


def main():
    img = Image.open(SRC).convert('RGBA')
    img = remove_white_bg(img)
    img = to_square(img)
    save_ico(img, OUT, SIZES)
    print('icon written: %d bytes -> %s (%s)' % (
        os.path.getsize(OUT), OUT, 'x'.join(str(s) for s in SIZES)))


if __name__ == '__main__':
    main()
