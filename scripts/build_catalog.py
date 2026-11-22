"""Rebuild data/catalog.json from the raw Discogs release data and the YouTube search results."""
import json, re, sys, os, collections
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
D = str(ROOT / "data") + "/"
rels = []
for b in "ABCDE":
    rels += json.load(open(D + f"discogs/batch{b}.json"))
yt = json.load(open(D + "youtube.json"))

VARIANTS = {197959:[6511091],114655:[8544887],94086:[8544919],136825:[4498882],88404:[17973520],
 38211:[20928688],90406:[26569853],204200:[1631346],111345:[1696723],38304:[3544498],9004:[27429405],
 151462:[11217641],136830:[1592017],87426:[4611895],82698:[4611902],19433:[5888595],79824:[4649118],
 66272:[4611857],99220:[1240523],38238:[10269938],30410:[1426310],25239:[8176125],151460:[1925629],
 2430:[5797475],176252:[11385755],
 190584:[7622183],34448:[10342682],52126:[1742080],190582:[1742067],65343:[1742051],57596:[5724645],
 192062:[21114976],17596:[25861582],37222:[6549798],190577:[5797416],190587:[15971322],57273:[5711700],
 144692:[14382526],190581:[14981497],470207:[2862946],22119:[4611888],38673:[7205160],57277:[29061169],
 15539:[5918174],101063:[27429552],57451:[2187653],231247:[3228230],963:[4611941],28939:[17973112],107032:[6165315],176309:[20413891],161657:[27429336],87431:[11958949]}
RELATED = {33782,259370,430576,20356129,24031382,1659620}

def clean(n):
    n = (n or "").strip()
    n = re.sub(r"\s*\(\d+\)$", "", n)
    return n.rstrip("*").strip()

def vid(u):
    m = re.search(r"(?:v=|youtu\.be/)([\w-]{11})", u or "")
    return m.group(1) if m else None

def role_clean(r):
    return re.sub(r"\s+", " ", (r or "")).strip()

people = {}
def person(name, pid):
    name = clean(name)
    if not name: return None
    key = f"d{pid}" if pid else "n-" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    p = people.setdefault(key, {"key": key, "discogsId": pid, "name": name, "aliases": set(), "credits": [], "videos": {}})
    if name != p["name"]: p["aliases"].add(name)
    return p

out = []
for r in rels:
    if r.get("error"): continue
    rid = r["id"]
    labels = r.get("labels") or []
    catnos = [l.get("catno") for l in labels if l.get("catno")]
    lab = next((l for l in labels if re.match(r"(?i)loop|plump", l.get("name",""))), labels[0] if labels else {})
    cat = next((c for c in catnos if re.match(r"(?i)(loop|plump)", c)), catnos[0] if catnos else "")
    group = "related" if rid in RELATED else ("plump" if re.match(r"(?i)plump", lab.get("name","")+cat) and "loop" not in cat.lower() else "loop")
    if rid in (42643,47295,194084,184246,107032,176309,237229,176252,161657): group = "plump"
    rel = {"id": rid, "catno": cat, "catnos": catnos, "group": group,
           "title": r.get("title"), "artists": [], "year": r.get("year") or None,
           "released": r.get("released"), "country": r.get("country"), "format": r.get("formats"),
           "labels": [{"name": clean(l.get("name")), "catno": l.get("catno")} for l in labels],
           "genres": r.get("genres") or [], "styles": r.get("styles") or [],
           "discogsImage": r.get("image"), "variants": VARIANTS.get(rid, []),
           "discogs": f"https://www.discogs.com/release/{rid}",
           "tracks": [], "credits": [], "videos": []}
    pass
    for a in r.get("artists") or []:
        p = person(a.get("name"), a.get("id"))
        if p:
            rel["artists"].append({"name": p["name"], "key": p["key"]})
            p["credits"].append({"release": rid, "role": "Main artist", "track": None})
    for c in r.get("credits") or []:
        p = person(c.get("name"), c.get("id"))
        if p:
            rel["credits"].append({"name": p["name"], "key": p["key"], "role": role_clean(c.get("role"))})
            p["credits"].append({"release": rid, "role": role_clean(c.get("role")), "track": None})
    for t in r.get("tracklist") or []:
        tr = {"pos": t.get("position"), "title": t.get("title"), "dur": t.get("duration") or "", "artists": [], "credits": []}
        for a in t.get("artists") or []:
            p = person(a.get("name"), a.get("id"))
            if p:
                tr["artists"].append({"name": p["name"], "key": p["key"]})
                p["credits"].append({"release": rid, "role": "Track artist", "track": tr["pos"]})
        for c in t.get("credits") or []:
            p = person(c.get("name"), c.get("id"))
            if p:
                tr["credits"].append({"name": p["name"], "key": p["key"], "role": role_clean(c.get("role"))})
                p["credits"].append({"release": rid, "role": role_clean(c.get("role")), "track": tr["pos"]})
        rel["tracks"].append(tr)
    seen = set()
    for v in r.get("videos") or []:
        i = vid(v.get("uri"))
        if i and i not in seen:
            seen.add(i); rel["videos"].append({"id": i, "title": v.get("title") or "", "source": "Discogs"})
    out.append(rel)

