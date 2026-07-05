import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSnapshotService, createRestoreCopy } from "./index";

describe("companion service", () => {
  it("creates a manual snapshot and ignores duplicate content", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-companion-"));
    const project = path.join(dir, "Film.prproj");
    await writeFile(project, "project-v1");
    const service = createSnapshotService({ storageRoot: path.join(dir, ".editvcs") });

    const first = await service.createManualSnapshot({ projectPath: project, label: "Before export" });
    const second = await service.createManualSnapshot({ projectPath: project, label: "Before export again" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
  });

  it("restores as a separate copy and leaves current project unchanged", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-restore-"));
    const active = path.join(dir, "Film.prproj");
    const object = path.join(dir, "object.prproj");
    await writeFile(active, "current");
    await writeFile(object, "old");

    const restoredPath = await createRestoreCopy({
      originalProjectPath: active,
      objectPath: object,
      destinationDirectory: dir,
      label: "Client feedback",
      createdAt: "2026-07-05T18:41:00.000Z"
    });

    await expect(readFile(active, "utf8")).resolves.toBe("current");
    await expect(readFile(restoredPath, "utf8")).resolves.toBe("old");
  });
});
