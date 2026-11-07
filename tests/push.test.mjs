// Runs api/breakin-bread/push.js for real against a fake Supabase (auth + PostgREST)
// and a fake Breakin Bread import endpoint, both on localhost.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

let server, base, received = [], logged = [], settings = null;
const docs = [
  { collection: "products", id: "p1", data: { sku: "LOOP001-DIG", type: "digital_release", releaseId: 73207, price: 9900, status: "live" } },
  // Only tracks with a sound file go to Breakin Bread: one here, so one release travels.
  { collection: "audio", id: "73207_A1", data: { url: "https://x.supabase.co/storage/v1/object/public/audio/a1.mp3", name: "a1.mp3" } },
];

before(async () => {
  server = http.createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    const url = new URL(req.url, "http://x"), json = (code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (url.pathname === "/auth/v1/user") return req.headers.authorization === "Bearer good" || req.headers.authorization === "Bearer notstaff"
      ? json(200, { id: req.headers.authorization === "Bearer good" ? "u1" : "u2", email: "staff@loop.se", aud: "authenticated" }) : json(401, { msg: "bad jwt" });
    if (url.pathname === "/rest/v1/staff") return json(200, url.searchParams.get("user_id") === "eq.u1" ? [{ user_id: "u1" }] : []);
    if (url.pathname === "/rest/v1/app_docs" && req.method === "GET") return json(200, docs);
    if (url.pathname === "/rest/v1/app_docs" && req.method === "POST") { settings = JSON.parse(body); return json(201, []); }
    if (url.pathname === "/rest/v1/partner_sync_log") { logged.push(JSON.parse(body)); return json(201, []); }
    if (url.pathname === "/bb/import") {
      if (req.headers["x-loop-import-secret"] !== "s3cret") return json(401, { ok: false, error: "Wrong import secret" });
      const b = JSON.parse(body); received.push(b); return json(200, { ok: true, counts: { releases: b.releases.length }, created: 10, updated: 0 });
    }
    json(404, {});
  });
  await new Promise(r => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  Object.assign(process.env, { SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: "service", PUBLIC_SITE_URL: "https://loop.example" });
});
after(() => server.close());

async function call(token, body, env = {}) {
  Object.assign(process.env, { BREAKINBREAD_IMPORT_URL: `${base}/bb/import`, BREAKINBREAD_IMPORT_SECRET: "s3cret" }, env);
  const { default: handler } = await import("../api/breakin-bread/push.js");
  const out = { headers: {} };
  const res = { setHeader: (k, v) => (out.headers[k] = v), status(c) { out.status = c; return this; }, json(o) { out.body = o; return this; } };
  await handler({ method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
  return out;
}

test("refuses anyone who isn't staff", async () => {
  assert.equal((await call(null, {})).status, 401);
  assert.equal((await call("bad", {})).status, 401);
  assert.equal((await call("notstaff", {})).status, 401);
  assert.equal(received.length, 0);
});

test("dry run builds the bundle without sending", async () => {
  const r = await call("good", { dryRun: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.counts.releases, 1);
  assert.equal(r.body.counts.heldBackWithoutAudio.releases, 61);
  assert.equal(r.body.counts.products, 1);
  assert.equal(received.length, 0);
  assert.equal(settings.data.lastStatus, "dry");
});

test("one click sends everything to Breakin Bread and logs it", async () => {
  const r = await call("good", { dryRun: false });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(received.length, 1);
  const b = received[0];
  assert.equal(b.schema, "loop-records.breakinbread/v1");
  assert.equal(b.releases.length, 1);
  assert.equal(b.releases[0].tracks.length, 1);
  assert.ok(b.artists.length > 0 && b.artists.length < 156);
  assert.equal(b.commerce.products[0].sku, "LOOP001-DIG");
  assert.ok(b.releases[0].coverArtUrl.startsWith("https://"));
  assert.equal(settings.data.lastStatus, "ok");
  assert.equal(logged.at(-1).ok, true);
});

test("reports a clear error when Breakin Bread isn't configured or rejects", async () => {
  const missing = await call("good", {}, { BREAKINBREAD_IMPORT_URL: "" });
  assert.equal(missing.status, 503);
  assert.match(missing.body.error, /isn't connected/);
  const wrong = await call("good", {}, { BREAKINBREAD_IMPORT_SECRET: "nope" });
  assert.equal(wrong.status, 502);
  assert.match(wrong.body.error, /Wrong import secret/);
  assert.equal(logged.at(-1).ok, false);
});
