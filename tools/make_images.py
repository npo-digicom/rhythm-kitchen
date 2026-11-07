# -*- coding: utf-8 -*-
"""
images/original/ の大きな PNG から、ゲームで使う軽い画像(WebP)を作ります。
  使い方(リズムキッチンのフォルダで):  python3 tools/make_images.py
  ・まわりの透明な余白を切り落とし、用途に合わせた大きさに縮めます
  ・できた画像は images/ に「同じ名前.webp」で保存されます
  ・Pillow が必要です(pip3 install pillow)
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'images' / 'original'
DST = ROOT / 'images'

# 名前の始まり → いちばん長い辺のピクセル数
SIZES = {
    'petros_': 480, 'amones_': 400,
    'dish_': 640, 'vessel_': 640,
    'ing_': 288,
}

def size_for(name):
    for k, v in SIZES.items():
        if name.startswith(k):
            return v
    return 480

def main():
    for src in sorted(SRC.glob('*.png')):
        im = Image.open(src).convert('RGBA')
        box = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
        if box:
            pad = 6
            box = (max(0, box[0] - pad), max(0, box[1] - pad),
                   min(im.width, box[2] + pad), min(im.height, box[3] + pad))
            im = im.crop(box)
        im.thumbnail((size_for(src.stem),) * 2, Image.LANCZOS)
        out = DST / (src.stem + '.webp')
        im.save(out, 'WEBP', quality=84, method=6)
        print(f'{src.name:28s} → {out.name:28s} {im.width}x{im.height} {out.stat().st_size // 1024}KB')

    bg = ROOT / 'images' / 'background.jpg'
    if bg.exists():
        im = Image.open(bg).convert('RGB')
        im.save(bg, 'JPEG', quality=80, optimize=True, progressive=True)
        print('background.jpg', im.size, bg.stat().st_size // 1024, 'KB')

if __name__ == '__main__':
    main()
