import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { hashFileSha256 } from "./hash-file";
import { snapshotSchema, storageIdentifierSchema } from "./schemas";
import { repositoryDirectory, repositoryFile, snapshotPathIdentity, verifyRepositoryObject, writeRepositoryFileExclusive } from "./repository-files";

const execFileAsync = promisify(execFile);

export type SyncTargetType = "local" | "github";
export interface LocalSyncTarget { type: "local"; path: string; }
export interface GitHubSyncTarget { type: "github"; remoteUrl: string; }
export type SyncTarget = LocalSyncTarget | GitHubSyncTarget;
export interface SyncResult { pushed: number; pulled: number; errors: string[]; }

type SnapshotTransfer = { relative: string; bytes: Buffer; hash: string; byteSize: number };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

async function listDirectory(root: string, relative: string): Promise<string[]> {
  try { return await fs.readdir(await repositoryDirectory(root, relative)); }
  catch (error) { if (missing(error)) return []; throw error; }
}

async function collectSnapshots(root: string, errors: string[]): Promise<SnapshotTransfer[]> {
  const snapshots: SnapshotTransfer[] = [];
  for (const projectId of await listDirectory(root, "projects")) {
    try {
      storageIdentifierSchema.parse(projectId);
      const directory = path.join("projects", projectId, "snapshots");
      for (const name of await listDirectory(root, directory)) {
        if (!name.endsWith(".json")) continue;
        const relative = path.join(directory, name);
        try {
          const identity = snapshotPathIdentity(relative);
          const bytes = await fs.readFile(await repositoryFile(root, relative));
          const snapshot = snapshotSchema.parse(JSON.parse(bytes.toString("utf8")));
          if (snapshot.projectId !== identity.projectId || snapshot.id !== identity.snapshotId) throw new Error("Snapshot identity does not match its repository path");
          await verifyRepositoryObject(root, snapshot.projectFile.sha256, snapshot.projectFile.byteSize);
          snapshots.push({ relative, bytes, hash: snapshot.projectFile.sha256, byteSize: snapshot.projectFile.byteSize });
        } catch (error) { errors.push(`Snapshot ${projectId}/${name}: ${message(error)}`); }
      }
    } catch (error) { errors.push(`Project ${projectId}: ${message(error)}`); }
  }
  return snapshots;
}

async function existingFile(root: string, relative: string): Promise<string | null> {
  try { return await repositoryFile(root, relative); }
  catch (error) { if (missing(error)) return null; throw error; }
}

