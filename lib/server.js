// Server helpers shared by the API routes: Supabase admin client, staff check, data loading.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSiteCatalog } from "./catalog.js";

let _catalog;
export function loadCatalog() {
  if (!_catalog) _catalog = loadSiteCatalog(process.cwd());
  return _catalog;
}

export function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Returns the staff user for the request's bearer token, or null. */
export async function staffUser(sb, req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  const token = String(h).replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data || !data.user) return null;
  const { data: row } = await sb.from("staff").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return row ? data.user : null;
}

export async function loadDocs(sb) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("app_docs").select("collection,id,data").range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

export function siteUrlOf(req) {
  if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return host ? `${proto}://${host}` : "";
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}
