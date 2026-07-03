"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const chokidar_1 = __importDefault(require("chokidar"));
const crypto_1 = __importDefault(require("crypto"));
let mainWindow = null;
const isDev = !electron_1.app.isPackaged;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1024,
        height: 768,
        titleBarStyle: "hidden",
        titleBarOverlay: {
            color: "#0a0a0f",
            symbolColor: "#f0f0f5",
            height: 40
        },
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    if (isDev) {
        mainWindow.loadURL("http://localhost:5173");
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
    }
}
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
// ─── IPC Handlers ────────────────────────────────────────────────────────
// Simple hash function for file changes
function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto_1.default.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('error', err => reject(err));
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}
// Watcher state
const watchers = new Map();
const debounceTimers = new Map();
electron_1.ipcMain.handle("dialog:selectProject", async () => {
    if (!mainWindow)
        return null;
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        filters: [{ name: "Premiere Pro Projects", extensions: ["prproj"] }]
    });
    if (result.canceled)
        return null;
    return result.filePaths[0];
});
electron_1.ipcMain.handle("watch:start", async (_, projectId, filePath) => {
    if (watchers.has(projectId)) {
        watchers.get(projectId)?.close();
    }
    if (!fs.existsSync(filePath)) {
        return { success: false, error: "File not found" };
    }
    const watcher = chokidar_1.default.watch(filePath, {
        persistent: true,
        awaitWriteFinish: {
            stabilityThreshold: 2000, // Wait 2s for file writes to finish
            pollInterval: 100
        }
    });
    watcher.on('change', async (changedPath) => {
        console.log(`[Watcher] File changed: ${changedPath}`);
        // Inform frontend to show "syncing..."
        mainWindow?.webContents.send("watch:event", { type: "change", projectId });
        try {
            const hash = await hashFile(changedPath);
            // Wait for debounce 
            if (debounceTimers.has(projectId)) {
                clearTimeout(debounceTimers.get(projectId));
            }
            debounceTimers.set(projectId, setTimeout(() => {
                console.log(`[Watcher] Debounced save triggered for ${projectId} (Hash: ${hash})`);
                mainWindow?.webContents.send("watch:event", {
                    type: "snapshot_ready",
                    projectId,
                    hash,
                    filePath: changedPath
                });
            }, 1000));
        }
        catch (err) {
            console.error(`[Watcher] Hash error:`, err);
        }
    });
    watchers.set(projectId, watcher);
    return { success: true };
});
electron_1.ipcMain.handle("system:openFile", async (_, filePath) => {
    if (!fs.existsSync(filePath))
        return { success: false, error: "File not found" };
    const err = await electron_1.shell.openPath(filePath);
    if (err)
        return { success: false, error: err };
    return { success: true };
});
