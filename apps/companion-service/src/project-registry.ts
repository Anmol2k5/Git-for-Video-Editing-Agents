import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { writeJsonAtomic } from "@editvcs/storage";

interface ProjectRecord {
  projectId: string;
  canonicalPath: string;
  registeredAt: string;
}

const registry = new Map<string, ProjectRecord>();
let storageRootPath = ".editvcs";

export const projectRegistry = {
  setStorageRoot(root: string) {
    storageRootPath = root;
  },

  async load() {
    try {
      const data = await fs.readFile(path.join(storageRootPath, "registry.json"), "utf-8");
      const records = JSON.parse(data) as ProjectRecord[];
      for (const record of records) {
        registry.set(record.projectId, record);
      }
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        console.error("Failed to load project registry:", err);
      }
    }
  },

  async save() {
    await fs.mkdir(storageRootPath, { recursive: true });
    await writeJsonAtomic(path.join(storageRootPath, "registry.json"), Array.from(registry.values()));
  },

  async validateAndRegisterPath(inputPath: string): Promise<string> {
    const resolved = path.resolve(inputPath);
    const canonical = await fs.realpath(resolved);
    
    const stat = await fs.stat(canonical);
    if (!stat.isFile()) {
      throw new Error("Path is not a regular file.");
    }
    
    if (!canonical.toLowerCase().endsWith(".prproj")) {
      throw new Error("Path is not a Premiere project file.");
    }
    
    if (canonical.startsWith("\\\\") || canonical.startsWith("//")) {
      throw new Error("Network paths are not supported in this version.");
    }
    
    if (canonical.startsWith("\\\\.\\") || canonical.startsWith("\\\\?\\")) {
      throw new Error("Device paths are not supported.");
    }

    // Check if already registered
    for (const [id, record] of registry.entries()) {
      if (record.canonicalPath === canonical) {
        return id;
      }
    }

    const projectId = randomUUID();
    registry.set(projectId, {
      projectId,
      canonicalPath: canonical,
      registeredAt: new Date().toISOString()
    });

    await this.save();
    return projectId;
  },

  getCanonicalPath(projectId: string): string | null {
    const record = registry.get(projectId);
    return record ? record.canonicalPath : null;
  },
  
  isInside(parent: string, child: string): boolean {
    const relative = path.relative(parent, child);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  }
};
