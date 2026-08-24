const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("qa", {
  openUrl: (url) => ipcRenderer.invoke("paseo:opener:openUrl", url),
});
