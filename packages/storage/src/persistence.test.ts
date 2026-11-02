import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { writeJsonAtomic } from "./write-json";
import { LocalSnapshotRepository } from "./local-repository";
import { snapshotSchema } from "./schemas";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

it("concurrent unequal writes publish complete JSON without shared-temp collisions", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-json-")); dirs.push(dir);
  const file = path.join(dir, "registry.json");
  const values = Array.from({ length: 20 }, (_, i) => ({ data: String(i).repeat(i * 10000 + 1) }));
  await expect(Promise.all(values.map(value => writeJsonAtomic(file, value)))).resolves.toHaveLength(20);
  expect(values).toContainEqual(JSON.parse(await readFile(file, "utf8")));
  expect(await readdir(dir)).toEqual(["registry.json"]);
});

it("failed publication cleans its temporary file without altering the destination", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-json-")); dirs.push(dir);
  await expect(writeJsonAtomic(dir, { data: "new" })).rejects.toThrow();
  expect(await readdir(path.dirname(dir))).not.toContain(path.basename(dir) + ".tmp-" + process.pid);
  // Temp files live beside their destination; only this test's prefix is relevant.
  expect((await readdir(path.dirname(dir))).filter(name => name.startsWith(path.basename(dir) + ".tmp-"))).toEqual([]);
});

it.each(["../outside", "..", "/tmp/outside", "foo\\bar"])("rejects repository traversal identifier %s", async id => {
  const repo = new LocalSnapshotRepository("/tmp/unused-editvcs-boundary");
  await expect(repo.listSnapshots(id)).rejects.toThrow();
});

it("rejects hashes with path characters in persisted snapshots", () => {
  const result = snapshotSchema.shape.projectFile.shape.sha256.safeParse("../" + "a".repeat(61));
  expect(result.success).toBe(false);
});
