// What the Loop Records page can ask the Mac app for (window.loopDesktop).
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("loopDesktop", {
  isLoopDesktop: true,
  discs: () => ipcRenderer.invoke("discs"),
  readDisc: p => ipcRenderer.invoke("readDisc", p),
  fileFor: p => ipcRenderer.invoke("fileFor", p),
  chooseFolder: () => ipcRenderer.invoke("chooseFolder"),
  onDiscsChanged: cb => { ipcRenderer.on("discs-changed", () => cb()); }
});
