import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { writeJsonAtomic } from "@editvcs/storage";
import { z } from "zod";

export interface ProjectRecord {
  projectId: string;
  canonicalPath: string;
  registeredAt: string;
}

const projectRecordSchema = z.object({
  projectId: z.string().uuid(),
  canonicalPath: z.string().min(1),
  registeredAt: z.string().min(1)
});

export function pathComparisonKey(input: string): string {
  const normalized = path.normalize(input);
  return process.platform === "win32"
    ? normalized.toLowerCase()
    : normalized;
}

export class ProjectRegistry {
  private registry = new Map<string, ProjectRecord>();
  private storageRootPath: string;

  constructor(storageRoot: string) {
    this.storageRootPath = storageRoot;
  }

  async load() {
    try {
      const registryFile = path.join(this.storageRootPath, "registry.json");
      const data = await fs.readFile(registryFile, "utf-8");
      const records = JSON.parse(data);
      if (Array.isArray(records)) {
        for (const record of records) {
          const parsed = projectRecordSchema.parse(record);
          this.registry.set(parsed.projectId, parsed);
        }
      }
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        console.error("Failed to load project registry:", err);
      }
    }
  }

  async save() {
    await fs.mkdir(this.storageRootPath, { recursive: true });
    const registryFile = path.join(this.storageRootPath, "registry.json");
    await writeJsonAtomic(registryFile, Array.from(this.registry.values()));
  }

  async validateAndRegisterPath(inputPath: string): Promise<string> {
    const resolved = path.resolve(inputPath);
    
    let canonical = resolved;
    try {
      canonical = await fs.realpath(resolved);
    } catch (err) {
      throw new Error(`File does not exist: ${inputPath}`);
    }
    
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

    const newKey = pathComparisonKey(canonical);

    // Check if already registered
    for (const [id, record] of this.registry.entries()) {
      if (pathComparisonKey(record.canonicalPath) === newKey) {
        return id;
      }
    }

    const projectId = randomUUID();
    this.registry.set(projectId, {
      projectId,
      canonicalPath: canonical,
      registeredAt: new Date().toISOString()
    });

    await this.save();
    return projectId;
  }

  getCanonicalPath(projectId: string): string | null {
    const record = this.registry.get(projectId);
    return record ? record.canonicalPath : null;
  }

  async revalidatePath(projectId: string): Promise<string> {
    const record = this.registry.get(projectId);
    if (!record) {
      throw new Error("Project not registered.");
    }
    
    let canonical: string;
    try {
      canonical = await fs.realpath(record.canonicalPath);
    } catch (err) {
      throw new Error(`Project file no longer exists: ${record.canonicalPath}`);
    }
    
    const stat = await fs.stat(canonical);
    if (!stat.isFile()) {
      throw new Error("Project path resolves to something other than a file.");
    }
    
    if (!canonical.toLowerCase().endsWith(".prproj")) {
      throw new Error("Project file has incorrect extension.");
    }
    
    return canonical;
  }
}
