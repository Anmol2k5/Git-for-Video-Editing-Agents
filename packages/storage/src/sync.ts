import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ─── Types ──────────────────────────────────────────────────────────────────

export type SyncTargetType = "local" | "github";

export interface LocalSyncTarget {
  type: "local";
  /** Absolute path to the remote repository root (NAS share, Google Drive folder, or any local dir) */
  path: string;
}

export interface GitHubSyncTarget {
  type: "github";
  /** GitHub remote URL (HTTPS or SSH) */
  remoteUrl: string;
}

export type SyncTarget = LocalSyncTarget | GitHubSyncTarget;

export interface SyncResult {
  pushed: number;
  pulled: number;
  errors: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Copy files that exist in `srcDir` but not in `destDir` (non-recursive, single level). */
async function copyMissing(srcDir: string, destDir: string): Promise<number> {
  await fs.mkdir(destDir, { recursive: true });

  let srcFiles: string[];
  try {
    srcFiles = await fs.readdir(srcDir);
  } catch {
    return 0; // source dir doesn't exist yet — nothing to copy
  }

  const destFiles = new Set(await fs.readdir(destDir).catch(() => [] as string[]));
  let copied = 0;

  for (const file of srcFiles) {
    if (!destFiles.has(file)) {
      const srcPath = path.join(srcDir, file);
      const destPath = path.join(destDir, file);
      const stat = await fs.stat(srcPath);

      if (stat.isDirectory()) {
        // Recurse into sub-dirs (e.g. objects/ab/)
        copied += await copyMissing(srcPath, destPath);
      } else {
        const tmpPath = `${destPath}.tmp-${process.pid}`;
        await fs.copyFile(srcPath, tmpPath);
        await fs.rename(tmpPath, destPath);
        copied++;
      }
    }
  }

  return copied;
}

// ─── Local / NAS Sync ───────────────────────────────────────────────────────

/**
 * Two-way sync between a local EditVCS repository and a remote one living on
 * a NAS, Google Drive folder, or any mounted filesystem path.
 *
 * Both repositories share the same directory structure:
 *   <root>/manifests/*.json
 *   <root>/objects/<prefix>/<sha256>
 */
export async function syncToLocalPath(
  localRoot: string,
  remotePath: string
): Promise<SyncResult> {
  const errors: string[] = [];

  // Ensure remote repo structure exists
  for (const sub of ["manifests", "objects", "versions", "previews", "logs"]) {
    await fs.mkdir(path.join(remotePath, sub), { recursive: true });
  }

  let pushed = 0;
  let pulled = 0;

  try {
    // Push: local → remote
    pushed += await copyMissing(
      path.join(localRoot, "manifests"),
      path.join(remotePath, "manifests")
    );
    pushed += await copyMissing(
      path.join(localRoot, "objects"),
      path.join(remotePath, "objects")
    );
  } catch (err) {
    errors.push(`Push error: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    // Pull: remote → local
    pulled += await copyMissing(
      path.join(remotePath, "manifests"),
      path.join(localRoot, "manifests")
    );
    pulled += await copyMissing(
      path.join(remotePath, "objects"),
      path.join(localRoot, "objects")
    );
  } catch (err) {
    errors.push(`Pull error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { pushed, pulled, errors };
}

// ─── GitHub Sync ────────────────────────────────────────────────────────────

/**
 * Sync local EditVCS repo to a GitHub remote by wrapping it in a hidden
 * git repository. Performs:
 *   1. git init (if needed)
 *   2. git remote add/set-url
 *   3. git add + commit
 *   4. git pull --rebase
 *   5. git push
 */
export async function syncToGitHub(
  localRoot: string,
  remoteUrl: string
): Promise<SyncResult> {
  const errors: string[] = [];
  let pushed = 0;
  let pulled = 0;

  const git = async (...args: string[]) => {
    const { stdout } = await execFileAsync("git", args, { cwd: localRoot });
    return stdout.trim();
  };

  try {
    // 1. Ensure git repo exists
    try {
      await fs.stat(path.join(localRoot, ".git"));
    } catch {
      await git("init");
      await git("checkout", "-b", "main");
    }

    // 2. Configure remote
    try {
      await git("remote", "add", "origin", remoteUrl);
    } catch {
      await git("remote", "set-url", "origin", remoteUrl);
    }

    // 3. Stage everything and commit
    await git("add", "-A");
    try {
      const timestamp = new Date().toISOString();
      await git("commit", "-m", `EditVCS sync ${timestamp}`);
      pushed = 1;
    } catch {
      // Nothing to commit — that's fine
    }

    // 4. Pull with rebase (to get teammate's snapshots)
    try {
      await git("pull", "--rebase", "origin", "main");
      pulled = 1;
    } catch {
      // First push or no remote history yet — fine
    }

    // 5. Push
    try {
      await git("push", "-u", "origin", "main");
    } catch (err) {
      errors.push(`GitHub push failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } catch (err) {
    errors.push(`GitHub sync error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { pushed, pulled, errors };
}

// ─── Unified dispatcher ─────────────────────────────────────────────────────

export async function sync(
  localRoot: string,
  target: SyncTarget
): Promise<SyncResult> {
  switch (target.type) {
    case "local":
      return syncToLocalPath(localRoot, target.path);
    case "github":
      return syncToGitHub(localRoot, target.remoteUrl);
    default:
      return { pushed: 0, pulled: 0, errors: ["Unknown sync target type"] };
  }
}
