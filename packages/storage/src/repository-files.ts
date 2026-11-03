import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Snapshot } from "@editvcs/shared-types";
import { hashFileSha256 } from "./hash-file";
import { snapshotSchema, storageIdentifierSchema, sha256Schema } from "./schemas";

export function relativeRepositoryPath(root: string, file: string): string {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Path is outside the repository");
  }
  return relative;
}

/** Check each repository component with lstat; never traverse a symlink. */
export async function repositoryDirectory(root: string, relative = "", create = false): Promise<string> {
  const resolvedRoot = path.resolve(root);
  const target = relative ? path.resolve(resolvedRoot, relative) : resolvedRoot;
  if (relative) relativeRepositoryPath(resolvedRoot, target);
  if (create) await fs.mkdir(resolvedRoot, { recursive: true });
  let current = resolvedRoot;
  const components = relative ? path.relative(resolvedRoot, target).split(path.sep) : [];
  for (let i = -1; i < components.length; i++) {
    if (i >= 0) {
      current = path.join(current, components[i]);
      if (create) await fs.mkdir(current).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      });
    }
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Repository directory must not be a symlink or special file");
  }
  return target;
}

export async function repositoryFile(root: string, relative: string): Promise<string> {
  const file = path.resolve(root, relative);
  relativeRepositoryPath(root, file);
  await repositoryDirectory(root, path.dirname(relative) === "." ? "" : path.dirname(relative));
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Repository file must be a regular file, not a symlink or special file");
  return file;
}

export function snapshotPathIdentity(relative: string): { projectId: string; snapshotId: string } {
  const parts = relative.split(path.sep);
  if (parts.length !== 4 || parts[0] !== "projects" || parts[2] !== "snapshots" || !parts[3].endsWith(".json")) {
    throw new Error("Snapshot is outside the current snapshot layout");
  }
  return { projectId: storageIdentifierSchema.parse(parts[1]), snapshotId: storageIdentifierSchema.parse(parts[3].slice(0, -5)) };
}

export async function readRepositorySnapshot(root: string, relative: string): Promise<Snapshot> {
  const identity = snapshotPathIdentity(relative);
  const file = await repositoryFile(root, relative);
  const snapshot = snapshotSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
  if (snapshot.projectId !== identity.projectId || snapshot.id !== identity.snapshotId) {
    throw new Error("Snapshot identity does not match its repository path");
  }
  return snapshot as Snapshot;
}

export async function verifyRepositoryObject(root: string, hash: string, byteSize?: number): Promise<string> {
  sha256Schema.parse(hash);
  const object = await repositoryFile(root, path.join("objects", hash.slice(0, 2), hash));
  const stat = await fs.lstat(object);
  if ((byteSize !== undefined && stat.size !== byteSize) || await hashFileSha256(object) !== hash) {
    throw new Error("Stored object failed hash or byte-size integrity verification");
  }
  return object;
}

/** Publish complete bytes exclusively; existing immutable data is never replaced. */
export async function writeRepositoryFileExclusive(root: string, relative: string, content: Buffer | string): Promise<void> {
  const directory = await repositoryDirectory(root, path.dirname(relative), true);
  const destination = path.join(directory, path.basename(relative));
  const temp = path.join(directory, `.sync-${randomUUID()}.tmp`);
  const file = await fs.open(temp, "wx", 0o600);
  try {
    await file.writeFile(content);
    await file.sync();
    await file.close();
    await fs.link(temp, destination);
  } finally {
    await file.close().catch(() => {});
    await fs.unlink(temp).catch(() => {});
  }
}
