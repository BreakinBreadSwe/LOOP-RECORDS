"""Pick the strongest colour of each release's main cover, for the logo and accents.

Writes data/cover-colors.json: {release id: "#rrggbb"}. Needs Pillow.
  python3 scripts/cover_colors.py
"""
import json, os, colorsys
from PIL import Image
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
art = json.load(open(os.path.join(here, "data", "artwork.json")))
out = {}
for rid, imgs in art.items():
    if not imgs: continue
    im = Image.open(os.path.join(here, "public", imgs[0])).convert("RGB")
    im.thumbnail((160, 160))
    pal = im.quantize(colors=10, method=Image.Quantize.MEDIANCUT)
    counts = sorted(pal.getcolors(), reverse=True)
    rgb = pal.getpalette()
    best, score = None, -1
    total = sum(c for c, _ in counts)
    for c, i in counts:
        r, g, b = rgb[i*3:i*3+3]
        h, l, s = colorsys.rgb_to_hls(r/255, g/255, b/255)
        if l < 0.12 or l > 0.92 or s < 0.25: continue           # skip black, white and greys
        sc = (c / total) ** 0.5 * s * (1 - abs(l - 0.5))
        if sc > score: best, score = (r, g, b), sc
    if best: out[rid] = "#%02x%02x%02x" % best
json.dump(dict(sorted(out.items(), key=lambda kv: int(kv[0]))), open(os.path.join(here, "data", "cover-colors.json"), "w"), indent=1)
print(len(out), "of", len(art), "releases have a colour")
