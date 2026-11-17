import sys, glob
from PIL import Image, ImageChops, ImageDraw
d, out = sys.argv[1], sys.argv[2]
fs = sorted(glob.glob(d + "/*.jpg"))
ims = [Image.open(f).convert("L").resize((160, 103)) for f in fs]
moving = [i for i in range(1, len(ims)) if sum(ImageChops.difference(ims[i], ims[i-1]).histogram()[30:]) > 40]
lo, hi = max(0, moving[0] - 2), min(len(fs), moving[-1] + 3)
pick = list(range(lo, hi))[:60]
w = 320; h = int(w * Image.open(fs[0]).height / Image.open(fs[0]).width)
cols = 6; rows = (len(pick) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w, rows * (h + 14)), "white")
for k, i in enumerate(pick):
    im = Image.open(fs[i]).resize((w, h)); x, y = (k % cols) * w, (k // cols) * (h + 14)
    sheet.paste(im, (x, y + 14)); ImageDraw.Draw(sheet).text((x + 4, y), f"{i+1}{' moving' if i in moving else ''}", fill="black")
sheet.save(out); print(len(fs), "frames", "moving", len(moving), "sheet", lo, hi)
