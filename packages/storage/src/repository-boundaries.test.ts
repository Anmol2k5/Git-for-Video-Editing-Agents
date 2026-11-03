import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { LocalSnapshotRepository } from "./local-repository";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))); });
async function setup() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "editvcs-repository-boundary-")); dirs.push(base);
  const root = path.join(base, "repo");
  const repo = new LocalSnapshotRepository(root);
  await repo.init();
  return { base, root, repo };
}
const hash = createHash("sha256").update("project").digest("hex");
function value() {
  return {
    schemaVersion: 1, id: "first", projectId: "project-a", streamId: "main", sequenceNumber: 1,
    createdAt: "2026-01-01T00:00:00.000Z", createdBy: "local-user", trigger: "manual",
    projectFile: { originalFileName: "Film.prproj", sourceExtension: ".prproj", sha256: hash, byteSize: 7 },
    manifest: { host: "premiere", projectName: "Film", projectPathHint: ".../Film.prproj", capturedAt: "2026-01-01T00:00:00.000Z", sequences: [] },
    manifestStatus: "unavailable", cloudStatus: "local-only"
  } as const;
}

it("does not publish temporary bytes under a different content hash", async () => {
  const { root, repo } = await setup();
  const temp = await repo.createTempObjectPath();
  await fs.writeFile(temp, "different project");
  await expect(repo.publishObject(temp, hash)).rejects.toThrow(/hash|integrity/i);
  await expect(fs.stat(path.join(root, "objects", hash.slice(0, 2), hash))).rejects.toMatchObject({ code: "ENOENT" });
});

it("refuses to publish from outside the repository temporary object directory", async () => {
  const { base, repo } = await setup();
  const outside = path.join(base, "outside.prproj");
  await fs.writeFile(outside, "project");
  await expect(repo.publishObject(outside, hash)).rejects.toThrow();
  await expect(fs.readFile(outside, "utf8")).resolves.toBe("project");
});

it("refuses a symlinked object prefix without writing outside the repository", async () => {
  const { base, root, repo } = await setup();
  const outside = path.join(base, "outside"); await fs.mkdir(outside);
  await fs.symlink(outside, path.join(root, "objects", hash.slice(0, 2)));
  const temp = await repo.createTempObjectPath(); await fs.writeFile(temp, "project");
  await expect(repo.publishObject(temp, hash)).rejects.toThrow();
  expect(await fs.readdir(outside)).toEqual([]);
});

it("does not silently replace an existing corrupted immutable object", async () => {
  const { root, repo } = await setup();
  await fs.mkdir(path.join(root, "objects", hash.slice(0, 2)));
  const object = path.join(root, "objects", hash.slice(0, 2), hash);
  await fs.writeFile(object, "corrupt");
  const temp = await repo.createTempObjectPath(); await fs.writeFile(temp, "project");
  await expect(repo.publishObject(temp, hash)).rejects.toThrow();
  await expect(fs.readFile(object, "utf8")).resolves.toBe("corrupt");
});

it("rejects snapshots whose object is missing or has a mismatched byte size", async () => {
  const { repo } = await setup();
  await expect(repo.saveSnapshot(value())).rejects.toThrow();
  const temp = await repo.createTempObjectPath(); await fs.writeFile(temp, "project");
  await repo.publishObject(temp, hash);
  await expect(repo.saveSnapshot({ ...value(), projectFile: { ...value().projectFile, byteSize: 8 } })).rejects.toThrow();
});

it("does not overwrite an existing snapshot ID with different metadata", async () => {
  const { root, repo } = await setup();
  const temp = await repo.createTempObjectPath(); await fs.writeFile(temp, "project");
  await repo.publishObject(temp, hash);
  await repo.saveSnapshot(value());
  await expect(repo.saveSnapshot({ ...value(), label: "different" })).rejects.toThrow();
  expect(JSON.parse(await fs.readFile(path.join(root, "projects", "project-a", "snapshots", "first.json"), "utf8"))).not.toHaveProperty("label");
});

it("never reads or quarantines an externally supplied snapshot path", async () => {
  const { base, repo } = await setup();
  const outside = path.join(base, "outside.json");
  await fs.writeFile(outside, "{}");
  expect(await repo.loadAndValidateSnapshot(outside)).toBeNull();
  await expect(fs.readFile(outside, "utf8")).resolves.toBe("{}");
  await fs.writeFile(outside, JSON.stringify(value()));
  expect(await repo.loadAndValidateSnapshot(outside)).toBeNull();
  await expect(fs.readFile(outside, "utf8")).resolves.toBe(JSON.stringify(value()));
});

