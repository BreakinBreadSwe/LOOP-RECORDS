import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const M = createRequire(import.meta.url)("../lib/cdmatch.cjs");
const CAT = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
const rel = id => CAT.releases.find(r => r.id === id);

test("file names give track numbers and titles", () => {
  assert.deepEqual(M.fromName("03 - Lotus Trance.mp3"), { num: "03", title: "Lotus Trance" });
  assert.deepEqual(M.fromName("1 Audio Track.aiff"), { num: "1", title: "" });
  assert.deepEqual(M.fromName("B2 Water Of Tranquility.flac"), { num: "B2", title: "Water Of Tranquility" });
});

test("ID3 tags are read", () => {
  const frame = (id, text) => { const t = Buffer.from([3, ...Buffer.from(text, "utf8")]); const h = Buffer.alloc(10); h.write(id, 0); h.writeUInt32BE(t.length, 4); return Buffer.concat([h, t]); };
  const body = Buffer.concat([frame("TIT2", "Lotus Trance"), frame("TPE1", "Yakari"), frame("TRCK", "2/4")]);
  const head = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, body.length]);
  assert.deepEqual(M.readId3(Buffer.concat([head, body])), { title: "Lotus Trance", artist: "Yakari", track: "2/4" });
});

test("a music CD with only track lengths finds its release", () => {
  const r = rel(73207); // Tranquiliser EP, four tracks
  const files = r.tracks.map((t, i) => M.describe(`${i + 1} Audio Track.aiff`, {}, (M.parseDur(t.dur) || 300) + 1));
  const disc = { name: "Audio CD", mb: { title: "Tranquiliser EP", artist: "Yakari", catnos: ["LOOP 001"] } };
  const top = M.rankReleases(CAT.releases, disc, files)[0];
  assert.equal(top.release.id, 73207);
  assert.deepEqual(M.assignTracks(top.release, files), r.tracks.map(t => t.pos));
});

test("tagged files match by title even out of order", () => {
  const r = rel(73207);
  const files = [...r.tracks].reverse().map(t => M.describe(`${t.title}.mp3`, { title: t.title, artist: "Yakari", album: "Tranquiliser EP" }, null));
  const top = M.rankReleases(CAT.releases, { name: "Tranquiliser" }, files)[0];
  assert.equal(top.release.id, 73207);
  assert.deepEqual(M.assignTracks(r, files), [...r.tracks].reverse().map(t => t.pos));
});

test("a catalogue number in the folder name wins", () => {
  const files = [M.describe("01.wav", {}, null), M.describe("02.wav", {}, null)];
  const top = M.rankReleases(CAT.releases, { name: "PLUMP 022 Summer Jam" }, files)[0];
  assert.equal(top.release.catno.replace(/\s/g, "").toUpperCase(), "PLUMP022");
});
