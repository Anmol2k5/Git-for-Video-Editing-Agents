import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { watchProjectFileForSnapshots } from "./file-watcher";

it("drains a stable change arriving while the previous snapshot is processing", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-pending-watch-"));
  const project = path.join(dir, "Film.prproj"); await writeFile(project, "one");
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const watcher = await watchProjectFileForSnapshots({ projectPath: project, debounceMs: 50, onStableChange: async () => { calls++; if (calls === 1) await barrier; } });
  try {
    await writeFile(project, "two");
    await vi.waitFor(() => expect(calls).toBe(1), { timeout: 3000 });
    await writeFile(project, "three");
    // Wait for the OS watcher and stability threshold to deliver the second event.
    await new Promise(resolve => setTimeout(resolve, 500));
    release();
    await vi.waitFor(() => expect(calls).toBe(2), { timeout: 3000 });
  } finally { release(); await watcher.close(); await rm(dir, { recursive: true, force: true }); }
});
