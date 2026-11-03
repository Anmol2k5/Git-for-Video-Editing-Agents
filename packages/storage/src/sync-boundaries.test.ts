import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { syncToGitHub, syncToLocalPath } from "./sync";

const exec = promisify(execFile);
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))); });

async function setup() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "editvcs-sync-boundary-"));
  dirs.push(base);
  const local = path.join(base, "local");
  const remote = path.join(base, "remote");
  await fs.mkdir(local);
  await fs.mkdir(remote);
  return { base, local, remote };
}

async function snapshot(root: string, id: string, content = "project-15") {
  const hash = createHash("sha256").update(content).digest("hex");
  const object = path.join(root, "objects", hash.slice(0, 2), hash);
  const file = path.join(root, "projects", "project-a", "snapshots", `${id}.json`);
  const value = {
    schemaVersion: 1, id, projectId: "project-a", streamId: "main", sequenceNumber: 1,
    createdAt: "2026-01-01T00:00:00.000Z", createdBy: "local-user", trigger: "manual",
    projectFile: { originalFileName: "Film.prproj", sourceExtension: ".prproj", sha256: hash, byteSize: Buffer.byteLength(content) },
    manifest: { host: "premiere", projectName: "Film", projectPathHint: ".../Film.prproj", capturedAt: "2026-01-01T00:00:00.000Z", sequences: [] },
    manifestStatus: "unavailable", cloudStatus: "local-only"
  };
  await fs.mkdir(path.dirname(object), { recursive: true });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(object, content);
  await fs.writeFile(file, JSON.stringify(value));
  return { hash, object, file, value };
}

