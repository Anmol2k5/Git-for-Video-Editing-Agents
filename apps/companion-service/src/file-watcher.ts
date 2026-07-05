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

  watcher.on("change", async () => {
    if (processing) return;
    processing = true;
    try {
      // additional check inside waitForStableFile
      await waitForStableFile(opts.projectPath, { intervalMs: 100, stableChecks: 2, timeoutMs: 5000 });
      await opts.onStableChange();
    } catch (e) {
      console.error("Failed automatic snapshot", e);
    } finally {
      processing = false;
    }
  });

  return watcher;
}
