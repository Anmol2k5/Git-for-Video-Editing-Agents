import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  selectProject: () => ipcRenderer.invoke("dialog:selectProject"),
  startWatching: (projectId: string, filePath: string) => ipcRenderer.invoke("watch:start", projectId, filePath),
  openFile: (filePath: string) => ipcRenderer.invoke("system:openFile", filePath),
  onWatchEvent: (callback: (data: any) => void) => {
    ipcRenderer.on("watch:event", (_event, data) => callback(data));
  }
});
