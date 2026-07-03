import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import * as path from "path";
import * as fs from "fs";
import chokidar, { FSWatcher } from "chokidar";
import crypto from "crypto";

let mainWindow: BrowserWindow | null = null;
const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
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
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// ─── IPC Handlers ────────────────────────────────────────────────────────

// Simple hash function for file changes
function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// Watcher state
const watchers = new Map<string, FSWatcher>();
const debounceTimers = new Map<string, NodeJS.Timeout>();

ipcMain.handle("dialog:selectProject", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Premiere Pro Projects", extensions: ["prproj"] }]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("watch:start", async (_, projectId: string, filePath: string) => {
  if (watchers.has(projectId)) {
    watchers.get(projectId)?.close();
  }

  if (!fs.existsSync(filePath)) {
    return { success: false, error: "File not found" };
  }

  const watcher = chokidar.watch(filePath, {
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
        clearTimeout(debounceTimers.get(projectId)!);
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
    } catch (err) {
      console.error(`[Watcher] Hash error:`, err);
    }
  });

  watchers.set(projectId, watcher);
  return { success: true };
});

ipcMain.handle("system:openFile", async (_, filePath: string) => {
  if (!fs.existsSync(filePath)) return { success: false, error: "File not found" };
  
  const err = await shell.openPath(filePath);
  if (err) return { success: false, error: err };
  return { success: true };
});
