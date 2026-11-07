import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBundle, groupDocs, slugify, SCHEMA } from "../lib/bundle.js";
import { loadSiteCatalog } from "../lib/catalog.js";
import { fileURLToPath } from "node:url";

const catalog = loadSiteCatalog(fileURLToPath(new URL("..", import.meta.url)), { checkFiles: true });
const site = "https://loop.example";

test("every release, person and track makes it into the bundle", () => {
  const b = buildBundle({ catalog, siteUrl: site });
  assert.equal(b.schema, SCHEMA);
  assert.equal(b.releases.length, catalog.releases.length);
  assert.equal(b.artists.length, catalog.people.length);
  const tracks = catalog.releases.reduce((n, r) => n + r.tracks.length, 0);
  assert.equal(b.works.length, tracks);
  const credits = catalog.releases.reduce((n, r) => n + r.credits.length + r.tracks.reduce((a, t) => a + t.credits.length, 0), 0);
  assert.equal(b.counts.credits, credits);
  const vids = new Set(catalog.releases.flatMap(r => r.videos.map(v => v.id)));
  assert.equal(b.videos.length, vids.size);
});

test("ids are stable and unique so re-sending updates instead of duplicating", () => {
  const a = buildBundle({ catalog, siteUrl: site, exportedAt: "2026-01-01T00:00:00Z" });
  const b = buildBundle({ catalog, siteUrl: site, exportedAt: "2026-01-01T00:00:00Z" });
  assert.deepEqual(a, b);
  for (const [name, list, key] of [["releases", a.releases, "releaseId"], ["works", a.works, "workId"], ["artists", a.artists, "id"], ["videos", a.videos, "videoId"]]) {
    const ids = list.map(x => x[key]);
    assert.equal(new Set(ids).size, ids.length, `${name} ids must be unique`);
    assert.ok(ids.every(id => /^[A-Za-z0-9_-]+$/.test(id)), `${name} ids must be safe Firestore doc ids`);
  }
});

test("artwork is absolute, and back-office overrides win", () => {
  const r0 = catalog.releases.find(r => r.images.length);
  const plain = buildBundle({ catalog, siteUrl: site }).releases.find(r => r.discogsId === r0.id);
  assert.equal(plain.coverArtUrl, `${site}/${r0.images[0]}`);
  const docs = groupDocs([{ collection: "artwork", id: String(r0.id), data: { images: [{ url: "https://cdn.example/new.jpg" }] } }]);
  const over = buildBundle({ catalog, docs, siteUrl: site }).releases.find(r => r.discogsId === r0.id);
  assert.equal(over.coverArtUrl, "https://cdn.example/new.jpg");
  assert.equal(over.images.length, r0.images.length + 1);
});

test("credits link to artist documents", () => {
  const b = buildBundle({ catalog, siteUrl: site });
  const ids = new Set(b.artists.map(a => a.id));
  const linked = b.releases.flatMap(r => [...r.credits, ...r.tracks.flatMap(t => t.credits)]).filter(c => c.artistId);
  assert.ok(linked.length > 0);
  assert.ok(linked.every(c => ids.has(c.artistId)));
  const yakari = b.releases.find(r => r.catalogNumber === "LOOP 001");
  assert.equal(yakari.artistName, "Yakari");
  assert.equal(yakari.artist.collection, "artists");
});

test("back-office records come along; customer contact details do not", () => {
  const rid = catalog.releases[1].id, pos = catalog.releases[1].tracks[0].pos;
  const docs = groupDocs([
    { collection: "products", id: "p1", data: { sku: "LOOP001-DIG", type: "digital_release", releaseId: rid, price: 9900, vat: 25, status: "live" } },
    { collection: "events", id: "e1", data: { name: "Loop Söndag", start: "2030-05-01T21:00:00Z", venue: "Sturecompagniet", city: "Stockholm", lineup: ["Adam Beyer"], status: "on_sale" } },
    { collection: "products", id: "t1", data: { sku: "TIX-1", type: "ticket", eventId: "e1", variant: "Door", price: 15000, vat: 6, stock: 100, status: "live" } },
    { collection: "orders", id: "o1", data: { number: "LR-2026-0001", status: "paid", channel: "loop", customer: { name: "Anna", email: "anna@example.com", country: "SE", address: "Gatan 1" }, total: 9900, vat: 1980, items: [{ sku: "LOOP001-DIG", qty: 1, unit: 9900, vat: 25, releaseId: rid }] } },
    { collection: "sync", id: "s1", data: { licensee: "SVT", contact: "x@svt.se", releaseId: rid, fee: 500000, status: "licensed" } },
    { collection: "rights", id: String(rid), data: { upc: "123456789012", status: "cleared", splits: [{ name: "Yakari", key: "d57788", role: "Artist", share: 50 }, { name: "Loop Records", key: null, role: "Label", share: 50 }], tracks: { [pos]: { isrc: "SEABC9400001", stim: "registered" } } } },
  ]);
  const b = buildBundle({ catalog, docs, siteUrl: site });
  const rel = b.releases.find(r => r.discogsId === rid);
  assert.equal(rel.upc, "123456789012");
  assert.equal(rel.splits.length, 2);
  assert.equal(rel.splits[0].artistId, "loop-d57788");
  assert.equal(rel.products[0].sku, "LOOP001-DIG");
  assert.equal(b.works.find(w => w.releaseRef.docId === rel.releaseId).isrc, "SEABC9400001");
  assert.equal(b.events.length, 1);
  assert.equal(b.events[0].tickets[0].tier, "Door");
  assert.equal(b.events[0].eventStatus, "upcoming");
  assert.equal(b.commerce.orders[0].country, "SE");
  const raw = JSON.stringify(b);
  assert.ok(!raw.includes("anna@example.com") && !raw.includes("Gatan 1") && !raw.includes("x@svt.se"), "personal data must not leave Loop");
});

test("bundle stays well under Vercel's 4.5 MB request limit", () => {
  const size = Buffer.byteLength(JSON.stringify(buildBundle({ catalog, siteUrl: site })));
  assert.ok(size < 3_000_000, `bundle is ${size} bytes`);
});

test("uploaded sound files travel with their tracks", () => {
  const r = catalog.releases.find(x => x.catno === "LOOP 001"), t = r.tracks[0];
  const docs = groupDocs([{ collection: "audio", id: `${r.id}_${t.pos}`, data: { url: "https://x.supabase.co/storage/v1/object/public/audio/a.mp3", name: "a.mp3", type: "audio/mpeg" } }]);
  const b = buildBundle({ catalog, docs, siteUrl: site });
  const rel = b.releases.find(x => x.discogsId === r.id);
  assert.match(rel.tracks[0].audioUrl, /a\.mp3$/);
  assert.equal(rel.tracks[1].audioUrl, undefined);
  assert.equal(b.works.find(w => w.workId === rel.tracks[0].workId).sourceUrl, rel.tracks[0].audioUrl);
  assert.equal(b.counts.tracksWithAudio, 1);
});

test("slugify handles Swedish letters", () => {
  assert.equal(slugify("Loop Söndagar 21-03 Sturecompagniet"), "loop-sondagar-21-03-sturecompagniet");
  assert.equal(slugify("Åke Ärlig"), "ake-arlig");
});