# YouTube search results
def norm(s): return re.sub(r"[^a-z0-9]", "", (s or "").lower())
for y in yt:
    i = vid(y.get("url"))
    if not i: continue
    v = {"id": i, "title": y.get("title") or "", "source": "YouTube search"}
    if y.get("release"):
        for rel in out:
            if norm(rel["title"]) == norm(y["release"]) or norm(y["release"]) in norm(rel["title"]):
                if i not in {x["id"] for x in rel["videos"]}: rel["videos"].append(v)
                break
    for part in re.split(r"\s*(?:&|vs\.?|Vs\.?|,|/)\s*", y.get("artist") or ""):
        for p in people.values():
            if norm(p["name"]) and (norm(p["name"]) == norm(part) or norm(part) in {norm(a) for a in p["aliases"]}):
                p["videos"][i] = v

# release videos flow to main artists
for rel in out:
    for a in rel["artists"]:
        for v in rel["videos"]:
            people[a["key"]]["videos"].setdefault(v["id"], {**v, "release": rel["id"]})

def sortkey(r):
    g = {"loop":0,"plump":1,"related":2}[r["group"]]
    m = re.search(r"(\d+)", r["catno"] or "")
    n = int(m.group(1)) if m and re.match(r"(?i)(loop|plump)", r["catno"] or "") else 9000 + (r["year"] or 0)
    if r["id"] == 2264437: n = 0
    return (g, n, r["catno"] or "")
out.sort(key=sortkey)

plist = []
for p in people.values():
    rset = sorted({c["release"] for c in p["credits"]})
    plist.append({"key": p["key"], "discogsId": p["discogsId"], "name": p["name"],
                  "aliases": sorted(p["aliases"]), "credits": p["credits"], "releases": rset,
                  "videos": list(p["videos"].values()),
                  "discogs": f"https://www.discogs.com/artist/{p['discogsId']}" if p["discogsId"] else None})
plist.sort(key=lambda p: p["name"].lower())

catalog = {
  "schema": "loop-records.catalog/v0",
  "label": {"name": "Loop Records", "discogsId": 179847, "city": "Stockholm", "country": "Sweden",
            "founded": 1993, "founders": ["Joachim Hövel", "Vito Ingrosso"],
            "sublabels": ["Plumphouse Records", "Loop Music", "Wrong Steps Records"],
            "discogs": "https://www.discogs.com/label/179847-Loop-Records-4"},
  "source": "Discogs API, retrieved 2026-11-03 (Plumphouse PLUMP 006 to 032 added 2026-11-09)",
  "releases": out, "people": plist}
json.dump(catalog, open(D + "catalog.json", "w"), ensure_ascii=False, indent=1)
print(len(out), "releases,", len(plist), "people,",
      sum(len(r["videos"]) for r in out), "release videos,",
      sum(1 for p in plist if p["videos"]), "people with videos")
print(collections.Counter(r["group"] for r in out))
print([ (r["catno"], r["title"]) for r in out][:6])
