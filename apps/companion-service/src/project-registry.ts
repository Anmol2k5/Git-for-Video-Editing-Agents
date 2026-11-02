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

export class InvalidProjectPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProjectPathError";
  }
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
  private pendingRegistration: Promise<void> = Promise.resolve();

  constructor(storageRoot: string) {
    this.storageRootPath = storageRoot;
  }

  async load() {
    try {
      const registryFile = path.join(this.storageRootPath, "registry.json");
      const data = await fs.readFile(registryFile, "utf-8");
      const records = z.array(projectRecordSchema).parse(JSON.parse(data));
      const loaded = new Map<string, ProjectRecord>();
      for (const record of records) {
        if (loaded.has(record.projectId)) throw new Error("Duplicate project ID");
        loaded.set(record.projectId, record);
      }
      this.registry = loaded;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error("Project registry is corrupt or unreadable. Preserve registry.json and recover it before restarting.", { cause: err });
      }
    }
  }

  async validateAndRegisterPath(inputPath: string): Promise<string> {
    const operation = this.pendingRegistration.then(() => this.registerPath(inputPath));
    this.pendingRegistration = operation.then(() => {}, () => {});
    return operation;
  }

  private async registerPath(inputPath: string): Promise<string> {
    const resolved = path.resolve(inputPath);
    
    let canonical = resolved;
    try {
      canonical = await fs.realpath(resolved);
    } catch (err) {
      if (["ENOENT", "ENOTDIR"].includes((err as NodeJS.ErrnoException).code ?? "")) {
        throw new InvalidProjectPathError("Project file does not exist. Save the project in Premiere and try again.");
      }
      throw err;
    }
    
    const stat = await fs.stat(canonical);
    if (!stat.isFile()) {
      throw new InvalidProjectPathError("Path is not a regular file.");
    }
    
    if (!canonical.toLowerCase().endsWith(".prproj")) {
      throw new InvalidProjectPathError("Path is not a Premiere project file.");
    }
    
    if (canonical.startsWith("\\\\") || canonical.startsWith("//")) {
      throw new InvalidProjectPathError("Network paths are not supported in this version.");
    }
    
    if (canonical.startsWith("\\\\.\\") || canonical.startsWith("\\\\?\\")) {
      throw new InvalidProjectPathError("Device paths are not supported.");
    }

    const newKey = pathComparisonKey(canonical);

    // Check if already registered
    for (const [id, record] of this.registry.entries()) {
      if (pathComparisonKey(record.canonicalPath) === newKey) {
        return id;
      }
    }

    const projectId = randomUUID();
    const record: ProjectRecord = {
      projectId,
      canonicalPath: canonical,
      registeredAt: new Date().toISOString()
    };

    await fs.mkdir(this.storageRootPath, { recursive: true });
    await writeJsonAtomic(path.join(this.storageRootPath, "registry.json"), [...this.registry.values(), record]);
    this.registry.set(projectId, record);
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
