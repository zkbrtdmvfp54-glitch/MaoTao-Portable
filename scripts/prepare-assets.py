"""Prepare local source-derived PNG layers. Requires Pillow 13.0.0."""
from collections import deque
from io import BytesIO
from pathlib import Path
import struct

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1] / "assets/pet"
SOURCE = ROOT / "reference"
OUT = ROOT / "processed"
OUT.mkdir(exist_ok=True)
LOGO = SOURCE / "maotao-shortcut-logo.png"

cat = Image.open(SOURCE / "小猫形象.png").convert("RGBA")
# Reject the near-invisible noise outside the original transparent artwork.
cat.putalpha(cat.getchannel("A").point(lambda value: 0 if value < 20 else min(255, round((value - 20) * 255 / 234))))

# The fallback uses the same simple silhouette language as the live model. Its body and tail
# are separate transparent vectors so the canvas can tint the coat and swing the tail.
(OUT / "cat.svg").write_text('''<svg xmlns="http://www.w3.org/2000/svg" width="220" height="230" viewBox="0 0 220 230">
<path fill="#111114" d="M66 229c-9 0-14-7-13-18l4-37c1-18 7-34 16-45-17-8-27-21-27-39 0-13 5-24 14-31l2-47c0-6 5-8 9-3l18 25c12-4 29-4 42 0l18-25c4-5 9-3 9 3l2 47c13 7 20 19 20 35 0 17-8 30-22 39 10 16 14 35 13 57l-2 23c-1 10-6 16-15 16h-7c-9 0-14-6-14-16v-34c0-9-3-13-7-13s-7 5-7 14v34c0 10-5 15-14 15h-7c-9 0-14-6-14-16v-34c0-9-3-13-7-13s-7 5-7 14v34c0 10-5 16-14 16z"/>
<path d="M84 142c-3 18-4 37-3 69M136 142c3 18 4 37 3 69" fill="none" stroke="#343339" stroke-width="1.7" stroke-linecap="round"/>
</svg>''', encoding="utf-8")
(OUT / "tail.svg").write_text('''<svg xmlns="http://www.w3.org/2000/svg" width="100" height="160" viewBox="0 0 100 160">
<path d="M4 122c23 0 31 9 46 8 15-1 22-12 27-30 5-18 14-26 14-43 0-18-10-30-27-30-14 0-23 7-23 18" fill="none" stroke="#111114" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
</svg>''', encoding="utf-8")

def draw_logo(size):
    source = Image.open(LOGO).convert("RGBA")
    # The submitted logo is already transparent. Crop only empty alpha margins;
    # luminance cropping would erase its black eye fills and mouth details.
    visible = source.getchannel("A").point(lambda value: 255 if value > 8 else 0)
    bounds = visible.getbbox()
    if bounds is None:
        raise ValueError(f"The shortcut logo has no visible marks: {LOGO}")
    face = source.crop(bounds)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    width = max(1, round(size * 0.88))
    height = max(1, round(width * face.height / face.width))
    face = face.resize((width, height), Image.Resampling.LANCZOS)
    canvas.alpha_composite(face, ((size - width) // 2, (size - height) // 2))
    return canvas

draw_logo(32).save(OUT / "tray.png")
draw_logo(256).save(OUT / "app.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
draw_logo(512).save(OUT / "linux.png")

# Build a standards-compliant ICNS container from lossless PNG representations of the
# supplied transparent mark. macOS uses these native-size slots for Finder and Dock icons.
icns_slots = [("icp4", 16), ("icp5", 32), ("icp6", 64), ("ic07", 128),
              ("ic08", 256), ("ic09", 512), ("ic10", 1024)]
chunks = []
for code, size in icns_slots:
    png = BytesIO()
    draw_logo(size).save(png, format="PNG", optimize=True)
    payload = png.getvalue()
    chunks.append(code.encode("ascii") + struct.pack(">I", len(payload) + 8) + payload)
icns_payload = b"".join(chunks)
(OUT / "app.icns").write_bytes(b"icns" + struct.pack(">I", len(icns_payload) + 8) + icns_payload)

paws = [
    ("left", (600, 809, 725, 952), [(603,893),(609,877),(624,859),(641,846),(665,845),
      (689,852),(707,864),(722,883),(724,909),(717,931),(699,943),(669,949),(645,944),(622,933),(604,916)]),
    ("right", (705, 810, 834, 952), [(705,901),(710,876),(729,856),(748,848),(773,845),
      (796,850),(816,864),(831,885),(831,909),(819,934),(799,945),(768,950),(741,946),(719,932)])
]
for side, rect, points in paws:
    img = cat.crop(rect)
    left, top = rect[:2]
    mask = Image.new("L", img.size)
    ImageDraw.Draw(mask).polygon([(x-left, y-top) for x,y in points], fill=255)
    alpha = img.getchannel("A")
    from PIL import ImageChops
    img.putalpha(ImageChops.multiply(alpha, mask.filter(ImageFilter.GaussianBlur(1.4))))
    img.save(OUT / f"paw-{side}.png")

keyboard = Image.open(SOURCE / "键盘.png").convert("RGBA")
keyboard = keyboard.crop((78, 96, 2094, 660)).transpose(Image.Transpose.ROTATE_180)
keyboard.thumbnail((1100, 400), Image.Resampling.LANCZOS)
keyboard.save(OUT / "keyboard.png")

mouse = Image.open(SOURCE / "鼠标.png").convert("RGB")
mouse = mouse.crop((124, 213, 1134, 1020))
w, h = mouse.size
pixels = mouse.load()
seen = bytearray(w * h)
queue = deque([0])
seen[0] = 1
while queue:
    index = queue.popleft()
    x, y = index % w, index // w
    for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
        if not (0 <= nx < w and 0 <= ny < h):
            continue
        n = ny * w + nx
        if seen[n]:
            continue
        r, g, b = pixels[nx, ny]
        if abs(r-b) > 12 or abs(g-b) > 10:
            continue
        seen[n] = 1
        queue.append(n)
mask = Image.frombytes("L", mouse.size, bytes(0 if value else 255 for value in seen))
mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.15))
mouse.putalpha(mask)
mouse = mouse.crop(mask.point(lambda value: 255 if value > 18 else 0).getbbox())
mouse.thumbnail((440, 380), Image.Resampling.LANCZOS)
mouse.save(OUT / "mouse.png")
print("Prepared the shared no-mouth vector fallback, two paw cutouts, keyboard, mouse and supplied transparent shortcut logo for Windows, macOS and Linux.")

