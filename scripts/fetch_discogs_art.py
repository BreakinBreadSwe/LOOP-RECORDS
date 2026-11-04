"""Download the real Discogs cover for every release into data/discogs-art/<id>.jpg.
Run once Discogs is reachable: python3 scripts/fetch_discogs_art.py
Saves into data/discogs-art/<release id>.jpg (not committed; covers pasted by hand live in public/art).
"""
import json, os, sys, time, urllib.request
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cat = json.load(open(os.path.join(here, "data", "catalog.json")))
out = os.path.join(here, "data", "discogs-art"); os.makedirs(out, exist_ok=True)
ok = fail = 0
for r in cat["releases"]:
    url = r.get("discogsImage")
    dest = os.path.join(out, f"{r['id']}.jpg")
    if not url or os.path.exists(dest):
        continue
    req = urllib.request.Request(url, headers={"User-Agent": "LoopRecordsCatalog/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
        if len(data) < 2000:
            raise ValueError("too small")
        open(dest, "wb").write(data); ok += 1
    except Exception as e:
        print("fail", r["id"], r["catno"], e, file=sys.stderr); fail += 1
    time.sleep(1.1)
print(f"downloaded {ok}, failed {fail}")