it("does not return snapshots with mismatched pathname identities or symlinked project trees", async () => {
  const { base, root, repo } = await setup();
  const temp = await repo.createTempObjectPath(); await fs.writeFile(temp, "project");
  await repo.publishObject(temp, hash);
  const outside = path.join(base, "outside");
  await fs.mkdir(path.join(outside, "snapshots"), { recursive: true });
  await fs.writeFile(path.join(outside, "snapshots", "first.json"), JSON.stringify(value()));
  await fs.mkdir(path.join(root, "projects"));
  await fs.symlink(outside, path.join(root, "projects", "project-a"));
  expect(await repo.listSnapshots("project-a")).toEqual([]);
  await fs.unlink(path.join(root, "projects", "project-a"));
  await fs.mkdir(path.join(root, "projects", "project-a", "snapshots"), { recursive: true });
  await fs.writeFile(path.join(root, "projects", "project-a", "snapshots", "other-id.json"), JSON.stringify(value()));
  expect(await repo.listSnapshots("project-a")).toEqual([]);
});

it("does not save snapshots through a symlinked project directory", async () => {
  const { base, root, repo } = await setup();
  const temp = await repo.createTempObjectPath(); await fs.writeFile(temp, "project");
  await repo.publishObject(temp, hash);
  const outside = path.join(base, "outside"); await fs.mkdir(outside);
  await fs.mkdir(path.join(root, "projects"));
  await fs.symlink(outside, path.join(root, "projects", "project-a"));
  await expect(repo.saveSnapshot(value())).rejects.toThrow();
  expect(await fs.readdir(outside)).toEqual([]);
});

it("does not follow a snapshot file symlink even when its target and object are valid", async () => {
  const { base, root, repo } = await setup();
  const temp = await repo.createTempObjectPath(); await fs.writeFile(temp, "project");
  await repo.publishObject(temp, hash);
  const outside = path.join(base, "first.json"); await fs.writeFile(outside, JSON.stringify(value()));
  const snapshots = path.join(root, "projects", "project-a", "snapshots");
  await fs.mkdir(snapshots, { recursive: true });
  await fs.symlink(outside, path.join(snapshots, "first.json"));
  expect(await repo.listSnapshots("project-a")).toEqual([]);
  await expect(fs.readFile(outside, "utf8")).resolves.toBe(JSON.stringify(value()));
});

it("does not return a snapshot for restore when its stored object is corrupt", async () => {
  const { root, repo } = await setup();
  const temp = await repo.createTempObjectPath(); await fs.writeFile(temp, "project");
  await repo.publishObject(temp, hash);
  await repo.saveSnapshot(value());
  await fs.writeFile(path.join(root, "objects", hash.slice(0, 2), hash), "corrupt");
  expect(await repo.listSnapshots("project-a")).toEqual([]);
  expect(repo.getHealthWarnings().length).toBeGreaterThan(0);
});

it("deduplicates repeated corrupt snapshot warnings and bounds distinct warnings", async () => {
  const { root, repo } = await setup();
  const temp = await repo.createTempObjectPath(); await fs.writeFile(temp, "project");
  await repo.publishObject(temp, hash);
  await repo.saveSnapshot(value());
  await fs.writeFile(path.join(root, "objects", hash.slice(0, 2), hash), "corrupt");
  for (let i = 0; i < 5; i++) expect(await repo.listSnapshots("project-a")).toEqual([]);
  expect(repo.getHealthWarnings()).toHaveLength(1);
  for (let i = 0; i < 150; i++) await repo.loadAndValidateSnapshot(path.join(root, `invalid-${i}.json`));
  expect(repo.getHealthWarnings().length).toBeLessThanOrEqual(100);
  repo.clearHealthWarnings();
  expect(repo.getHealthWarnings()).toEqual([]);
});

it.each(["", ".", "../other", "project/other", "project\\other"])("rejects invalid project ID %j before reading snapshots", async id => {
  const { repo } = await setup();
  await expect(repo.listSnapshots(id)).rejects.toThrow();
});

it.each(["", "a", "A".repeat(64), "../" + "a".repeat(61)])("rejects invalid object hash %j before publication", async invalidHash => {
  const { repo } = await setup();
  const temp = await repo.createTempObjectPath(); await fs.writeFile(temp, "project");
  await expect(repo.publishObject(temp, invalidHash)).rejects.toThrow();
  await expect(fs.readFile(temp, "utf8")).resolves.toBe("project");
});
