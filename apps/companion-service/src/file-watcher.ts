import * as chokidar from "chokidar";
import { waitForStableFile } from "./stable-write";

export async function watchProjectFileForSnapshots(opts: {
  projectPath: string;
  debounceMs: number;
  onStableChange: () => Promise<void>;
}) {
  const watcher = chokidar.watch(opts.projectPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: opts.debounceMs,
      pollInterval: 100
    }
  });

  let processing = false;
  let pending = false;
  let closed = false;
  let inFlight: Promise<void> = Promise.resolve();

  const processChanges = async () => {
    processing = true;
    try {
      while (pending && !closed) {
        pending = false;
        try {
          await waitForStableFile(opts.projectPath, { intervalMs: 100, stableChecks: 2, timeoutMs: 5000 });
          if (!closed) await opts.onStableChange();
        } catch (error) { console.error("Failed automatic snapshot", error); }
      }
    } finally {
      processing = false;
    }
  };
  watcher.on("change", () => {
    if (closed) return;
    pending = true;
    if (!processing) inFlight = processChanges();
  });

  // Callers may write immediately after starting a watcher. Do not return until
  // chokidar has established its initial file baseline.
  await new Promise<void>((resolve, reject) => {
    watcher.once("ready", resolve);
    watcher.once("error", reject);
  }).catch(async error => { await watcher.close(); throw error; });

  return {
    async close() {
      closed = true;
      await watcher.close();
      await inFlight;
    }
  };
}
