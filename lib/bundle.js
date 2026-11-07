// Builds the payload Loop Records sends to Breakin Bread.
//
// Input:  the public catalog (data/catalog.json) plus the back-office documents
//         (app_docs rows: products, orders, events, sync, rights, artwork, settings).
// Output: schema "loop-records.breakinbread/v1", already shaped like Breakin Bread's
//         Firestore collections (labels, artists, releases, works, videos, events) with
//         stable ids, so re-sending updates the same documents instead of duplicating.
//
// Pure function: no network, no environment. Covered by tests/bundle.test.mjs.

export const SCHEMA = "loop-records.breakinbread/v1";
export const LABEL_ID = "loop-records";
export const SOURCE = "import:loop-records";

export function slugify(str) {
  return String(str ?? "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/ø/g, "o").replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const ref = (collection, docId, name) => ({ collection, docId, name, path: `${collection}/${docId}` });
export const artistId = key => `loop-${key}`;
export const releaseId = id => `loop-${id}`;
export const workId = (relId, pos, i) => `loop-${relId}-${slugify(pos) || String(i + 1)}`;

function durationMs(d) {
  if (!d) return 0;
  const parts = String(d).split(":").map(n => parseInt(n, 10));
  if (parts.some(n => !Number.isFinite(n))) return 0;
  return parts.reduce((s, n) => s * 60 + n, 0) * 1000;
}

function releaseType(r) {
  const f = (r.format || "").toLowerCase();
  const various = (r.artists || []).some(a => /^various/i.test(a.name));
  if (/\bcomp/.test(f) || various) return "Compilation";
  if (/\b(lp|album)\b/.test(f)) return "Album";
  if (/\bep\b/.test(f)) return "EP";
  if ((r.tracks || []).length >= 7) return "Album";
  if ((r.tracks || []).length >= 3) return "EP";
  return "Single";
}

const labelNameOf = r => r.group === "plump" ? "Plumphouse Records" : ((r.labels && r.labels[0] && r.labels[0].name) || "Loop Records");
const artistLine = r => (r.artists || []).map(a => a.name).join(", ") || "Various";
const absolute = (url, siteUrl) => !url ? "" : /^https?:\/\//.test(url) ? url : `${siteUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
const credit = (c, byKey) => ({ name: c.name, role: c.role, ...(c.key && byKey.has(c.key) ? { artistId: artistId(c.key) } : {}) });

/** Groups app_docs rows ({collection,id,data}) into {collection: {id: data}}. */
export function groupDocs(rows) {
  const out = { products: {}, orders: {}, events: {}, sync: {}, rights: {}, artwork: {}, audio: {}, settings: {} };
  for (const row of rows || []) {
    if (!row || !row.collection) continue;
    (out[row.collection] ||= {})[row.id] = row.data || {};
  }
  return out;
}

export function buildBundle({ catalog, docs = {}, siteUrl = "", exportedAt = new Date().toISOString() }) {
  if (!catalog || !Array.isArray(catalog.releases)) throw new Error("catalog.releases missing");
  const D = { products: {}, orders: {}, events: {}, sync: {}, rights: {}, artwork: {}, audio: {}, ...docs };
  const soundOf = (rid, pos) => D.audio[`${rid}_${String(pos).replace(/[^\w-]+/g, "-")}`] || null;
  const people = catalog.people || [];
  const byKey = new Map(people.map(p => [p.key, p]));
  const L = catalog.label || {};

  // ---------- releases + works ----------
  const releases = [], works = [], videoMap = new Map();
  for (const r of catalog.releases) {
    const rid = releaseId(r.id);
    const overrides = D.artwork[String(r.id)];
    const overrideImgs = overrides && Array.isArray(overrides.images) ? overrides.images.map(x => x && x.url).filter(Boolean) : [];
    const images = [...overrideImgs, ...(r.images || []).map(u => absolute(u, siteUrl))].filter(Boolean);
    const cover = images[0] || r.discogsImage || "";
    const main = (r.artists || [])[0];
    const rights = D.rights[String(r.id)] || null;
    const rightsTracks = (rights && rights.tracks) || {};
    const label = labelNameOf(r);
    const relCredits = (r.credits || []).map(c => credit(c, byKey));
    const mainArtists = (r.artists || []).map(a => ({ name: a.name, role: "Main Artist", ...(byKey.has(a.key) ? { artistId: artistId(a.key) } : {}) }));

    const tracks = (r.tracks || []).map((t, i) => {
      const wid = workId(r.id, t.pos, i);
      const trackArtists = (t.artists || []).map(a => a.name);
      const trackCredits = (t.credits || []).map(c => credit(c, byKey));
      const reg = rightsTracks[t.pos] || {};
      const snd = soundOf(r.id, t.pos);
      const artistName = trackArtists.join(", ") || artistLine(r);
      const contributors = [
        ...(trackArtists.length ? (t.artists || []).map(a => ({ name: a.name, role: "Main Artist", ...(byKey.has(a.key) ? { artistId: artistId(a.key) } : {}) })) : mainArtists),
        ...trackCredits,
      ];
      works.push({
        workId: wid, title: t.title, type: "Work", status: "Published", privacy: "Public",
        releaseRef: ref("releases", rid, r.title),
        trackNumber: i + 1, position: t.pos || "", duration: t.dur || "", durationMs: durationMs(t.dur),
        artistName, artist: { name: artistName },
        label, labelId: LABEL_ID,
        isrc: reg.isrc || "",
        stimStatus: reg.stim || "unregistered", samiStatus: reg.sami || "unregistered",
        contributors, coverArtUrl: cover,
        ...(snd ? { audioUrl: snd.url, sourceUrl: snd.url, audioFileName: snd.name || "", audioMimeType: snd.type || "" } : {}),
        genres: r.genres || [], genre: (r.genres || [])[0] || "", subGenres: r.styles || [],
        releaseDate: r.released || (r.year ? String(r.year) : ""),
        source: SOURCE,
      });
      return {
        trackNumber: i + 1, position: t.pos || "", title: t.title,
        duration: t.dur || "", durationMs: durationMs(t.dur),
        artistName, credits: trackCredits, isrc: reg.isrc || "", workId: wid,
        ...(snd ? { audioUrl: snd.url } : {}),
      };
    });

    for (const v of r.videos || []) {
      if (!v.id) continue;
      const vid = `loop-yt-${v.id}`;
      if (videoMap.has(vid)) { videoMap.get(vid).releaseRefs.push(ref("releases", rid, r.title)); continue; }
      videoMap.set(vid, {
        videoId: vid, title: v.title || r.title, youtubeId: v.id,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${v.id}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        artistName: artistLine(r),
        ...(main && byKey.has(main.key) ? { artist: ref("artists", artistId(main.key), main.name) } : {}),
        releaseRef: ref("releases", rid, r.title), releaseRefs: [ref("releases", rid, r.title)],
        labelId: LABEL_ID, videoSource: v.source || "", source: SOURCE,
      });
    }

    const releaseProducts = Object.entries(D.products)
      .filter(([, p]) => String(p.releaseId) === String(r.id))
      .map(([id, p]) => ({ id, sku: p.sku, type: p.type, variant: p.variant || "", priceMinor: p.price ?? null, currency: "SEK", status: p.status }));

    releases.push({
      releaseId: rid, slug: slugify(`${r.catno}-${r.title}`), title: r.title, releaseType: releaseType(r),
      artist: main && byKey.has(main.key) ? ref("artists", artistId(main.key), main.name) : { name: artistLine(r) },
      artistName: artistLine(r), allArtists: (r.artists || []).map(a => a.name),
      catalogNumber: r.catno || "", catalogNumbers: r.catnos || (r.catno ? [r.catno] : []),
      upc: (rights && rights.upc) || r.upc || "",
      coverArtUrl: cover, images,
      label, labelId: LABEL_ID, labelName: label, recordLabel: ref("labels", LABEL_ID, L.name || "Loop Records"),
      imprint: r.group === "plump" ? "plumphouse" : r.group,
      genre: (r.genres || [])[0] || "", genres: r.genres || [], subGenres: r.styles || [],
      format: r.format || "", country: r.country || "",
      releaseDate: r.released || (r.year ? String(r.year) : ""), year: r.year || null,
      originalReleaseDate: r.released || (r.year ? String(r.year) : ""),
      tracks, trackCount: tracks.length, totalDurationMs: tracks.reduce((s, t) => s + t.durationMs, 0),
      credits: relCredits, contributors: [...mainArtists, ...relCredits],
      videos: (r.videos || []).map(v => `loop-yt-${v.id}`),
      splits: (rights && rights.splits || []).map(s => ({ name: s.name, role: s.role, share: s.share, ...(s.key && byKey.has(s.key) ? { artistId: artistId(s.key) } : {}) })),
      rightsStatus: (rights && rights.status) || "",
      products: releaseProducts,
      discogsId: r.id, discogsUrl: r.discogs || "",
      pLine: `℗ ${r.year || ""} ${label}`.replace(/\s+/g, " ").trim(),
      copyrightHolder: label, copyrightYear: r.year || null,
      status: "released", privacy: "Public", source: SOURCE,
    });
  }

  // ---------- artists (every credited person) ----------
  const artists = people.map(p => {
    const relIds = [...new Set((p.credits || []).map(c => releaseId(c.release)))];
    return {
      id: artistId(p.key), name: p.name, slug: slugify(p.name), aliases: p.aliases || [],
      type: "Artist", genre: "Electronic", labelId: LABEL_ID,
      profileLink: `/artists/${slugify(p.name)}`,
      imageUrl: "", dataAiHint: `${p.name} Swedish house techno artist`,
      discogsId: p.discogsId || null, discogsUrl: p.discogsId ? `https://www.discogs.com/artist/${p.discogsId}` : "",
      credits: (p.credits || []).map(c => ({ releaseId: releaseId(c.release), role: c.role, track: c.track ?? null })),
      releaseIds: relIds, releaseCount: relIds.length,
      source: SOURCE,
    };
  });

  // ---------- events ----------
  const events = Object.entries(D.events).map(([id, e]) => ({
    id: `loop-${id}`, title: e.name || "Untitled event", description: e.desc || "",
    category: "Club night", eventStatus: e.status === "cancelled" ? "cancelled" : (e.start && e.start < exportedAt ? "past" : "upcoming"),
    startTime: e.start || null, timezone: "Europe/Stockholm", isOnlineEvent: false,
    organizerId: LABEL_ID, venueName: e.venue || "",
    location: { city: e.city || "", country: "Sweden" },
    performers: (e.lineup || []).map(n => ({ userId: "", displayName: n, role: "DJ" })),
    capacity: e.capacity ?? null, loopStatus: e.status || "draft",
    tickets: Object.entries(D.products).filter(([, p]) => p.eventId === id).map(([pid, p]) => ({ id: pid, tier: p.variant, priceMinor: p.price ?? null, currency: "SEK", stock: p.stock ?? null, status: p.status })),
    source: SOURCE,
  }));

  // ---------- commerce (products, sync licensing, orders without personal data) ----------
  const products = Object.entries(D.products).map(([id, p]) => ({
    id, sku: p.sku, type: p.type, title: p.title, variant: p.variant || "",
    releaseId: p.releaseId != null && p.releaseId !== "" ? releaseId(p.releaseId) : null,
    eventId: p.eventId ? `loop-${p.eventId}` : null,
    priceMinor: p.price ?? null, currency: "SEK", vatRate: p.vat ?? 25, stock: p.stock ?? null, weightG: p.weight ?? null, status: p.status || "draft",
  }));
  const syncDeals = Object.entries(D.sync).map(([id, s]) => {
    const { contact, ...rest } = s; // licensee contact details stay at Loop
    return { id, ...rest, releaseId: s.releaseId ? releaseId(s.releaseId) : null };
  });
  const orders = Object.entries(D.orders).map(([id, o]) => ({
    id, number: o.number, createdAt: o.createdAt || null, paidAt: o.paidAt || null,
    status: o.status, channel: o.channel, country: (o.customer && o.customer.country) || "",
    totalMinor: o.total ?? null, vatMinor: o.vat ?? null, shippingMinor: o.shipping ?? 0, currency: "SEK",
    items: (o.items || []).map(i => ({ sku: i.sku, title: i.title, type: i.type, qty: i.qty, unitMinor: i.unit, vatRate: i.vat, releaseId: i.releaseId ? releaseId(i.releaseId) : null })),
  }));

  const firstCover = releases.find(r => r.coverArtUrl)?.coverArtUrl || "";
  const label = {
    id: LABEL_ID, name: L.name || "Loop Records", type: "Label",
    genre: "House / Techno", genres: ["House", "Techno", "Trance", "Acid House"],
    city: L.city || "Stockholm", country: L.country || "Sweden", founded: L.founded || 1993,
    founders: L.founders || [], sublabels: L.sublabels || [],
    bio: `${L.name || "Loop Records"} — Stockholm house and techno, ${L.founded || 1993} to 1998.`,
    imageUrl: firstCover, dataAiHint: "Swedish 90s house techno record label",
    profileLink: `/labels/${LABEL_ID}`, website: siteUrl || "",
    discogsId: L.discogsId || null, discogsUrl: L.discogs || "",
    releaseCount: releases.length, artistCount: artists.length,
    source: SOURCE,
  };

  const videos = [...videoMap.values()];
  const bundle = {
    schema: SCHEMA, exportedAt, source: catalog.source || "", siteUrl,
    label, artists, releases, works, videos, events,
    commerce: { products, syncDeals, orders },
  };
  bundle.counts = countsOf(bundle);
  return bundle;
}

export function countsOf(b) {
  const credits = b.releases.reduce((s, r) => s + r.credits.length + r.tracks.reduce((a, t) => a + t.credits.length, 0), 0);
  return {
    labels: 1, artists: b.artists.length, releases: b.releases.length, works: b.works.length,
    credits, videos: b.videos.length, events: b.events.length,
    products: b.commerce.products.length, syncDeals: b.commerce.syncDeals.length, orders: b.commerce.orders.length,
    releasesWithSplits: b.releases.filter(r => r.splits.length).length,
    tracksWithAudio: b.works.filter(w => w.audioUrl).length,
  };
}
