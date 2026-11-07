// Builds the website into public/:
//   src/app.template.html + data/catalog.json + src/admin.js  ->  public/index.html
//   src/runtime.js -> public/runtime.js, data/catalog.json -> public/catalog.json
// public/art/ (sleeve scans) is committed as is.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSiteCatalog } from "../lib/catalog.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(join(root, p), "utf8");
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";

const template = read("src/app.template.html");
const catalog = loadSiteCatalog(root, { checkFiles: true });
const admin = read("src/admin.js");

for (const marker of ["__CATALOG__", "/*__ADMIN__*/"]) {
  if (!template.includes(marker)) throw new Error(`template is missing ${marker}`);
}
// Inline JSON inside <script>: keep "</script" and U+2028/9 from breaking out.
const json = JSON.stringify(catalog).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, c => "\\u" + c.charCodeAt(0).toString(16));

const head = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta property="og:title" content="Loop Records">
<meta property="og:description" content="Loop Records, Stockholm 1993 to 1998. Every release, every credit, every video.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='30' fill='%23ff4400'/%3E%3Ccircle cx='32' cy='32' r='13' fill='%231f16b2'/%3E%3Ccircle cx='32' cy='32' r='3' fill='%23fff'/%3E%3C/svg%3E">
<script>window.__STANDALONE__=true;</script>
<script src="/api/config"></script>
<script src="${SUPABASE_JS}" crossorigin="anonymous"></script>
<script src="/runtime.js"></script>
`;

const page = template
  .replace("<title>Loop Records Catalog</title>", "<title>Loop Records</title>")
  .replace('<span id="vidNote">Videos link out to YouTube.</span>', "Videos play from YouTube.");
const html = head + page
  .replace("__CATALOG__", () => json)
  .replace("/*__ADMIN__*/", () => admin);

mkdirSync(join(root, "public"), { recursive: true });
writeFileSync(join(root, "public/index.html"), html);
copyFileSync(join(root, "src/runtime.js"), join(root, "public/runtime.js"));
writeFileSync(join(root, "public/catalog.json"), JSON.stringify(catalog, null, 1));
console.log(`Built public/index.html (${(html.length / 1024).toFixed(0)} KB, ${catalog.releases.length} releases, ${catalog.people.length} people, ${catalog.releases.filter(r => r.images).length} with covers)`);
