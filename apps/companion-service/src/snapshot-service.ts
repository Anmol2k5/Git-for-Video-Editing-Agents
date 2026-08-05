import { LocalSnapshotRepository, sanitizePathHint, hashFileSha256 } from "@editvcs/storage";
import { createSnapshotId } from "@editvcs/core";
import type { Snapshot, PremiereProjectManifest, ProjectId, SnapshotId, StreamId } from "@editvcs/shared-types";
import { createId } from "@editvcs/shared-types";
import { waitForStableFile } from "./stable-write";
import path from "node:path";
import fs from "node:fs/promises";

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

export interface CreateManualSnapshotOpts {
  projectId: string;
  projectPath: string;
  label: string;
  trigger?: "manual" | "automatic";
  manifest?: PremiereProjectManifest | null;
  manifestStatus?: "verified" | "best-effort" | "unavailable";
  manifestReason?: string;
}

export interface SnapshotService {
  createManualSnapshot(opts: CreateManualSnapshotOpts): Promise<{ created: boolean; reason?: string; snapshot?: Snapshot }>;
  listSnapshots(projectId?: string): Promise<Snapshot[]>;
  checkHealth(): Promise<{ ok: boolean; error?: string }>;
}

export function createSnapshotService(options: { storageRoot: string }): SnapshotService {
  const repo = new LocalSnapshotRepository(options.storageRoot);

  return {
    async createManualSnapshot(opts: CreateManualSnapshotOpts): Promise<{ created: boolean; reason?: string; snapshot?: Snapshot }> {
      return lockManager.runExclusive(opts.projectId, async () => {
        await waitForStableFile(opts.projectPath, { intervalMs: 250, stableChecks: 3, timeoutMs: 10000 });

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
            // Stat or copy error
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

        const sha256 = await hashFileSha256(tempPath);

        const existing = await repo.listSnapshots(opts.projectId);
        const latest = existing[0];
        const sameAsLatest = latest?.projectFile.sha256 === sha256;
        if (sameAsLatest) {
          await fs.unlink(tempPath).catch(() => {});
          return {
            created: false,
            reason: "No file changes detected since the last save point."
          };
        }

        const nextSequenceNumber =
          existing.length === 0
            ? 1
            : Math.max(
                ...existing.map((snapshot) => snapshot.sequenceNumber ?? 0)
              ) + 1;

        const tempStat = await fs.stat(tempPath);
        const byteSize = tempStat.size;

        let finalManifest: PremiereProjectManifest | undefined = undefined;
        let finalStatus = opts.manifestStatus ?? "unavailable";
        let finalReason = opts.manifestReason;

        if (opts.manifest) {
          try {
            const serialized = JSON.stringify(opts.manifest);
            
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
              finalManifest = { ...opts.manifest, host: "premiere" };
              finalStatus = "verified";
            }
          } catch (err) {
            finalStatus = "unavailable";
            finalReason = "Invalid manifest metadata.";
          }
        }

        await repo.publishObject(tempPath, sha256);

        const parsed = path.parse(opts.projectPath);
        const createdAt = new Date().toISOString();
        const snapId = createSnapshotId(opts.projectId, createdAt, sha256);

        const snapshot: Snapshot = {
          schemaVersion: 1,
          id: createId<SnapshotId>(snapId),
          projectId: createId<ProjectId>(opts.projectId),
          streamId: createId<StreamId>(`stream_${opts.projectId}`),
          sequenceNumber: nextSequenceNumber,
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
            host: "premiere",
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
