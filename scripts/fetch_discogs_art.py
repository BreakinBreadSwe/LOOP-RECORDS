"""Fetch every Discogs image (front, back, labels, inserts) for Loop and Plumphouse releases.

Discogs allows 25 requests a minute without a key, so this waits 2.6 seconds between
requests. Releases in the "related" group (other labels' records) are skipped, and so is
any release Gordon pasted covers for by hand: only releases with no images, or with only
Discogs images, are (re)filled. Files land in public/art/<id>-discogs-<n>.jpg and are listed
in data/artwork.json in Discogs's order (primary image first).

  python3 scripts/fetch_discogs_art.py
"""
import json, os, sys, time, urllib.request
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cat = json.load(open(os.path.join(here, "data", "catalog.json")))
art_path = os.path.join(here, "data", "artwork.json")
art = json.load(open(art_path))
UA = {"User-Agent": "LoopRecordsCatalog/1.0 +https://github.com/BreakinBreadSwe/LOOP-RECORDS"}
PAUSE = 2.6

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read()

def save_art():
    json.dump(dict(sorted(art.items(), key=lambda kv: int(kv[0]))), open(art_path, "w"), indent=1, ensure_ascii=False)

done = imgs = fail = 0
for r in cat["releases"]:
    rid = str(r["id"])
    if r.get("group") == "related":
        continue
    have = art.get(rid, [])
    if any("discogs" not in p for p in have):      # hand-pasted covers: leave alone
        continue
    if len(have) > 1:                               # already fetched in full
        continue
    try:
        meta = json.loads(get(f"https://api.discogs.com/releases/{rid}")); time.sleep(PAUSE)
    except Exception as e:
        print("fail", rid, r["catno"], e, file=sys.stderr); fail += 1; time.sleep(PAUSE); continue
    urls = [i.get("uri") for i in meta.get("images", []) if i.get("uri")]
    names = []
    for n, url in enumerate(urls, 1):
        name = f"art/{rid}-discogs-{n}.jpg"; dest = os.path.join(here, "public", name)
        if not os.path.exists(dest):
            try:
                data = get(url); time.sleep(PAUSE)
                if len(data) < 2000 or data[:2] != b"\xff\xd8":
                    raise ValueError("not a JPEG")
                open(dest, "wb").write(data)
            except Exception as e:
                print("fail", rid, r["catno"], n, e, file=sys.stderr); fail += 1; continue
        names.append(name)
    if names:
        old = os.path.join(here, "public", f"art/{rid}-discogs.jpg")
        if os.path.exists(old): os.remove(old)
        art[rid] = names; save_art(); done += 1; imgs += len(names)
        print(f"{r['catno']} {r['title']}: {len(names)} images", flush=True)
save_art()
print(f"releases filled {done}, images {imgs}, failed {fail}")
