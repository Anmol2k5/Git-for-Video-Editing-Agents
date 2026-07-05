import { LocalSnapshotRepository } from "@editvcs/storage";
import { createSnapshotId } from "@editvcs/core";
import type { Snapshot } from "@editvcs/shared-types";
import path from "node:path";
import fs from "node:fs/promises";

export function createSnapshotService(options: { storageRoot: string }) {
  const repo = new LocalSnapshotRepository(options.storageRoot);

  return {
    async createManualSnapshot(opts: { projectPath: string; label: string }): Promise<{ created: boolean; snapshot?: Snapshot }> {
      const { sha256, objectPath } = await repo.storeProjectObject(opts.projectPath);
      
      const parsed = path.parse(opts.projectPath);
      const projectId = `proj_mock`;
      const createdAt = new Date().toISOString();
      const snapId = createSnapshotId(projectId, createdAt, sha256);

      // Check existing manifests for duplicate sha256
      let isDuplicate = false;
      try {
        const manifestsDir = path.join(options.storageRoot, "manifests");
        const files = await fs.readdir(manifestsDir);
        for (const file of files) {
          const content = await fs.readFile(path.join(manifestsDir, file), "utf-8");
          const snap = JSON.parse(content) as Snapshot;
          if (snap.projectFile.sha256 === sha256) {
            isDuplicate = true;
            break;
          }
        }
      } catch {
        // Ignored
      }
      if (isDuplicate) {
        return { created: false };
      }

      const snapshot: Snapshot = {
        id: snapId,
        projectId,
        streamId: "stream_mock",
        createdAt,
        createdBy: "local-user",
        trigger: "manual",
        label: opts.label,
        projectFile: {
          originalFileName: parsed.base,
          sourceExtension: ".prproj",
          sha256,
          byteSize: 1024,
          objectPath
        },
        manifest: {
          projectName: parsed.name,
          projectPathHint: opts.projectPath,
          capturedAt: createdAt,
          sequences: []
        },
        cloudStatus: "local-only"
      };

      await repo.saveSnapshot(snapshot);

      return { created: true, snapshot };
    },

    async listSnapshots(projectId?: string): Promise<Snapshot[]> {
      await repo.init();
      const manifestsDir = path.join(options.storageRoot, "manifests");
      const files = await fs.readdir(manifestsDir);
      const snapshots = await Promise.all(
        files
          .filter((file) => file.endsWith(".json"))
          .map(async (file) => {
            const content = await fs.readFile(path.join(manifestsDir, file), "utf8");
            return JSON.parse(content) as Snapshot;
          })
      );

      return snapshots
        .filter((snapshot) => !projectId || snapshot.projectId === projectId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }
  };
}
