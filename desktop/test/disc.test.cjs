const { test } = require("node:test");
const assert = require("node:assert/strict");
const D = require("../disc.js");
const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Format</key><integer>1</integer><key>Sessions</key><array><dict>
<key>First Track</key><integer>1</integer><key>Last Track</key><integer>6</integer><key>Leadout Block</key><integer>95462</integer>
<key>Session Number</key><integer>1</integer><key>Track Array</key><array>
${[150, 15363, 32314, 46592, 63414, 80489].map((b, i) => `<dict><key>Data</key><false/><key>Point</key><integer>${i + 1}</integer><key>Start Block</key><integer>${b}</integer></dict>`).join("")}
</array></dict></array></dict></plist>`;

test("reads the table of contents macOS writes for a music CD", () => {
  const toc = D.tocFromPlist(D.parsePlist(plist));
  assert.equal(toc.first, 1); assert.equal(toc.last, 6); assert.equal(toc.leadout, 95462);
  assert.deepEqual(toc.tracks.map(t => t.start), [150, 15363, 32314, 46592, 63414, 80489]);
  assert.equal(Math.round(D.tocLengths(toc)[0]), 203);
});

test("works out the MusicBrainz disc id (the libdiscid example disc)", () => {
  assert.equal(D.musicBrainzDiscId(D.tocFromPlist(D.parsePlist(plist))), "49HHV7Eb8UKF3aQiNmu1GR8vKTY-");
});

test("keeps what the import needs from MusicBrainz", () => {
  const mb = D.fromMusicBrainz({ releases: [{ title: "Love You Forever", barcode: "7391", "artist-credit": [{ name: "Bobby Forester" }],
    "label-info": [{ "catalog-number": "PLUMPCD 102", label: { name: "Plumphouse Records" } }],
    media: [{ discs: [{ id: "X" }], tracks: [{ title: "Intro", length: 61000 }] }] }] }, "X");
  assert.deepEqual(mb.catnos, ["PLUMPCD 102"]); assert.equal(mb.artist, "Bobby Forester"); assert.deepEqual(mb.tracks, [{ title: "Intro", duration: 61 }]);
});
