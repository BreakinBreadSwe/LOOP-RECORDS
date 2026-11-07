"""Build the Claude-hosted version (dist/loop-catalog.html) with the back office and cover paste tools."""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
s = (ROOT / "src/app.template.html").read_text().replace("/*__ADMIN__*/", (ROOT / "src/admin.js").read_text())
cat = json.loads((ROOT / "data/catalog.json").read_text())
s = s.replace("__CATALOG__", json.dumps(cat, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/"))
import base64
for key, name in (("__LOGO_SPIRAL__", "loop-spiral.svg"), ("__LOGO_WORD__", "loop-wordmark.svg")):
    s = s.replace(key, "data:image/svg+xml;base64," + base64.b64encode((ROOT / "public/brand" / name).read_bytes()).decode())
(ROOT / "dist").mkdir(exist_ok=True); (ROOT / "dist/loop-catalog.html").write_text(s)
print("dist/loop-catalog.html", len(s), "bytes")
