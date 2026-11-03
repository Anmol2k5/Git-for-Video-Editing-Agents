import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hashFileSha256 } from "./hash-file";
import type { Snapshot } from "@editvcs/shared-types";
import { storageIdentifierSchema, sha256Schema, snapshotSchema } from "./schemas";
import { readRepositorySnapshot, relativeRepositoryPath, repositoryDirectory, repositoryFile, snapshotPathIdentity, verifyRepositoryObject, writeRepositoryFileExclusive } from "./repository-files";

export class LocalSnapshotRepository {
  constructor(private rootDir: string) {}

  private healthWarnings: string[] = [];

  private warn(warning: string): void {
    const bounded = warning.slice(0, 2048);
    if (this.healthWarnings.length < 100 && !this.healthWarnings.includes(bounded)) this.healthWarnings.push(bounded);
  }

  getHealthWarnings(): string[] { return [...this.healthWarnings]; }
  clearHealthWarnings(): void { this.healthWarnings = []; }

  async init(): Promise<void> {
    for (const relative of ["objects", "objects/.tmp", "temp", "logs", "recovery"]) {
      await repositoryDirectory(this.rootDir, relative, true);
    }
  }

  async checkHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.init();
      const testFile = path.join(this.rootDir, `.health-${randomUUID()}`);
      const probe = await fs.open(testFile, "wx", 0o600);
      try { await probe.writeFile("ok"); }
      finally { await probe.close(); await fs.unlink(testFile); }
      if (this.healthWarnings.length > 0) return { ok: false, error: `Repository health warnings: ${this.healthWarnings.join("; ")}` };
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async createTempObjectPath(): Promise<string> {
    await this.init();
    return path.join(this.rootDir, "objects", ".tmp", `${randomUUID()}.tmp`);
  }

  async publishObject(tempPath: string, expectedHash: string): Promise<string> {
    sha256Schema.parse(expectedHash);
    await this.init();
    const relative = relativeRepositoryPath(this.rootDir, tempPath);
    if (path.dirname(relative) !== path.join("objects", ".tmp")) throw new Error("Object publication requires a repository temporary object");
    const temp = await repositoryFile(this.rootDir, relative);
    if (await hashFileSha256(temp) !== expectedHash) throw new Error("Temporary object failed hash integrity verification");
    const directory = await repositoryDirectory(this.rootDir, path.join("objects", expectedHash.slice(0, 2)), true);
    const finalPath = path.join(directory, expectedHash);
    try {
      await fs.link(temp, finalPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await verifyRepositoryObject(this.rootDir, expectedHash);
    }
    await fs.unlink(temp);
    return finalPath;
  }

  async storeProjectObject(sourcePath: string) {
    const tempPath = await this.createTempObjectPath();
    try {
      const sourceStat = await fs.lstat(sourcePath);
      if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error("Project source must be a regular file");
      await fs.copyFile(sourcePath, tempPath);
      const sha256 = await hashFileSha256(tempPath);
      const finalPath = await this.publishObject(tempPath, sha256);
      return { sha256, objectPath: finalPath };
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }
  }

  async saveSnapshot(snapshot: Snapshot) {
    const validated = snapshotSchema.parse(snapshot);
    await this.init();
    await verifyRepositoryObject(this.rootDir, validated.projectFile.sha256, validated.projectFile.byteSize);
    const relative = path.join("projects", validated.projectId, "snapshots", `${validated.id}.json`);
    const content = JSON.stringify(validated, null, 2);
    try {
      await writeRepositoryFileExclusive(this.rootDir, relative, content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const file = await repositoryFile(this.rootDir, relative);
      if (await fs.readFile(file, "utf8") !== content) throw new Error("Snapshot ID already exists with different metadata");
    }
  }

  async loadAndValidateSnapshot(filePath: string): Promise<Snapshot | null> {
    try {
      const relative = relativeRepositoryPath(this.rootDir, filePath);
      snapshotPathIdentity(relative);
      const snapshot = await readRepositorySnapshot(this.rootDir, relative);
      await verifyRepositoryObject(this.rootDir, snapshot.projectFile.sha256, snapshot.projectFile.byteSize);
      return snapshot;
    } catch (error: unknown) {
      // Reads never move or delete input files; corrupt snapshots remain available for recovery.
      this.warn(`Snapshot ${path.basename(filePath)} unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async listSnapshots(projectId?: string): Promise<Snapshot[]> {
    if (projectId !== undefined) storageIdentifierSchema.parse(projectId);
    await this.init();
    const snapshots: Snapshot[] = [];
    let projectIds = projectId ? [projectId] : [];
    try {
      if (!projectId) {
        const projects = await repositoryDirectory(this.rootDir, "projects");
        projectIds = await fs.readdir(projects);
      }
      for (const id of projectIds) {
        try {
          storageIdentifierSchema.parse(id);
          const relative = path.join("projects", id, "snapshots");
          const directory = await repositoryDirectory(this.rootDir, relative);
          for (const file of await fs.readdir(directory)) {
            if (!file.endsWith(".json")) continue;
            const snapshot = await this.loadAndValidateSnapshot(path.join(directory, file));
            if (snapshot) snapshots.push(snapshot);
          }
        } catch (error: unknown) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.warn(`Project ${id} unavailable: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.warn(`Projects unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
    return snapshots.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}
