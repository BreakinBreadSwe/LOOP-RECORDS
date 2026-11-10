// Loop Records for Mac: the back office in its own window, plus what a browser can't do:
// see a CD go in, read a music CD track by track, look it up in MusicBrainz and convert the
// tracks to AAC (with macOS's own afconvert) so the back office can add them to the release.
const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require("electron");
const fs = require("fs"), fsp = fs.promises, path = require("path"), os = require("os");
const { execFile } = require("child_process");
const D = require("./disc.js");
const CD = require("./cdmatch.cjs");

const SITE = process.env.LOOP_SITE || "https://loop-records-mocha.vercel.app";
const ORIGIN = new URL(SITE).origin;
const UA = `LoopRecordsMac/${app.getVersion()} ( ${SITE} )`;
let win = null;
const allowed = new Set(); // folders the person chose, besides discs in /Volumes

const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { maxBuffer: 1 << 24 }, (e, out, err) => e ? rej(new Error((err || e.message).trim())) : res(out)));

// Discs: music CDs (cddafs) and data discs (cd9660, udf) mounted under /Volumes.
async function discs() {
  const out = await run("/sbin/mount", []).catch(() => "");
  const list = [];
  for (const line of out.split("\n")) {
    const m = line.match(/ on (\/Volumes\/.+?) \((cddafs|cd9660|udf)\b/);
    if (!m) continue;
    list.push({ path: m[1], name: path.basename(m[1]), kind: m[2] === "cddafs" ? "audio-cd" : "data" });
  }
  return list;
}
function okPath(p) {
  const r = path.resolve(p);
  return r.startsWith("/Volumes/") || [...allowed].some(a => r === a || r.startsWith(a + path.sep));
}
async function audioFiles(dir, depth = 0) {
  let out = [];
  for (const e of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 3) out = out.concat(await audioFiles(p, depth + 1));
    else if (e.isFile() && CD.AUDIO_EXT.test(e.name)) out.push(p);
  }
  return out;
}
async function duration(p) {
  const out = await run("/usr/bin/afinfo", [p]).catch(() => "");
  const m = out.match(/estimated duration:\s*([\d.]+)/);
  return m ? Number(m[1]) : null;
}
async function tags(p) {
  if (!/\.mp3$/i.test(p)) return {};
  const fh = await fsp.open(p, "r"); const buf = Buffer.alloc(262144);
  try { const { bytesRead } = await fh.read(buf, 0, buf.length, 0); return CD.readId3(buf.subarray(0, bytesRead)); } catch (e) { return {}; } finally { await fh.close(); }
}
async function musicBrainz(discId) {
  try {
    const r = await fetch(`https://musicbrainz.org/ws/2/discid/${encodeURIComponent(discId)}?inc=recordings+artist-credits+labels&fmt=json`, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!r.ok) return null;
    return D.fromMusicBrainz(await r.json(), discId);
  } catch (e) { return null; }
}
async function readDisc(dir) {
  if (!okPath(dir)) throw new Error("That folder isn't a disc or a folder you chose.");
  const files = (await audioFiles(dir)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const res = { name: path.basename(dir), files: [] };
  const tocFile = path.join(dir, ".TOC.plist");
  let lengths = null;
  if (fs.existsSync(tocFile)) {
    const toc = D.tocFromPlist(D.parsePlist(await fsp.readFile(tocFile, "utf8")));
    if (toc) { lengths = D.tocLengths(toc); const id = D.musicBrainzDiscId(toc); res.mb = (await musicBrainz(id)) || { discId: id }; if (res.mb.title) { res.album = res.mb.title; res.artist = res.mb.artist; } }
  }
  for (const [i, f] of files.entries()) {
    const st = await fsp.stat(f);
    res.files.push({ path: f, name: path.basename(f), size: st.size, tags: await tags(f), duration: (lengths && /audio track/i.test(f) && lengths[i]) || await duration(f) });
  }
  return res;
}
// Music CD tracks and WAV/AIFF become AAC at 256 kbit/s (about 2 MB a minute); MP3, AAC and FLAC go as they are.
async function fileFor(p) {
  if (!okPath(p)) throw new Error("That file isn't on a disc or in a folder you chose.");
  const name = path.basename(p);
  if (/\.(aif|aiff|aifc|wav|wave)$/i.test(p)) {
    const out = path.join(os.tmpdir(), `loop-${Date.now()}-${Math.random().toString(36).slice(2)}.m4a`);
    await run("/usr/bin/afconvert", [p, out, "-f", "m4af", "-d", "aac", "-b", "256000"]);
    const bytes = await fsp.readFile(out); fsp.unlink(out).catch(() => {});
    return { name: name.replace(/\.[^.]+$/, ".m4a"), type: "audio/mp4", bytes };
  }
  const types = { mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", flac: "audio/flac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg" };
  return { name, type: types[(name.split(".").pop() || "").toLowerCase()] || "application/octet-stream", bytes: await fsp.readFile(p) };
}

// Only the Loop Records site may use these.
function guard(fn) {
  return async (e, ...a) => {
    const url = e.senderFrame && e.senderFrame.url;
    if (!url || new URL(url).origin !== ORIGIN) throw new Error("Not allowed.");
    return fn(...a);
  };
}
ipcMain.handle("discs", guard(discs));
ipcMain.handle("readDisc", guard(readDisc));
ipcMain.handle("fileFor", guard(fileFor));
ipcMain.handle("chooseFolder", guard(async () => {
  const r = await dialog.showOpenDialog(win, { title: "Choose a CD or folder", properties: ["openDirectory"] });
  if (r.canceled || !r.filePaths[0]) return null;
  allowed.add(path.resolve(r.filePaths[0])); return r.filePaths[0];
}));

function watchVolumes() {
  let t = null;
  try { fs.watch("/Volumes", () => { clearTimeout(t); t = setTimeout(() => win && win.webContents.send("discs-changed"), 1500); }); } catch (e) {}
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 360, title: "Loop Records", backgroundColor: "#f4efe4",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  win.loadURL(SITE + "/#admin");
  // Other sites (YouTube pages, Discogs, email links) open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (new URL(url).origin !== ORIGIN) { e.preventDefault(); shell.openExternal(url); } });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: "appMenu" }, { role: "editMenu" },
    { label: "View", submenu: [{ role: "reload" }, { label: "Back office", accelerator: "CmdOrCtrl+B", click: () => win && win.loadURL(SITE + "/#admin") },
      { label: "Import from CD", accelerator: "CmdOrCtrl+I", click: () => win && win.loadURL(SITE + "/#admin-import") },
      { type: "separator" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }, { role: "togglefullscreen" }] },
    { role: "windowMenu" }
  ]));
  createWindow(); watchVolumes();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on("window-all-closed", () => app.quit());
