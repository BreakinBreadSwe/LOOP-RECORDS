// Scales and arpeggios for the back office "Scales and arpeggios" page.
// Plain script so the same code runs in the page (spliced in by the builds) and in the tests (require).
// No audio and no DOM here: this only works out which notes play, in which order.
const SCALES = (() => {
  const NOTE_NAMES = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
  const SPOKEN = ["C","C sharp","D","D sharp","E","F","F sharp","G","G sharp","A","A sharp","B"];

  // Semitones above the root, one octave.
  const SCALE_LIST = [
    ["major","Major",[0,2,4,5,7,9,11]],
    ["minor","Natural minor",[0,2,3,5,7,8,10]],
    ["harmonic-minor","Harmonic minor",[0,2,3,5,7,8,11]],
    ["melodic-minor","Melodic minor",[0,2,3,5,7,9,11]],
    ["harmonic-major","Harmonic major",[0,2,4,5,7,8,11]],
    ["dorian","Dorian",[0,2,3,5,7,9,10]],
    ["phrygian","Phrygian",[0,1,3,5,7,8,10]],
    ["lydian","Lydian",[0,2,4,6,7,9,11]],
    ["mixolydian","Mixolydian",[0,2,4,5,7,9,10]],
    ["locrian","Locrian",[0,1,3,5,6,8,10]],
    ["phrygian-dominant","Phrygian dominant",[0,1,4,5,7,8,10]],
    ["hungarian-minor","Hungarian minor",[0,2,3,6,7,8,11]],
    ["double-harmonic","Double harmonic (Arabic)",[0,1,4,5,7,8,11]],
    ["in-sen","In Sen (Japanese)",[0,1,5,7,10]],
    ["pentatonic-major","Major pentatonic",[0,2,4,7,9]],
    ["pentatonic-minor","Minor pentatonic",[0,3,5,7,10]],
    ["blues","Blues",[0,3,5,6,7,10]],
    ["whole-tone","Whole tone",[0,2,4,6,8,10]],
    ["diminished","Diminished (whole, half)",[0,2,3,5,6,8,9,11]],
    ["chromatic","Chromatic (every note)",[0,1,2,3,4,5,6,7,8,9,10,11]],
  ];

  // Which scale steps an arpeggio uses. Step 0 is the root, 2 the third, 4 the fifth and so on;
  // steps past the end of the scale wrap into the next octave, so 8 is the ninth.
  const CHORDS = [
    ["scale","Whole scale (no arpeggio)",null],
    ["triad","Triad: 1 3 5",[0,2,4]],
    ["seventh","Seventh: 1 3 5 7",[0,2,4,6]],
    ["ninth","Ninth: 1 3 5 7 9",[0,2,4,6,8]],
    ["eleventh","Eleventh: 1 3 5 7 9 11",[0,2,4,6,8,10]],
    ["thirteenth","Thirteenth: 1 3 5 7 9 11 13",[0,2,4,6,8,10,12]],
    ["sixth","Sixth: 1 3 5 6",[0,2,4,5]],
    ["add9","Add nine: 1 3 5 9",[0,2,4,8]],
    ["sus2","Sus two: 1 2 5",[0,1,4]],
    ["sus4","Sus four: 1 4 5",[0,3,4]],
    ["power","Power: 1 5",[0,4]],
    ["fourths","Stacked fourths: 1 4 7 10",[0,3,6,9]],
    ["fifths","Stacked fifths: 1 5 9 13",[0,4,8,12]],
    ["shell","Shell: 1 3 7",[0,2,6]],
  ];

  // How the chosen notes are ordered. Each returns indexes into the (sorted, low to high) note list.
  const PATTERN_LIST = [
    ["up","Up",n=>range(n)],
    ["down","Down",n=>range(n).reverse()],
    ["updown","Up and down",n=>pingPong(range(n))],
    ["downup","Down and up",n=>pingPong(range(n).reverse())],
    ["converge","Outside in",n=>{ const o=[]; let a=0,b=n-1; while(a<=b){ o.push(a++); if(a<=b) o.push(b--); } return o; }],
    ["diverge","Inside out",n=>{ const m=Math.floor((n-1)/2), o=[m]; let a=m-1,b=m+1; while(a>=0||b<n){ if(b<n) o.push(b++); if(a>=0) o.push(a--); } return o; }],
    ["thirds","Thirds: 1 3, 2 4, 3 5",n=>{ const o=[]; for(let i=0;i<n;i++){ o.push(i); if(i+2<n) o.push(i+2); } return o; }],
    ["fourths","Fourths: 1 4, 2 5, 3 6",n=>{ const o=[]; for(let i=0;i<n;i++){ o.push(i); if(i+3<n) o.push(i+3); } return o; }],
    ["broken","Broken chord: low, high, middle, high",n=>{ const o=[]; for(let i=0;i<n;i++){ const base=Math.min(i,Math.max(0,n-3)); o.push(base,Math.min(base+2,n-1),Math.min(base+1,n-1),Math.min(base+2,n-1)); } return o.length?o:range(n); }],
    ["pedal","Pedal: lowest note between each",n=>{ const o=[]; for(let i=1;i<n;i++) o.push(0,i); return o.length?o:[0]; }],
    ["step2","Every other note, then the ones between",n=>{ const o=[]; for(let i=0;i<n;i+=2) o.push(i); for(let i=1;i<n;i+=2) o.push(i); return o; }],
    ["random","Random order",n=>shuffle(range(n))],
  ];

  function range(n){ return Array.from({length:Math.max(0,n)},(_,i)=>i); }
  // 0 1 2 3 becomes 0 1 2 3 2 1 (the ends are not played twice, so it loops evenly)
  function pingPong(a){ return a.length<3 ? a.slice() : a.concat(a.slice(1,-1).reverse()); }
  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

  // The audible range we use: C0 (16 Hz) to C9 (8.4 kHz). Above that a phone speaker only hisses.
  const MIN_MIDI = 12, MAX_MIDI = 120, MAX_OCTAVES = 10;
  const midiName = m => NOTE_NAMES[((m%12)+12)%12] + (Math.floor(m/12)-1);
  const midiSpoken = m => SPOKEN[((m%12)+12)%12] + " " + (Math.floor(m/12)-1);
  const midiHz = m => 440 * Math.pow(2, (m-69)/12);
  const find = (list, id) => list.find(x=>x[0]===id) || list[0];

  // Every note of the scale over `octaves` octaves from `root` (0 to 11) at `startOctave`,
  // finishing on the root above, filtered by the chord steps. Returns midi numbers, low to high.
  function notes({root=0, startOctave=3, octaves=1, scale="major", chord="scale"} = {}){
    const sc = find(SCALE_LIST, scale)[2], steps = find(CHORDS, chord)[2];
    const oct = Math.max(1, Math.min(MAX_OCTAVES, Math.round(octaves)));
    const base = 12*(startOctave+1) + root, n = sc.length, out = [];
    const degreeMidi = d => base + sc[d % n] + 12*Math.floor(d / n);
    if(!steps){ for(let d=0; d<n*oct; d++) out.push(degreeMidi(d)); }
    else { for(let o=0; o<oct; o++) for(const s of steps) out.push(degreeMidi(o*n + s)); }
    out.push(base + 12*oct);                       // the root again at the top
    const seen = new Set(), clean = [];
    for(const m of out.sort((a,b)=>a-b)){ if(seen.has(m)) continue; seen.add(m); clean.push(m); }
    return clean.filter(m=>m>=MIN_MIDI && m<=MAX_MIDI);
  }

  // The notes in the order they play. `muted` is a set of pitch classes (0 to 11) switched off:
  // those notes are left out completely, so playing carries straight on.
  function sequence(opts, pattern="up", muted=[]){
    const mute = new Set(muted), pool = notes(opts).filter(m=>!mute.has(((m%12)+12)%12));
    if(!pool.length) return [];
    return find(PATTERN_LIST, pattern)[2](pool.length).map(i=>pool[i]);
  }

  // The pitch classes of the scale, in scale order from the root, for the on/off switches.
  function pitchClasses(root, scale){ return find(SCALE_LIST, scale)[2].map(s=>(root+s)%12); }

  return { NOTE_NAMES, SPOKEN, SCALE_LIST, CHORDS, PATTERN_LIST, MIN_MIDI, MAX_MIDI, MAX_OCTAVES,
    midiName, midiSpoken, midiHz, notes, sequence, pitchClasses };
})();
if (typeof module !== "undefined" && module.exports) module.exports = SCALES;
