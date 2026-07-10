import { mkdtemp, writeFile, readFile, mkdir, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "./server";
import { CompanionClient } from "../../premiere-panel/src/engine";

describe("panel client <-> companion service integration", () => {
  let dir: string;
  let project: string;
  let storageRoot: string;
  let server: ReturnType<typeof createServer>;
  let client: CompanionClient;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-int-"));
    project = path.join(dir, "Film.prproj");
    storageRoot = path.join(dir, ".editvcs");
    await writeFile(project, "v1-project-content");

    server = createServer({ port: 0, storageRoot });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no address");
    client = new CompanionClient(address.port);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  });

  it("connects, reports reachability, and pairs", async () => {
    expect(await client.isReachable()).toBe(true);
    // A protected call should work after pairing (no throw, returns data).
    expect(await client.listSnapshots(project)).toEqual([]);
  });

  it("creates a manual save point and lists it", async () => {
    expect(await client.createSnapshot(project, "manual", "First cut")).toBe(true);
    const versions = await client.listSnapshots(project);
    expect(versions).toHaveLength(1);
    expect(versions[0].note).toBe("First cut");
    expect(versions[0].checkpointType).toBe("manual");
    expect(versions[0].filename).toBe("Film.prproj");
  });

  it("deduplicates identical project content", async () => {
    expect(await client.createSnapshot(project, "manual", "A")).toBe(true);
    expect(await client.createSnapshot(project, "manual", "B")).toBe(false);
    expect(await client.listSnapshots(project)).toHaveLength(1);
  });

  it("restores as a copy and never touches the active project", async () => {
    await client.createSnapshot(project, "manual", "Before review");
    const versions = await client.listSnapshots(project);
    const restoredPath = await client.restore(versions[0], project);

    expect(restoredPath).toBeTruthy();
    // Active project is unchanged.
    await expect(readFile(project, "utf8")).resolves.toBe("v1-project-content");
    // The restored copy carries the original content.
    await expect(readFile(restoredPath!, "utf8")).resolves.toBe("v1-project-content");
    // Restore does not add a new snapshot of identical content.
    expect(await client.listSnapshots(project)).toHaveLength(1);
  });

  it("syncs the local repository to a target folder without merging", async () => {
    await client.createSnapshot(project, "manual", "To sync");
    const target = path.join(dir, "backup");
    await mkdir(target, { recursive: true });

    const result = await client.sync({ type: "local", path: target });
    expect(result).not.toBeNull();
    expect(result!.errors).toEqual([]);
    expect(result!.pushed).toBeGreaterThan(0);
    // Manifest made it to the target.
    const targetManifests = await readdir(path.join(target, "manifests"));
    expect(targetManifests.length).toBeGreaterThan(0);
  });
});
