// Import from CD: read what is on a disc or in a folder and find the release and tracks it belongs to.
// Plain script so the same code runs in the page (spliced in by the builds) and in the tests (require).
// No network and no DOM here; the page and the Mac app hand in what they read.
const CDMATCH = (() => {
  const AUDIO_EXT = /\.(mp3|m4a|aac|mp4|flac|wav|wave|aif|aiff|aifc|ogg|oga|opus|alac)$/i;
  const norm = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  const STOP = new Set(["the", "a", "an", "and", "of", "mix", "original", "version", "remix", "edit", "feat", "ft", "vs"]);
  const words = s => norm(s).split(" ").filter(w => w && !STOP.has(w));
  function overlap(a, b) {
    const A = new Set(words(a)), B = new Set(words(b));
    if (!A.size || !B.size) return 0;
    let n = 0; A.forEach(w => { if (B.has(w)) n++; });
    return n / Math.max(A.size, B.size);
  }
  const catKey = s => norm(s).replace(/ /g, "");
  function parseDur(s) {
    if (s == null || s === "") return null;
    if (typeof s === "number") return s;
    const p = String(s).split(":").map(Number);
    if (p.some(x => !Number.isFinite(x))) return null;
    return p.reduce((a, x) => a * 60 + x, 0);
  }
  const fmtDur = sec => sec == null ? "" : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

  // "03 - Bender Boys - Fatz.mp3", "1 Audio Track.aiff", "B2 Water Of Tranquility.flac"
  function fromName(name) {
    const base = String(name || "").replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
    const m = base.match(/^\s*(?:(?:disc|cd)\s*\d+\s*[-_. ]\s*)?([A-D]?\d{1,2})\s*[-_. )]\s*(.*)$/i);
    let num = null, title = base;
    if (m) { num = m[1]; title = m[2] || ""; }
    if (/^audio track$/i.test(title.trim()) || /^track\s*\d*$/i.test(title.trim())) title = "";
    title = title.replace(/_/g, " ").replace(/\s+/g, " ").trim();
    return { num, title };
  }

  // Minimal ID3v2 reader (2.3 and 2.4): title, artist, album, track number.
  function readId3(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return {};
    const ver = b[3], size = (b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9];
    const end = Math.min(b.length, 10 + size), out = {};
    const want = { TIT2: "title", TPE1: "artist", TALB: "album", TRCK: "track", TPE2: "albumArtist" };
    let i = 10;
    if (b[5] & 0x40) { const ext = ver === 4 ? ((b[10] << 21) | (b[11] << 14) | (b[12] << 7) | b[13]) : ((b[10] << 24) | (b[11] << 16) | (b[12] << 8) | b[13]) + 4; i += ext; }
    while (i + 10 <= end) {
      const id = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const len = ver === 4 ? ((b[i + 4] << 21) | (b[i + 5] << 14) | (b[i + 6] << 7) | b[i + 7]) : ((b[i + 4] << 24) | (b[i + 5] << 16) | (b[i + 6] << 8) | b[i + 7]);
      const start = i + 10; if (len <= 0 || start + len > end) break;
      if (want[id]) out[want[id]] = decodeText(b.subarray(start, start + len));
      i = start + len;
    }
    return out;
  }
  function decodeText(f) {
    const enc = f[0], d = f.subarray(1);
    let s = "";
    try {
      if (enc === 1 || enc === 2) s = new TextDecoder(enc === 2 ? "utf-16be" : (d[0] === 0xfe ? "utf-16be" : "utf-16le")).decode(d[0] === 0xff || d[0] === 0xfe ? d.subarray(2) : d);
      else if (enc === 3) s = new TextDecoder("utf-8").decode(d);
      else s = Array.from(d, c => String.fromCharCode(c)).join("");
    } catch (e) { s = ""; }
    return s.replace(/\u0000+$/g, "").replace(/\u0000/g, " / ").trim();
  }

  // One entry per audio file, with the best name we can find: tag, then file name.
  function describe(name, tags, duration) {
    const n = fromName(name), t = tags || {};
    const trackNo = t.track ? String(t.track).split("/")[0].trim() : null;
    return {
      name, title: (t.title || n.title || "").trim(), artist: (t.artist || t.albumArtist || "").trim(),
      album: (t.album || "").trim(), num: trackNo || n.num, duration: duration ?? null
    };
  }

  function orderFiles(files) {
    const key = f => { const m = String(f.num || "").match(/^([A-D]?)(\d+)$/i); return m ? (m[1] ? (m[1].toUpperCase().charCodeAt(0) - 64) * 100 : 0) + Number(m[2]) : 9999; };
    return files.map((f, i) => ({ f, i })).sort((a, b) => key(a.f) - key(b.f) || a.f.name.localeCompare(b.f.name, undefined, { numeric: true }) || a.i - b.i).map(x => x.f);
  }

  // disc: { name, album, artist, catno, barcode, mb: { title, artist, catnos:[], barcode, tracks:[{title, duration}] } }
  function scoreRelease(r, disc, files) {
    const tracks = r.tracks || [];
    let s = 0; const why = [];
    const catnos = [r.catno, ...(r.catnos || [])].filter(Boolean).map(catKey);
    const discCats = [disc.catno, ...((disc.mb && disc.mb.catnos) || [])].filter(Boolean).map(catKey);
    if (discCats.some(c => c && catnos.includes(c))) { s += 20; why.push("catalogue number"); }
    const hay = catKey(disc.name || "") + " " + catKey(disc.album || "");
    if (catnos.some(c => c.length >= 5 && hay.includes(c))) { s += 12; why.push("catalogue number in the name"); }
    const albums = [disc.album, disc.name, disc.mb && disc.mb.title].filter(Boolean);
    const t = Math.max(0, ...albums.map(a => overlap(a, r.title)));
    if (t) { s += 8 * t; if (t >= 0.5) why.push("title"); }
    const artistLine = (r.artists || []).map(a => a.name).join(" ");
    const artists = [disc.artist, disc.mb && disc.mb.artist, ...files.map(f => f.artist)].filter(Boolean);
    const a = Math.max(0, ...artists.map(x => overlap(x, artistLine)));
    if (a) { s += 4 * a; if (a >= 0.5) why.push("artist"); }
    const n = files.length, m = tracks.length;
    if (n && n === m) { s += 3; why.push("number of tracks"); } else if (n && Math.abs(n - m) === 1) s += 1;
    const ord = orderFiles(files); let durHits = 0;
    ord.forEach((f, i) => { const d = parseDur(tracks[i] && tracks[i].dur); if (d && f.duration) { const diff = Math.abs(d - f.duration); if (diff <= 3) { s += 2; durHits++; } else if (diff <= 8) s += 1; } });
    if (durHits >= Math.min(2, n)) why.push("track lengths");
    const titles = [...files.map(f => f.title), ...((disc.mb && disc.mb.tracks) || []).map(x => x.title)].filter(Boolean);
    let titleHits = 0;
    titles.forEach(ft => { if (tracks.some(tr => overlap(ft, tr.title) >= 0.6)) titleHits++; });
    if (titleHits) { s += 2 * titleHits; why.push("track titles"); }
    return { release: r, score: Math.round(s * 10) / 10, why };
  }

  function rankReleases(releases, disc, files, limit = 5) {
    return releases.map(r => scoreRelease(r, disc, files)).filter(x => x.score > 2)
      .sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // Which track each file is: a clear title match wins, otherwise the order on the disc.
  // Returns an array the same length as files with a track position or null.
  function assignTracks(r, files) {
    const tracks = r.tracks || [], used = new Set(), out = new Array(files.length).fill(null);
    files.forEach((f, i) => {
      let best = null, bs = 0;
      tracks.forEach(t => { if (used.has(t.pos)) return; const o = overlap(f.title, t.title); if (o > bs) { bs = o; best = t; } });
      if (best && bs >= 0.6) { out[i] = best.pos; used.add(best.pos); }
    });
    const ord = orderFiles(files.map((f, i) => ({ ...f, _i: i })));
    const free = tracks.filter(t => !used.has(t.pos));
    ord.filter(f => out[f._i] == null).forEach((f, k) => { if (free[k]) out[f._i] = free[k].pos; });
    return out;
  }

  return { AUDIO_EXT, norm, overlap, parseDur, fmtDur, fromName, readId3, describe, orderFiles, scoreRelease, rankReleases, assignTracks };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CDMATCH;
