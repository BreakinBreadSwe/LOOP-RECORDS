"""Fetch the Discogs cover for each Loop and Plumphouse release, one at a time.

Discogs allows 25 requests a minute without a key, so this waits 2.6 seconds between
covers. Releases in the "related" group (other labels' records) are skipped. Covers
Gordon pasted by hand always win: a Discogs cover is only added for a release that has
no pasted image yet.

  python3 scripts/fetch_discogs_art.py          download into public/art/<id>-discogs.jpg
                                               and list them in data/artwork.json
"""
import json, os, sys, time, urllib.request
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cat = json.load(open(os.path.join(here, "data", "catalog.json")))
art_path = os.path.join(here, "data", "artwork.json")
art = json.load(open(art_path))
ok = fail = skipped = 0
for r in cat["releases"]:
    rid = str(r["id"])
    url = r.get("discogsImage")
    if r.get("group") == "related" or not url:
        continue
    if art.get(rid):            # already has pasted (or fetched) covers
        skipped += 1
        continue
    name = f"art/{rid}-discogs.jpg"
    dest = os.path.join(here, "public", name)
    if not os.path.exists(dest):
        req = urllib.request.Request(url, headers={"User-Agent": "LoopRecordsCatalog/1.0 +https://github.com/BreakinBreadSwe/LOOP-RECORDS"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
            if len(data) < 2000 or data[:2] != b"\xff\xd8":
                raise ValueError("not a JPEG cover")
            open(dest, "wb").write(data)
        except Exception as e:
            print("fail", rid, r["catno"], e, file=sys.stderr); fail += 1
            time.sleep(2.6); continue
        time.sleep(2.6)
    art[rid] = [name]; ok += 1
    print("cover", r["catno"], r["title"], flush=True)
json.dump(dict(sorted(art.items(), key=lambda kv: int(kv[0]))), open(art_path, "w"), indent=1, ensure_ascii=False)
print(f"added {ok}, already had covers {skipped}, failed {fail}")
