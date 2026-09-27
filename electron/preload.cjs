const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("localStudy", {
  readStore: () => ipcRenderer.invoke("store:read"),
  writeStore: (value) => ipcRenderer.invoke("store:write", value),
  getStoragePath: () => ipcRenderer.invoke("store:path"),
  openDataFolder: () => ipcRenderer.invoke("store:open-folder"),
  getPiperConfig: () => ipcRenderer.invoke("piper:get-config"),
  choosePiperPath: (kind) => ipcRenderer.invoke("piper:choose-path", kind),
  synthesizeOffline: (text) => ipcRenderer.invoke("piper:synthesize", text),
  synthesizeBatch: (entries) => ipcRenderer.invoke("piper:synthesize-batch", entries),
  saveTextFile: (name, content) => ipcRenderer.invoke("backup:save", { name, content }),
});