/** Copy only verified object bytes, checking again after the filesystem copy. */
async function copyObject(source: string, destination: string, hash: string, byteSize?: number): Promise<number> {
  const relative = path.join("objects", hash.slice(0, 2), hash);
  const sourceFile = await verifyRepositoryObject(source, hash, byteSize);
  if (await existingFile(destination, relative)) {
    await verifyRepositoryObject(destination, hash, byteSize);
    return 0;
  }
  const directory = await repositoryDirectory(destination, path.dirname(relative), true);
  const temp = path.join(directory, `.sync-${randomUUID()}.tmp`);
  try {
    await fs.copyFile(sourceFile, temp, fs.constants.COPYFILE_EXCL);
    const stat = await fs.lstat(temp);
    if ((byteSize !== undefined && stat.size !== byteSize) || await hashFileSha256(temp) !== hash) throw new Error("Copied object failed hash or byte-size integrity verification");
    try { await fs.link(temp, path.join(directory, hash)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await verifyRepositoryObject(destination, hash, byteSize);
      return 0;
    }
    return 1;
  } finally { await fs.unlink(temp).catch(() => {}); }
}

async function copySnapshot(destination: string, snapshot: SnapshotTransfer): Promise<number> {
  try { await writeRepositoryFileExclusive(destination, snapshot.relative, snapshot.bytes); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const file = await repositoryFile(destination, snapshot.relative);
    if (!(await fs.readFile(file)).equals(snapshot.bytes)) throw new Error("Conflicting immutable snapshot ID; manual resolution is required");
    return 0;
  }
  return 1;
}

async function syncDirection(source: string, destination: string, errors: string[]): Promise<number> {
  await repositoryDirectory(source);
  await repositoryDirectory(destination, "", true);
  let copied = 0;
  const snapshots = await collectSnapshots(source, errors);
  for (const snapshot of snapshots) {
    try {
      // Detect immutable ID conflicts before copying the corresponding object.
      const existing = await existingFile(destination, snapshot.relative);
      if (existing && !(await fs.readFile(existing)).equals(snapshot.bytes)) throw new Error("Conflicting immutable snapshot ID; manual resolution is required");
      // Validate destination directories before creating any snapshot's objects.
      await repositoryDirectory(destination, path.dirname(snapshot.relative), true);
      copied += await copyObject(source, destination, snapshot.hash, snapshot.byteSize);
      copied += await copySnapshot(destination, snapshot);
    } catch (error) { errors.push(`Snapshot ${snapshot.relative}: ${message(error)}`); }
  }

  // Older repositories used manifests/*.json. Preserve local-only compatibility,
  // without recursive copying or treating arbitrary root files as sync data.
  try {
    const legacy = (await listDirectory(source, "manifests")).filter(name => /^[A-Za-z0-9][A-Za-z0-9_.-]*\.json$/.test(name));
    for (const name of legacy) {
      try {
        const relative = path.join("manifests", name);
        const sourceFile = await repositoryFile(source, relative);
        if (await existingFile(destination, relative)) continue; // Legacy IDs remain non-overwriting.
        const bytes = await fs.readFile(sourceFile);
        JSON.parse(bytes.toString("utf8"));
        try { await writeRepositoryFileExclusive(destination, relative, bytes); copied++; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      } catch (error) { errors.push(`Legacy manifest ${name}: ${message(error)}`); }
    }
    if (legacy.length > 0) {
      for (const prefix of await listDirectory(source, "objects")) {
        if (!/^[a-f0-9]{2}$/.test(prefix)) continue;
        for (const hash of await listDirectory(source, path.join("objects", prefix))) {
          if (!/^[a-f0-9]{64}$/.test(hash) || !hash.startsWith(prefix)) continue;
          try { copied += await copyObject(source, destination, hash); }
          catch (error) { errors.push(`Legacy object ${hash}: ${message(error)}`); }
        }
      }
    }
  } catch (error) { errors.push(`Legacy sync: ${message(error)}`); }
  return copied;
}

/** Non-overwriting two-way sync of snapshot metadata and verified project objects. */
export async function syncToLocalPath(localRoot: string, remotePath: string): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, errors: [] };
  for (const [source, destination, key] of [[localRoot, remotePath, "pushed"], [remotePath, localRoot, "pulled"]] as const) {
    const errors: string[] = [];
    try { result[key] = await syncDirection(source, destination, errors); }
    catch (error) { errors.push(message(error)); }
    result.errors.push(...errors.map(error => `${key === "pushed" ? "Push" : "Pull"} error: ${error}`));
  }
  return result;
}

function allowedGitPath(file: string): boolean {
  if (/^objects\/[a-f0-9]{2}\/[a-f0-9]{64}$/.test(file)) {
    const parts = file.split("/");
    return parts[2].startsWith(parts[1]);
  }
  try { snapshotPathIdentity(file.split("/").join(path.sep)); return true; }
  catch { return false; }
}

