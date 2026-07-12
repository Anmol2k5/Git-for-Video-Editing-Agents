import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hashFileSha256 } from "./hash-file";
import type { Snapshot } from "@editvcs/shared-types";
import { writeJsonAtomic } from "./write-json";

export class LocalSnapshotRepository {
  constructor(private rootDir: string) {}

  async init(): Promise<void> {
    await fs.mkdir(path.join(this.rootDir, "objects"), { recursive: true });
    await fs.mkdir(path.join(this.rootDir, "objects", ".tmp"), { recursive: true });
    await fs.mkdir(path.join(this.rootDir, "temp"), { recursive: true });
    await fs.mkdir(path.join(this.rootDir, "logs"), { recursive: true });
  }

  async checkHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.init();
      const testFile = path.join(this.rootDir, `.health-${Date.now()}`);
      await fs.writeFile(testFile, "ok");
      await fs.unlink(testFile);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  async createTempObjectPath(): Promise<string> {
    await this.init();
    return path.join(this.rootDir, "objects", ".tmp", `${randomUUID()}.tmp`);
  }

  async publishObject(tempPath: string, expectedHash: string): Promise<string> {
    await this.init();
    const prefix = expectedHash.slice(0, 2);
    const objectDir = path.join(this.rootDir, "objects", prefix);
    await fs.mkdir(objectDir, { recursive: true });
    
    const finalPath = path.join(objectDir, expectedHash);
    
    try {
      const existingStat = await fs.stat(finalPath);
      const tempStat = await fs.stat(tempPath);
      if (existingStat.size === tempStat.size) {
        const existingHash = await hashFileSha256(finalPath);
        if (existingHash === expectedHash) {
          await fs.unlink(tempPath).catch(() => {});
          return finalPath;
        }
      }
    } catch {
      // Proceed to rename
    }

    await fs.rename(tempPath, finalPath);
    return finalPath;
  }

  async storeProjectObject(sourcePath: string) {
    const tempPath = await this.createTempObjectPath();
    await fs.copyFile(sourcePath, tempPath);
    const sha256 = await hashFileSha256(tempPath);
    const finalPath = await this.publishObject(tempPath, sha256);
    return {
      sha256,
      objectPath: finalPath
    };
  }

  async saveSnapshot(snapshot: Snapshot) {
    await this.init();
    const snapDir = path.join(this.rootDir, "projects", snapshot.projectId, "snapshots");
    await fs.mkdir(snapDir, { recursive: true });
    await writeJsonAtomic(path.join(snapDir, `${snapshot.id}.json`), snapshot);
  }

  async listSnapshots(projectId?: string): Promise<Snapshot[]> {
    await this.init();
    const snapshots: Snapshot[] = [];

    if (projectId) {
      const snapDir = path.join(this.rootDir, "projects", projectId, "snapshots");
      try {
        const files = await fs.readdir(snapDir);
        for (const file of files) {
          if (file.endsWith(".json")) {
            const content = await fs.readFile(path.join(snapDir, file), "utf8");
            snapshots.push(JSON.parse(content) as Snapshot);
          }
        }
      } catch (err: any) {
        if (err.code !== "ENOENT") {
          console.error(`Failed to read snapshots for project ${projectId}:`, err);
        }
      }
    } else {
      const projectsDir = path.join(this.rootDir, "projects");
      try {
        const projectFolders = await fs.readdir(projectsDir);
        for (const folder of projectFolders) {
          const snapDir = path.join(projectsDir, folder, "snapshots");
          try {
            const files = await fs.readdir(snapDir);
            for (const file of files) {
              if (file.endsWith(".json")) {
                const content = await fs.readFile(path.join(snapDir, file), "utf8");
                snapshots.push(JSON.parse(content) as Snapshot);
              }
            }
          } catch (err: any) {
            if (err.code !== "ENOENT") {
              console.error(`Failed to read snapshots in ${snapDir}:`, err);
            }
          }
        }
      } catch (err: any) {
        if (err.code !== "ENOENT") {
          console.error("Failed to list projects directory:", err);
        }
      }
    }

    return snapshots.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}
