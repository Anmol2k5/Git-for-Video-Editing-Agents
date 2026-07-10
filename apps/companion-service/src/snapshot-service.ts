import { LocalSnapshotRepository, sanitizePathHint } from "@editvcs/storage";
import { createProjectId, createSnapshotId } from "@editvcs/core";
import type { Snapshot } from "@editvcs/shared-types";
import path from "node:path";
import fs from "node:fs/promises";

export function createSnapshotService(options: { storageRoot: string }) {
  const repo = new LocalSnapshotRepository(options.storageRoot);

  return {
    async createManualSnapshot(opts: { projectPath: string; label: string }): Promise<{ created: boolean; snapshot?: Snapshot }> {
      const { sha256, objectPath } = await repo.storeProjectObject(opts.projectPath);

      // Deduplicate identical project contents before writing a new snapshot.
      const existing = await repo.listSnapshots();
      if (existing.some((snap) => snap.projectFile.sha256 === sha256)) {
        return { created: false };
      }

      const parsed = path.parse(opts.projectPath);
      const projectId = createProjectId("premiere", opts.projectPath);
      const createdAt = new Date().toISOString();
      const snapId = createSnapshotId(projectId, createdAt, sha256);
      const byteSize = (await fs.stat(opts.projectPath)).size;

      const snapshot: Snapshot = {
        id: snapId,
        projectId,
        streamId: `stream_${projectId}`,
        createdAt,
        createdBy: "local-user",
        trigger: "manual",
        label: opts.label,
        projectFile: {
          originalFileName: parsed.base,
          sourceExtension: ".prproj",
          sha256,
          byteSize,
          objectPath
        },
        manifest: {
          projectName: parsed.name,
          projectPathHint: sanitizePathHint(opts.projectPath),
          capturedAt: createdAt,
          sequences: []
        },
        cloudStatus: "local-only"
      };

      await repo.saveSnapshot(snapshot);

      return { created: true, snapshot };
    },

    async listSnapshots(projectId?: string): Promise<Snapshot[]> {
      return repo.listSnapshots(projectId);
    }
  };
}
