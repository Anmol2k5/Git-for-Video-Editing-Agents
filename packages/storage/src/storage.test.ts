import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashFileSha256, LocalSnapshotRepository, sanitizePathHint } from "./index";

describe("local storage", () => {
  it("hashes file contents with SHA-256", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-"));
    const file = path.join(dir, "sample.prproj");
    await writeFile(file, "project-v1");
    expect(await hashFileSha256(file)).toHaveLength(64);
  });

  it("deduplicates identical project objects", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-"));
    const project = path.join(dir, "sample.prproj");
    await writeFile(project, "same-content");
    const repo = new LocalSnapshotRepository(path.join(dir, ".editvcs"));

    const first = await repo.storeProjectObject(project);
    const second = await repo.storeProjectObject(project);

    expect(first.sha256).toBe(second.sha256);
    expect(first.objectPath).toBe(second.objectPath);
    await expect(readFile(first.objectPath, "utf8")).resolves.toBe("same-content");
  });

  it("removes private drive and user folder details from path hints", () => {
    expect(sanitizePathHint("C:/Users/Mayur/Client/Film.prproj")).toBe(".../Client/Film.prproj");
  });
});
