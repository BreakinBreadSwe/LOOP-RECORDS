// POST /api/breakin-bread/push   { dryRun?: boolean }
// Authorization: Bearer <Supabase access token of a staff user>
//
// Reads the full catalog and every back-office record, builds the Breakin Bread bundle
// (lib/bundle.js) and sends it to Breakin Bread's label import endpoint. Each attempt is
// written to partner_sync_log and to app_docs settings/breakinbread for the back office.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREAKINBREAD_IMPORT_URL,
//      BREAKINBREAD_IMPORT_SECRET, PUBLIC_SITE_URL (optional; used for absolute artwork URLs).
import { buildBundle, groupDocs } from "../../lib/bundle.js";
import { adminClient, staffUser, loadDocs, loadCatalog, siteUrlOf, readJson } from "../../lib/server.js";

export const config = { maxDuration: 60 };

async function record(sb, user, status, counts, extra = {}) {
  const at = new Date().toISOString();
  await sb.from("app_docs").upsert({ collection: "settings", id: "breakinbread", data: { lastStatus: status, at, by: user.email || user.id, counts, ...extra } });
  if (status !== "dry") {
    await sb.from("partner_sync_log").insert({ direction: "export", partner: "breakinbread", counts, by_user: user.id, ok: status === "ok", response: extra.response || (extra.error ? { error: extra.error } : null) });
  }
}

export default async function handler(req, res) {
  if (process.env.PARTNER_SYNC !== "on") return res.status(404).json({ ok: false, error: "Not found" });
  if (req.method !== "POST") { res.setHeader("allow", "POST"); return res.status(405).json({ ok: false, error: "Use POST" }); }
  const sb = adminClient();
  if (!sb) return res.status(500).json({ ok: false, error: "Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." });
  const user = await staffUser(sb, req);
  if (!user) return res.status(401).json({ ok: false, error: "Sign in as label staff first." });

  const { dryRun } = await readJson(req);
  let bundle;
  try {
    bundle = buildBundle({ catalog: loadCatalog(), docs: groupDocs(await loadDocs(sb)), siteUrl: siteUrlOf(req) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Couldn't build the bundle: " + (e.message || e) });
  }
  const counts = bundle.counts;

  if (dryRun) { await record(sb, user, "dry", counts); return res.status(200).json({ ok: true, dryRun: true, counts }); }

  const url = process.env.BREAKINBREAD_IMPORT_URL, secret = process.env.BREAKINBREAD_IMPORT_SECRET;
  if (!url || !secret) {
    const error = "Breakin Bread isn't connected yet. Set BREAKINBREAD_IMPORT_URL and BREAKINBREAD_IMPORT_SECRET on the server.";
    await record(sb, user, "error", counts, { error });
    return res.status(503).json({ ok: false, error, counts });
  }

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-loop-import-secret": secret, "user-agent": "loop-records-push/1" },
      body: JSON.stringify(bundle),
      signal: AbortSignal.timeout(55000),
    });
    const text = await r.text();
    let response; try { response = JSON.parse(text); } catch { response = { raw: text.slice(0, 500) }; }
    if (!r.ok || response.ok === false) {
      const error = `Breakin Bread answered ${r.status}: ${response.error || response.raw || "no details"}`;
      await record(sb, user, "error", counts, { error, response });
      return res.status(502).json({ ok: false, error, counts });
    }
    await record(sb, user, "ok", counts, { response });
    return res.status(200).json({ ok: true, counts, breakinbread: response });
  } catch (e) {
    const error = "Couldn't reach Breakin Bread: " + (e.message || e);
    await record(sb, user, "error", counts, { error });
    return res.status(502).json({ ok: false, error, counts });
  }
}
