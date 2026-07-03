"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    selectProject: () => electron_1.ipcRenderer.invoke("dialog:selectProject"),
    startWatching: (projectId, filePath) => electron_1.ipcRenderer.invoke("watch:start", projectId, filePath),
    openFile: (filePath) => electron_1.ipcRenderer.invoke("system:openFile", filePath),
    onWatchEvent: (callback) => {
        electron_1.ipcRenderer.on("watch:event", (_event, data) => callback(data));
    }
});
