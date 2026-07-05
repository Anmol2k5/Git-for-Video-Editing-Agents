import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { watchProjectFileForSnapshots } from "./file-watcher";

describe("file watcher", () => {
  it("creates one automatic save point after stable writes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-watch-"));
    const project = path.join(dir, "Film.prproj");
    await writeFile(project, "v1");
    const events: string[] = [];

    const watcher = await watchProjectFileForSnapshots({
      projectPath: project,
      debounceMs: 100,
      onStableChange: async () => {
        events.push("snapshot");
      }
    });

    await writeFile(project, "v2");
    await new Promise((resolve) => setTimeout(resolve, 600));
    await watcher.close();

    expect(events).toEqual(["snapshot"]);
  });
});
