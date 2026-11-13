"""生成应用图标:黄底深色"吃"字。一次性脚本。

用法:python -I tools/make_icons.py <项目根目录> [字体文件]
字体需含简体中文,默认用 Windows 自带的微软雅黑粗体。
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

BG, FG = "#FFD84D", "#2b2300"
root = Path(sys.argv[1])
font_path = sys.argv[2] if len(sys.argv) > 2 else "C:/Windows/Fonts/msyhbd.ttc"
out = root / "icons"
out.mkdir(exist_ok=True)


def make(size, glyph_ratio, name):
    img = Image.new("RGB", (size, size), BG)
    font = ImageFont.truetype(font_path, int(size * glyph_ratio))
    d = ImageDraw.Draw(img)
    l, t, r, b = d.textbbox((0, 0), "吃", font=font)
    d.text(((size - (r - l)) / 2 - l, (size - (b - t)) / 2 - t), "吃", font=font, fill=FG)
    img.save(out / name, optimize=True)


make(192, 0.66, "icon-192.png")
make(512, 0.66, "icon-512.png")
make(512, 0.50, "icon-maskable-512.png")  # 可遮罩图标:文字限制在中心安全区内
make(180, 0.66, "apple-touch-icon.png")
print("ok")
