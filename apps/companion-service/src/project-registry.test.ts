import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it } from "vitest";
import { ProjectRegistry } from "./project-registry";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-registry-")); dirs.push(dir);
  const storage = path.join(dir, "storage");
  const projects = Array.from({ length: 20 }, (_, i) => path.join(dir, `Film${i}.prproj`));
  await Promise.all(projects.map(file => writeFile(file, "project")));
  return { dir, storage, projects };
}

it("persists every concurrent registration and deduplicates a repeated path", async () => {
  const { storage, projects } = await fixture();
  const registry = new ProjectRegistry(storage); await registry.load();
  const ids = await Promise.all(projects.map(project => registry.validateAndRegisterPath(project)));
  expect(new Set(ids).size).toBe(20);
  const duplicates = await Promise.all(Array.from({ length: 10 }, () => registry.validateAndRegisterPath(projects[0])));
  expect(new Set(duplicates)).toEqual(new Set([ids[0]]));
  const restored = new ProjectRegistry(storage); await restored.load();
  ids.forEach((id, i) => expect(restored.getCanonicalPath(id)).toBe(projects[i]));
});

it.each(["{bad json", "{}", '[{"projectId":"invalid"}]'])("refuses corrupt registry and preserves original bytes: %s", async contents => {
  const { storage } = await fixture(); await mkdir(storage);
  const file = path.join(storage, "registry.json"); await writeFile(file, contents);
  await expect(new ProjectRegistry(storage).load()).rejects.toThrow(/registry/i);
  expect(await readFile(file, "utf8")).toBe(contents);
});

it("does not remember an unpersisted project after a write failure", async () => {
  const { dir, projects } = await fixture();
  const blockedRoot = path.join(dir, "blocked"); await writeFile(blockedRoot, "not a directory");
  const registry = new ProjectRegistry(blockedRoot);
  await expect(registry.validateAndRegisterPath(projects[0])).rejects.toThrow();
  // A second attempt must fail persistence again rather than returning a phantom ID.
  await expect(registry.validateAndRegisterPath(projects[0])).rejects.toThrow();
});
