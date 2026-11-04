"""Build the Claude-hosted version (dist/loop-catalog.html) with the back office and cover paste tools."""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
s = (ROOT / "src/app.template.html").read_text().replace("/*__ADMIN__*/", (ROOT / "src/admin.js").read_text())
cat = json.loads((ROOT / "data/catalog.json").read_text())
s = s.replace("__CATALOG__", json.dumps(cat, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/"))
(ROOT / "dist").mkdir(exist_ok=True); (ROOT / "dist/loop-catalog.html").write_text(s)
print("dist/loop-catalog.html", len(s), "bytes")
