// Builds the website into public/:
//   src/app.template.html + data/catalog.json + src/admin.js  ->  public/index.html
//   src/runtime.js -> public/runtime.js, data/catalog.json -> public/catalog.json
// public/art/ (sleeve scans) is committed as is.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(join(root, p), "utf8");
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";

const template = read("src/app.template.html");
const catalog = JSON.parse(read("data/catalog.json"));
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
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='15' fill='%23ff4400'/%3E%3Ccircle cx='16' cy='16' r='4' fill='%2312141a'/%3E%3C/svg%3E">
<script>window.__STANDALONE__=true;</script>
<script src="/api/config"></script>
<script src="${SUPABASE_JS}" crossorigin="anonymous"></script>
<script src="/runtime.js"></script>
`;

const html = head + template
  .replace("__CATALOG__", () => json)
  .replace("/*__ADMIN__*/", () => admin);

mkdirSync(join(root, "public"), { recursive: true });
writeFileSync(join(root, "public/index.html"), html);
copyFileSync(join(root, "src/runtime.js"), join(root, "public/runtime.js"));
copyFileSync(join(root, "data/catalog.json"), join(root, "public/catalog.json"));
console.log(`Built public/index.html (${(html.length / 1024).toFixed(0)} KB, ${catalog.releases.length} releases, ${catalog.people.length} people)`);
