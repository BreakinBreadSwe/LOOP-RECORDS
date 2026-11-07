// The catalog as the website shows it: data/catalog.json (built from Discogs by
// scripts/build_catalog.py) plus the covers Gordon pasted in by hand (data/artwork.json,
// release id -> image paths under public/art). The raw catalog stays free of images so the
// Claude-hosted version (scripts/build_claude_app.py), which keeps its own artwork store,
// can keep using it as is.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function withArtwork(catalog, artwork, exists = () => true, colors = {}) {
  const out = JSON.parse(JSON.stringify(catalog));
  for (const r of out.releases) {
    if (colors[String(r.id)]) r.color = colors[String(r.id)];   // strongest colour of the main cover
    const imgs = (artwork[String(r.id)] || []).filter(exists);
    if (imgs.length) r.images = imgs; else delete r.images;
  }
  return out;
}

/** Reads and merges both files. `checkFiles` drops images missing from public/art (build time). */
export function loadSiteCatalog(root, { checkFiles = false } = {}) {
  const catalog = JSON.parse(readFileSync(join(root, "data/catalog.json"), "utf8"));
  const artwork = JSON.parse(readFileSync(join(root, "data/artwork.json"), "utf8"));
  const colorsPath = join(root, "data/cover-colors.json");
  const colors = existsSync(colorsPath) ? JSON.parse(readFileSync(colorsPath, "utf8")) : {};
  return withArtwork(catalog, artwork, checkFiles ? p => existsSync(join(root, "public", p)) : undefined, colors);
}
