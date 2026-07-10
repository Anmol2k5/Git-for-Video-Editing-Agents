import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncToLocalPath, syncToGitHub } from "./sync";

const execFileAsync = promisify(execFile);
const git = async (cwd: string, ...args: string[]) =>
  execFileAsync("git", args, { cwd });

describe("local / NAS sync", () => {
  let local: string;
  let remote: string;

  beforeEach(async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "editvcs-sync-"));
    local = path.join(base, "local", ".editvcs");
    remote = path.join(base, "remote", ".editvcs");
    await mkdir(path.join(local, "manifests"), { recursive: true });
    await mkdir(path.join(local, "objects"), { recursive: true });
  });

  afterEach(async () => {
    await rm(path.dirname(local), { recursive: true, force: true });
  });

  it("pushes new snapshots and pulls remote-only snapshots", async () => {
    await writeFile(path.join(local, "manifests", "a.json"), "{}");
    await writeFile(path.join(local, "objects", "obj-a"), "data-a");

    // Remote starts with its own snapshot.
    await mkdir(path.join(remote, "manifests"), { recursive: true });
    await mkdir(path.join(remote, "objects"), { recursive: true });
    await writeFile(path.join(remote, "manifests", "b.json"), "{}");

    const result = await syncToLocalPath(local, remote);

    expect(result.errors).toEqual([]);
    expect(result.pushed).toBe(2); // a.json + obj-a
    expect(result.pulled).toBe(1); // b.json

    await expect(readFile(path.join(remote, "manifests", "a.json"), "utf8")).resolves.toBe("{}");
    await expect(readFile(path.join(local, "manifests", "b.json"), "utf8")).resolves.toBe("{}");
  });

  it("never overwrites a file that already exists at the destination", async () => {
    await writeFile(path.join(local, "manifests", "same.json"), "local-version");
    await mkdir(path.join(remote, "manifests"), { recursive: true });
    await writeFile(path.join(remote, "manifests", "same.json"), "remote-version");

    const result = await syncToLocalPath(local, remote);

    expect(result.errors).toEqual([]);
    // Both sides already had the file, so nothing is copied either way.
    expect(result.pushed).toBe(0);
    expect(result.pulled).toBe(0);
    await expect(readFile(path.join(local, "manifests", "same.json"), "utf8")).resolves.toBe("local-version");
  });
});

describe("GitHub sync", () => {
  async function setup() {
    const base = await mkdtemp(path.join(os.tmpdir(), "editvcs-gh-"));
    const repo = path.join(base, "repo", ".editvcs");
    const bare = path.join(base, "bare.git");
    const clonedRoot = path.join(base, "cloned");
    await mkdir(repo, { recursive: true });
    await writeFile(path.join(repo, "snapshot.json"), "v1");
    await execFileAsync("git", ["init", "-q", repo]);
    // syncToGitHub skips `git init`/`checkout -b main` when .git already exists,
    // so create the main branch here to match what it would otherwise create.
    await execFileAsync("git", ["-C", repo, "checkout", "-b", "main"]);
    await execFileAsync("git", ["-C", repo, "config", "user.email", "test@editvcs.local"]);
    await execFileAsync("git", ["-C", repo, "config", "user.name", "EditVCS Test"]);
    await execFileAsync("git", ["init", "-q", "--bare", "-b", "main", bare]);
    return { base, repo, bare, clonedRoot };
  }

  it("pushes the local repository to a remote", async () => {
    const { base, repo, bare, clonedRoot } = await setup();
    try {
      const result = await syncToGitHub(repo, bare);
      expect(result.errors).toEqual([]);
      expect(result.pushed).toBe(1);

      // The remote should now contain the snapshot file (the .editvcs dir is the repo root).
      await execFileAsync("git", ["clone", "-q", bare, clonedRoot]);
      await expect(readFile(path.join(clonedRoot, "snapshot.json"), "utf8")).resolves.toBe("v1");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("does not auto-merge when the remote has diverged", async () => {
    const { base, repo, bare, clonedRoot } = await setup();
    try {
      // First push succeeds.
      await syncToGitHub(repo, bare);

      // Simulate a teammate's commit on the remote that local does not have.
      await execFileAsync("git", ["clone", "-q", bare, clonedRoot]);
      await execFileAsync("git", ["-C", clonedRoot, "config", "user.email", "test@editvcs.local"]);
      await execFileAsync("git", ["-C", clonedRoot, "config", "user.name", "EditVCS Test"]);
      await writeFile(path.join(clonedRoot, "teammate.json"), "from-teammate");
      await git(clonedRoot, "add", "-A");
      await git(clonedRoot, "commit", "-q", "-m", "teammate change");
      await git(clonedRoot, "push", "-q", "origin", "main");

      // Local change then sync again — should refuse to merge, not pull --rebase.
      await writeFile(path.join(repo, "local.json"), "from-local");
      const result = await syncToGitHub(repo, bare);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/does not auto-merge/i);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
