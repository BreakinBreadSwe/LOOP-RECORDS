import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const S = createRequire(import.meta.url)("../lib/scales.cjs");

test("C major, one octave, is C D E F G A B C", () => {
  assert.deepEqual(S.notes({root:0,startOctave:4,octaves:1,scale:"major"}), [60,62,64,65,67,69,71,72]);
});
test("octaves 1 to 10 stack up, clamped to the range we play", () => {
  for(let o=1;o<=10;o++){ const n=S.notes({startOctave:0,octaves:o,scale:"major"}); assert.ok(n.length>0); assert.ok(n.every(m=>m>=S.MIN_MIDI&&m<=S.MAX_MIDI)); }
  assert.equal(S.notes({startOctave:0,octaves:8,scale:"major"}).length, 8*7+1);
  assert.equal(S.notes({startOctave:3,octaves:10,scale:"major"}).at(-1), 120); // C9 is the highest note we play
});
test("triad arpeggio uses 1 3 5 in every octave", () => {
  assert.deepEqual(S.notes({startOctave:4,octaves:2,scale:"major",chord:"triad"}), [60,64,67,72,76,79,84]);
});
test("ninth wraps past the end of the scale", () => {
  assert.deepEqual(S.notes({startOctave:4,octaves:1,scale:"major",chord:"ninth"}), [60,64,67,71,74,72].sort((a,b)=>a-b));
});
test("muting a note leaves it out of every octave, and playing carries straight on", () => {
  const seq = S.sequence({startOctave:4,octaves:2,scale:"major"}, "up", [4]); // E off
  assert.ok(!seq.some(m=>m%12===4)); assert.deepEqual(seq.slice(0,3),[60,62,65]);
});
test("everything muted gives an empty sequence", () => {
  assert.deepEqual(S.sequence({scale:"major"}, "up", S.pitchClasses(0,"major")), []);
});
test("every pattern only plays notes from the pool and plays something", () => {
  const pool = S.notes({startOctave:3,octaves:2,scale:"minor",chord:"seventh"});
  for(const [id] of S.PATTERN_LIST){ const q=S.sequence({startOctave:3,octaves:2,scale:"minor",chord:"seventh"}, id); assert.ok(q.length>0,id); assert.ok(q.every(m=>pool.includes(m)),id); }
});
test("up and down does not repeat the turning notes", () => {
  assert.deepEqual(S.sequence({startOctave:4,octaves:1,scale:"pentatonic-major"},"updown").map(m=>m-60), [0,2,4,7,9,12,9,7,4,2]);
});
test("a single note still works for every pattern", () => {
  for(const [id] of S.PATTERN_LIST){ const q=S.sequence({startOctave:4,octaves:1,scale:"major"}, id, [0,2,4,5,7,9]); assert.ok(q.length>0,id); }
});
