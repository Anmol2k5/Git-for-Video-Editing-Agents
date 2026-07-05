import fs from "node:fs/promises";
import path from "node:path";
import { hashFileSha256 } from "./hash-file";
import type { Snapshot } from "@editvcs/shared-types";
import { writeJsonAtomic } from "./write-json";

export class LocalSnapshotRepository {
  constructor(private rootDir: string) {}

  async init(): Promise<void> {
    await fs.mkdir(path.join(this.rootDir, "objects"), { recursive: true });
    await fs.mkdir(path.join(this.rootDir, "manifests"), { recursive: true });
    await fs.mkdir(path.join(this.rootDir, "versions"), { recursive: true });
    await fs.mkdir(path.join(this.rootDir, "previews"), { recursive: true });
    await fs.mkdir(path.join(this.rootDir, "logs"), { recursive: true });
    
    const configPath = path.join(this.rootDir, "config.json");
    try {
      await fs.stat(configPath);
    } catch {
      await writeJsonAtomic(configPath, { version: 1 });
    }
  }

  async storeProjectObject(sourcePath: string) {
    await this.init();
    const sha256 = await hashFileSha256(sourcePath);
    const objectDir = path.join(this.rootDir, "objects", sha256.slice(0, 2));
    await fs.mkdir(objectDir, { recursive: true });
    
    const objectPath = path.join(objectDir, sha256);
    try {
      await fs.stat(objectPath);
    } catch {
      const tempPath = `${objectPath}.tmp-${process.pid}`;
      await fs.copyFile(sourcePath, tempPath);
      await fs.rename(tempPath, objectPath);
    }

    return {
      sha256,
      objectPath
    };
  }

  async saveSnapshot(snapshot: Snapshot) {
    await this.init();
    await writeJsonAtomic(path.join(this.rootDir, "manifests", `${snapshot.id}.json`), snapshot);
  }
}