it("syncs current snapshots and new objects in an existing prefix without copying private files", async () => {
  const { local, remote } = await setup();
  await snapshot(local, "first");
  expect((await syncToLocalPath(local, remote)).errors).toEqual([]);
  const next = await snapshot(local, "second", "project-19"); // Both fixtures hash to the be/ prefix.
  await fs.writeFile(path.join(local, "projects", "project-a", "private.json"), "private-project-path");
  await fs.writeFile(path.join(local, "registry.json"), "private-project-path");
  await fs.mkdir(path.join(local, "logs"));
  await fs.writeFile(path.join(local, "logs", "private.log"), "private-project-path");
  const result = await syncToLocalPath(local, remote);
  expect(result).toEqual({ pushed: 2, pulled: 0, errors: [] });
  await expect(fs.readFile(path.join(remote, "objects", next.hash.slice(0, 2), next.hash), "utf8")).resolves.toBe("project-19");
  await expect(fs.readFile(path.join(remote, "projects", "project-a", "snapshots", "second.json"), "utf8")).resolves.toBe(JSON.stringify(next.value));
  await expect(fs.stat(path.join(remote, "registry.json"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(fs.stat(path.join(remote, "projects", "project-a", "private.json"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(fs.stat(path.join(remote, "logs", "private.log"))).rejects.toMatchObject({ code: "ENOENT" });
});

it.each(["hash", "size", "identity"])("does not publish a snapshot with mismatched %s", async mismatch => {
  const { local, remote } = await setup();
  const saved = await snapshot(local, "first");
  if (mismatch === "hash") await fs.writeFile(saved.object, "corruption");
  if (mismatch === "size") saved.value.projectFile.byteSize++;
  if (mismatch === "identity") saved.value.projectId = "another-project";
  await fs.writeFile(saved.file, JSON.stringify(saved.value));
  const result = await syncToLocalPath(local, remote);
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.pushed).toBe(0);
  await expect(fs.stat(path.join(remote, "projects", "project-a", "snapshots", "first.json"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("rejects symlinked source trees and destination trees without following them", async () => {
  const { base, local, remote } = await setup();
  const outside = path.join(base, "outside");
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(local, "manifests"));
  await fs.writeFile(path.join(outside, "secret.json"), "secret");
  const saved = await snapshot(local, "first");
  await fs.mkdir(path.join(remote, "projects"));
  await fs.symlink(outside, path.join(remote, "projects", "project-a"));
  const result = await syncToLocalPath(local, remote);
  expect(result.errors.length).toBeGreaterThan(0);
  await expect(fs.stat(path.join(remote, "manifests", "secret.json"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(fs.stat(path.join(outside, "snapshots", path.basename(saved.file)))).rejects.toMatchObject({ code: "ENOENT" });
});

it("reports conflicting immutable snapshot IDs and leaves both versions unchanged", async () => {
  const { local, remote } = await setup();
  const left = await snapshot(local, "same");
  const right = await snapshot(remote, "same", "project-19");
  const result = await syncToLocalPath(local, remote);
  expect(result.errors.length).toBeGreaterThan(0);
  await expect(fs.readFile(left.file, "utf8")).resolves.toBe(JSON.stringify(left.value));
  await expect(fs.readFile(right.file, "utf8")).resolves.toBe(JSON.stringify(right.value));
});

async function gitSetup() {
  const result = await setup();
  const bare = path.join(result.base, "bare.git");
  await exec("git", ["init", "-q", "-b", "main", result.local]);
  await exec("git", ["-C", result.local, "config", "user.email", "test@editvcs.local"]);
  await exec("git", ["-C", result.local, "config", "user.name", "EditVCS Test"]);
  await exec("git", ["init", "-q", "--bare", "-b", "main", bare]);
  await snapshot(result.local, "first");
  return { ...result, bare };
}

it("only sends current validated snapshot files and objects to a local bare Git remote", async () => {
  const { local, bare } = await gitSetup();
  await fs.writeFile(path.join(local, "registry.json"), "private absolute path");
  await fs.mkdir(path.join(local, "logs"));
  await fs.writeFile(path.join(local, "logs", "private.log"), "private logs");
  const result = await syncToGitHub(local, bare);
  expect(result).toEqual({ pushed: 1, pulled: 0, errors: [] });
  const tree = (await exec("git", ["--git-dir", bare, "ls-tree", "-r", "--name-only", "main"])).stdout.trim().split("\n");
  expect(tree).toEqual([
    "objects/be/bece1517ad0951232399798ccbc08c719b029c3c8f2423dd671eb86a720d2ae3",
    "projects/project-a/snapshots/first.json"
  ]);
  expect((await syncToGitHub(local, bare)).pushed).toBe(0);
});

it.each(["staged", "history"])("refuses Git sync when private data is already in %s", async location => {
  const { local, bare } = await gitSetup();
  await fs.writeFile(path.join(local, "registry.json"), "private absolute path");
  await exec("git", ["-C", local, "add", "registry.json"]);
  if (location === "history") {
    await exec("git", ["-C", local, "commit", "-q", "-m", "private data"]);
    await exec("git", ["-C", local, "rm", "-q", "registry.json"]);
    await exec("git", ["-C", local, "commit", "-q", "-m", "remove private data"]);
  }
  const result = await syncToGitHub(local, bare);
  expect(result.pushed).toBe(0);
  expect(result.errors.join(" ")).toMatch(/private|unsupported|unvalidated/i);
  expect((await exec("git", ["--git-dir", bare, "for-each-ref", "--format=%(refname)"])).stdout).toBe("");
});

it("refuses private registry data introduced and removed only in reachable merge commit trees", async () => {
  const { local, bare } = await gitSetup();
  const git = async (...args: string[]) => (await exec("git", ["-C", local, ...args])).stdout.trim();
  await git("add", "objects", "projects");
  await git("commit", "-q", "-m", "initial snapshot");
  const initial = await git("rev-parse", "HEAD");
  const cleanTree = await git("write-tree");
  const side = await git("commit-tree", cleanTree, "-p", initial, "-m", "side branch");
  await fs.writeFile(path.join(local, "registry.json"), "PRIVATE-MERGE-REGISTRY");
  await git("add", "registry.json");
  const privateTree = await git("write-tree");
  const privateMerge = await git("commit-tree", privateTree, "-p", initial, "-p", side, "-m", "merge with private registry");
  await git("rm", "-q", "-f", "registry.json");
  const cleanMerge = await git("commit-tree", cleanTree, "-p", privateMerge, "-p", side, "-m", "merge removing private registry");
  await git("update-ref", "refs/heads/main", cleanMerge);
  expect(await git("show", `${privateMerge}:registry.json`)).toBe("PRIVATE-MERGE-REGISTRY");

  const result = await syncToGitHub(local, bare);

  expect(result.pushed).toBe(0);
  expect(result.errors.join(" ")).toMatch(/history.*private|private.*history/i);
  expect((await exec("git", ["--git-dir", bare, "for-each-ref", "--format=%(refname)"])).stdout).toBe("");
  await expect(exec("git", ["--git-dir", bare, "show", `${privateMerge}:registry.json`])).rejects.toThrow();
});

it("reports fetch failures without creating a commit or claiming a successful push", async () => {
  const { local, base } = await gitSetup();
  const result = await syncToGitHub(local, path.join(base, "missing.git"));
  expect(result.pushed).toBe(0);
  expect(result.errors.join(" ")).toMatch(/fetch|remote/i);
  expect((await exec("git", ["-C", local, "for-each-ref", "--format=%(refname)", "refs/heads"])).stdout).toBe("");
});

it("reports commit failures and does not push an earlier revision", async () => {
  const { local, bare } = await gitSetup();
  await fs.writeFile(path.join(local, ".git", "hooks", "pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o700 });
  const result = await syncToGitHub(local, bare);
  expect(result.pushed).toBe(0);
  expect(result.errors.join(" ")).toMatch(/commit failed/i);
  expect((await exec("git", ["--git-dir", bare, "for-each-ref", "--format=%(refname)"])).stdout).toBe("");
});

it("reports push rejection without counting the local commit as pushed", async () => {
  const { local, bare } = await gitSetup();
  await fs.writeFile(path.join(bare, "hooks", "pre-receive"), "#!/bin/sh\nexit 1\n", { mode: 0o700 });
  const result = await syncToGitHub(local, bare);
  expect(result.pushed).toBe(0);
  expect(result.errors.join(" ")).toMatch(/push failed/i);
});

it("counts completed local copies even if an unrelated legacy source tree is rejected", async () => {
  const { base, local, remote } = await setup();
  await snapshot(local, "first");
  const outside = path.join(base, "outside"); await fs.mkdir(outside);
  await fs.symlink(outside, path.join(local, "manifests"));
  const result = await syncToLocalPath(local, remote);
  expect(result.pushed).toBe(2);
  expect(result.errors.length).toBeGreaterThan(0);
  await expect(fs.readFile(path.join(remote, "projects", "project-a", "snapshots", "first.json"), "utf8")).resolves.toContain('"id":"first"');
});

it("pushes to the supplied remote even when origin has a different configured push URL", async () => {
  const { base, local, bare } = await gitSetup();
  const other = path.join(base, "other.git");
  await exec("git", ["init", "-q", "--bare", "-b", "main", other]);
  await exec("git", ["-C", local, "remote", "add", "origin", bare]);
  await exec("git", ["-C", local, "remote", "set-url", "--push", "origin", other]);
  const result = await syncToGitHub(local, bare);
  expect(result).toEqual({ pushed: 1, pulled: 0, errors: [] });
  expect((await exec("git", ["--git-dir", bare, "for-each-ref", "--format=%(refname)"])).stdout.trim()).toBe("refs/heads/main");
  expect((await exec("git", ["--git-dir", other, "for-each-ref", "--format=%(refname)"])).stdout).toBe("");
});

it("preserves content-addressed bytes when Git attributes would normalize line endings", async () => {
  const { local, bare } = await gitSetup();
  const saved = await snapshot(local, "first", "line1\r\nline2\r\n");
  await fs.writeFile(path.join(local, ".git", "info", "attributes"), "objects/** text\n");
  const result = await syncToGitHub(local, bare);
  expect(result).toEqual({ pushed: 1, pulled: 0, errors: [] });
  const stored = (await exec("git", ["--git-dir", bare, "show", `main:objects/${saved.hash.slice(0, 2)}/${saved.hash}`])).stdout;
  expect(stored).toBe("line1\r\nline2\r\n");
});