/** Push an explicit allowlist; never merge, rebase, force push, or stage private files. */
export async function syncToGitHub(localRoot: string, remoteUrl: string): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, errors: [] };
  const git = async (...args: string[]) => (await execFileAsync("git", args, { cwd: localRoot, maxBuffer: 16 * 1024 * 1024 })).stdout.trim();
  try {
    await repositoryDirectory(localRoot);
    if (!remoteUrl.trim() || remoteUrl.startsWith("-") || /[\r\n\0]/.test(remoteUrl)) throw new Error("Invalid Git remote URL");
    try {
      const stat = await fs.lstat(path.join(localRoot, ".git"));
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Sync requires a contained Git directory");
    } catch (error) {
      if (!missing(error)) throw error;
      await git("init", "-b", "main");
    }
    if (await git("symbolic-ref", "--short", "HEAD") !== "main") throw new Error("Git sync requires the main branch; switch branches manually");
    const snapshots = await collectSnapshots(localRoot, result.errors);
    if (result.errors.length > 0) return result;
    const files = new Set<string>();
    for (const snapshot of snapshots) {
      files.add(snapshot.relative.split(path.sep).join("/"));
      files.add(`objects/${snapshot.hash.slice(0, 2)}/${snapshot.hash}`);
    }
    const hasHead = (await git("for-each-ref", "--format=%(refname)", "refs/heads/main")) === "refs/heads/main";
    const assertHistoryPrivateDataAbsent = async () => {
      // Diff-based logs omit merge changes. Inspect every distinct tree reachable
      // from HEAD, including both merge parents and the merge commit's own tree.
      const revisions = await git("--no-replace-objects", "rev-list", "--format=%T", "HEAD");
      const trees = new Set(revisions.split("\n").filter(line => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(line)));
      for (const tree of trees) {
        const paths = (await git("--no-replace-objects", "ls-tree", "-r", "--name-only", "-z", tree)).split("\0").filter(Boolean);
        if (paths.some(file => !allowedGitPath(file))) throw new Error("Git history contains private or unsupported files; refusing to push");
      }
    };
    const assertPrivateDataAbsent = async () => {
      const tracked = (await git("ls-files", "-z")).split("\0").filter(Boolean);
      if (tracked.some(file => !allowedGitPath(file) || !files.has(file))) throw new Error("Git index contains private, unsupported, or unvalidated files; use a fresh sync repository");
      if (hasHead) await assertHistoryPrivateDataAbsent();
    };
    await assertPrivateDataAbsent();
    const remotes = (await git("remote")).split("\n");
    if (remotes.includes("origin")) await git("remote", "set-url", "origin", remoteUrl);
    else await git("remote", "add", "origin", remoteUrl);

    // ls-remote distinguishes an empty remote from authentication/transport failures.
    let remoteHead: string;
    try { remoteHead = await git("ls-remote", "--heads", "origin", "refs/heads/main"); }
    catch (error) { throw new Error(`Git remote fetch failed: ${message(error)}`); }
    if (remoteHead) {
      try { await git("fetch", "origin", "refs/heads/main:refs/remotes/origin/main"); }
      catch (error) { throw new Error(`Git remote fetch failed: ${message(error)}`); }
      if (!hasHead || Number(await git("rev-list", "--count", "HEAD..refs/remotes/origin/main")) > 0) {
        throw new Error("Remote has changes EditVCS did not create. EditVCS does not auto-merge; resolve the history manually or use a fresh repository.");
      }
    }
    for (const file of files) {
      await repositoryFile(localRoot, file.split("/").join(path.sep));
      // git add can rewrite objects through attributes, clean filters, or CRLF
      // conversion. Store the exact verified bytes in the index instead.
      const blob = await git("hash-object", "-w", "--no-filters", "--", file);
      await git("update-index", "--add", "--cacheinfo", "100644", blob, file);
    }
    if (await git("diff", "--cached", "--name-only")) {
      try { await git("commit", "-m", `EditVCS sync ${new Date().toISOString()}`); }
      catch (error) { throw new Error(`Git commit failed: ${message(error)}`); }
    } else if (!hasHead) return result;
    // Hooks and pre-existing history must not introduce private files into a push.
    await assertHistoryPrivateDataAbsent();
    const ahead = Number(await git("rev-list", "--count", remoteHead ? "refs/remotes/origin/main..HEAD" : "HEAD"));
    if (ahead === 0) return result;
    // An existing origin.pushurl must not redirect data away from the supplied target.
    try { await git("push", remoteUrl, "HEAD:refs/heads/main"); }
    catch (error) { throw new Error(`GitHub push failed: ${message(error)}`); }
    result.pushed = ahead;
  } catch (error) { result.errors.push(`GitHub sync error: ${message(error)}`); }
  return result;
}

export async function sync(localRoot: string, target: SyncTarget): Promise<SyncResult> {
  switch (target.type) {
    case "local": return syncToLocalPath(localRoot, target.path);
    case "github": return syncToGitHub(localRoot, target.remoteUrl);
    default: return { pushed: 0, pulled: 0, errors: ["Unknown sync target type"] };
  }
}
