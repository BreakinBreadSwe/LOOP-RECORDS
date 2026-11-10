// Reading discs on a Mac. macOS shows an ordinary music CD as a folder in /Volumes with one AIFF
// file per track ("1 Audio Track.aiff") and a hidden .TOC.plist holding the disc's table of contents.
// From the table of contents we work out the MusicBrainz disc id, which tells us which release it is.
const crypto = require("crypto");

// A small reader for the XML plist macOS writes (dict, array, integer, real, string, true, false).
function parsePlist(xml) {
  const tokens = String(xml).replace(/<\?xml[^>]*>|<!DOCTYPE[^>]*>/g, "").match(/<[^>]+>|[^<]+/g) || [];
  let i = 0;
  const text = () => { let s = ""; while (i < tokens.length && !tokens[i].startsWith("<")) s += tokens[i++]; return s; };
  const unesc = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  function value() {
    while (i < tokens.length && !tokens[i].startsWith("<")) i++;
    const t = tokens[i++];
    if (!t) return undefined;
    if (/^<plist/.test(t)) { const v = value(); return v; }
    if (t === "<dict/>") return {};
    if (t === "<array/>") return [];
    if (t === "<true/>") return true;
    if (t === "<false/>") return false;
    if (t === "<string/>") return "";
    if (t === "<dict>") { const o = {}; for (;;) { while (i < tokens.length && !tokens[i].startsWith("<")) i++; if (tokens[i] === "</dict>") { i++; return o; } i++; const k = unesc(text()); i++; o[k] = value(); } }
    if (t === "<array>") { const a = []; for (;;) { while (i < tokens.length && !tokens[i].startsWith("<")) i++; if (tokens[i] === "</array>") { i++; return a; } a.push(value()); } }
    const m = t.match(/^<(\w+)>$/);
    if (m) { const s = text(); i++; if (m[1] === "integer") return parseInt(s, 10); if (m[1] === "real") return parseFloat(s); if (m[1] === "data") return s.trim(); return unesc(s); }
    return undefined;
  }
  return value();
}

// Audio tracks from the TOC: [{num, start}] plus the lead-out, all in CD sectors from the very start
// of the disc (the 150-sector pre-gap included, as MusicBrainz expects).
function tocFromPlist(plist) {
  const s = plist && plist.Sessions && plist.Sessions[0];
  if (!s) return null;
  const tracks = (s["Track Array"] || []).filter(t => t && t.Data !== true && Number.isFinite(t["Start Block"]))
    .map(t => ({ num: t.Point, start: t["Start Block"] })).sort((a, b) => a.num - b.num);
  if (!tracks.length || !Number.isFinite(s["Leadout Block"])) return null;
  let leadout = s["Leadout Block"];
  // Older systems count from 0; MusicBrainz counts the 150-sector pre-gap too.
  if (tracks[0].start < 150) { tracks.forEach(t => t.start += 150); leadout += 150; }
  // Enhanced CDs end with a data session; the audio session ends 11400 sectors before it.
  const data = (plist.Sessions[1] && plist.Sessions[1]["Track Array"] || []).find(t => t && t.Data === true);
  if (data && Number.isFinite(data["Start Block"])) leadout = data["Start Block"] + (s["Track Array"][0]["Start Block"] < 150 ? 150 : 0) - 11400;
  return { first: tracks[0].num, last: tracks[tracks.length - 1].num, leadout, tracks };
}

function musicBrainzDiscId(toc) {
  let s = hex(toc.first, 2) + hex(toc.last, 2) + hex(toc.leadout, 8);
  for (let n = 1; n < 100; n++) { const t = toc.tracks.find(x => x.num === n); s += hex(t ? t.start : 0, 8); }
  return crypto.createHash("sha1").update(s, "ascii").digest("base64").replace(/\+/g, ".").replace(/\//g, "_").replace(/=/g, "-");
}
const hex = (n, w) => n.toString(16).toUpperCase().padStart(w, "0");

// Lengths in seconds straight from the TOC (75 sectors a second).
function tocLengths(toc) {
  return toc.tracks.map((t, i) => ((toc.tracks[i + 1] ? toc.tracks[i + 1].start : toc.leadout) - t.start) / 75);
}

// The MusicBrainz answer cut down to what the import needs.
function fromMusicBrainz(json, discId) {
  const rels = (json && json.releases) || [];
  const r = rels.find(x => (x.media || []).some(m => (m.discs || []).some(d => d.id === discId))) || rels[0];
  if (!r) return null;
  const medium = (r.media || []).find(m => (m.discs || []).some(d => d.id === discId)) || (r.media || [])[0] || {};
  return {
    discId, title: r.title || "", barcode: r.barcode || "",
    artist: (r["artist-credit"] || []).map(a => (a.name || "") + (a.joinphrase || "")).join("").trim(),
    catnos: [...new Set((r["label-info"] || []).map(l => l["catalog-number"]).filter(Boolean))],
    labels: [...new Set((r["label-info"] || []).map(l => l.label && l.label.name).filter(Boolean))],
    date: r.date || "",
    tracks: (medium.tracks || []).map(t => ({ title: t.title || (t.recording && t.recording.title) || "", duration: t.length ? t.length / 1000 : null }))
  };
}

module.exports = { parsePlist, tocFromPlist, musicBrainzDiscId, tocLengths, fromMusicBrainz };
