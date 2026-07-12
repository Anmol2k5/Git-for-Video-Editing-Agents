import { LocalSnapshotRepository, sanitizePathHint, hashFileSha256 } from "@editvcs/storage";
import { createSnapshotId } from "@editvcs/core";
import type { Snapshot, PremiereProjectManifest } from "@editvcs/shared-types";
import { waitForStableFile } from "./stable-write";
import path from "node:path";
import fs from "node:fs/promises";

// Reusable lock manager to serialize snapshot requests per project ID
class LockManager {
  private locks = new Map<string, Promise<void>>();

  async runExclusive<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.locks.get(projectId) || Promise.resolve();
    
    let resolveLock!: () => void;
    const nextLock = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.locks.set(projectId, nextLock);

    try {
      await existing;
      return await fn();
    } finally {
      resolveLock();
      if (this.locks.get(projectId) === nextLock) {
        this.locks.delete(projectId);
      }
    }
  }
}

const lockManager = new LockManager();
const MAX_MANIFEST_SIZE_BYTES = 1024 * 1024; // 1MB
const MAX_CLIPS_COUNT = 500;

export function createSnapshotService(options: { storageRoot: string }) {
  const repo = new LocalSnapshotRepository(options.storageRoot);

  return {
    async createManualSnapshot(opts: {
      projectId: string;
      projectPath: string;
      label: string;
      trigger?: "manual" | "automatic";
      manifest?: PremiereProjectManifest | null;
      manifestStatus?: "verified" | "best-effort" | "unavailable";
      manifestReason?: string;
    }): Promise<{ created: boolean; reason?: string; snapshot?: Snapshot }> {
      return lockManager.runExclusive(opts.projectId, async () => {
        // 1. Wait for file stability (stability check of 2 checks of mtime and size over timeout)
        await waitForStableFile(opts.projectPath, { intervalMs: 250, stableChecks: 3, timeoutMs: 10000 });

        // 2. Copy source file to a temporary file, with stat comparisons before and after
        const tempPath = await repo.createTempObjectPath();
        let attempts = 0;
        let copySuccess = false;

        while (attempts < 3) {
          try {
            const before = await fs.stat(opts.projectPath);
            await fs.copyFile(opts.projectPath, tempPath);
            const after = await fs.stat(opts.projectPath);

            if (before.size === after.size && before.mtimeMs === after.mtimeMs) {
              copySuccess = true;
              break;
            }
          } catch (err) {
            // Stat or copy error, count as a failed attempt
          }
          attempts++;
          if (attempts < 3) {
            await new Promise(r => setTimeout(r, 500));
          }
        }

        if (!copySuccess) {
          await fs.unlink(tempPath).catch(() => {});
          return {
            created: false,
            reason: "Premiere changed the project while EditVCS was copying it. Please try again."
          };
        }

        // 3. Compute hash on the temp copy
        const sha256 = await hashFileSha256(tempPath);

        // 4. Check for duplicate content (same SHA-256 in existing snapshots)
        const existing = await repo.listSnapshots(opts.projectId);
        if (existing.some((snap) => snap.projectFile.sha256 === sha256)) {
          await fs.unlink(tempPath).catch(() => {});
          return {
            created: false,
            reason: "No file changes detected since the last save point."
          };
        }

        // 5. Verify metadata payload limits
        let finalManifest: PremiereProjectManifest | undefined = undefined;
        let finalStatus = opts.manifestStatus ?? "unavailable";
        let finalReason = opts.manifestReason;

        if (opts.manifest) {
          try {
            const serialized = JSON.stringify(opts.manifest);
            
            // Check clip count limit
            let clipCount = 0;
            if (opts.manifest.sequences) {
              for (const seq of opts.manifest.sequences) {
                if (seq.clips) {
                  clipCount += seq.clips.length;
                }
              }
            }

            if (serialized.length > MAX_MANIFEST_SIZE_BYTES) {
              finalStatus = "unavailable";
              finalReason = "Timeline metadata exceeded the Phase-1 size limit.";
            } else if (clipCount > MAX_CLIPS_COUNT) {
              finalStatus = "unavailable";
              finalReason = "Timeline clip count exceeded the supported Phase-1 limit.";
            } else {
              finalManifest = opts.manifest;
              finalStatus = "verified";
            }
          } catch (err) {
            finalStatus = "unavailable";
            finalReason = "Invalid manifest metadata.";
          }
        }

        // 6. Publish the object atomically
        await repo.publishObject(tempPath, sha256);

        // 7. Write the snapshot manifest (referencing only hash, name, size, no absolute objectPath)
        const parsed = path.parse(opts.projectPath);
        const createdAt = new Date().toISOString();
        const snapId = createSnapshotId(opts.projectId, createdAt, sha256);
        const byteSize = (await fs.stat(opts.projectPath)).size;

        const snapshot: Snapshot = {
          schemaVersion: 1,
          id: snapId,
          projectId: opts.projectId,
          streamId: `stream_${opts.projectId}`,
          createdAt,
          createdBy: "local-user",
          trigger: opts.trigger ?? "manual",
          label: opts.label,
          projectFile: {
            originalFileName: parsed.base,
            sourceExtension: ".prproj",
            sha256,
            byteSize
          },
          manifest: finalManifest ?? {
            projectName: parsed.name,
            projectPathHint: sanitizePathHint(opts.projectPath),
            capturedAt: createdAt,
            sequences: []
          },
          manifestStatus: finalStatus,
          manifestReason: finalReason,
          cloudStatus: "local-only"
        };

        await repo.saveSnapshot(snapshot);

        return { created: true, snapshot };
      });
    },

    async listSnapshots(projectId?: string): Promise<Snapshot[]> {
      return repo.listSnapshots(projectId);
    },
    
    async checkHealth(): Promise<{ ok: boolean; error?: string }> {
      return repo.checkHealth();
    }
  };
}
