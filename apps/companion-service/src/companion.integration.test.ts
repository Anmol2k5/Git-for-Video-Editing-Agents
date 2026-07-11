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

  async function authAndRegister() {
    const pair = await client.startPairing();
    if (!pair) throw new Error("Pairing failed to start");
    await client.completePairing(pair.pairingId, pair.code);
    return await client.registerProject(project);
  }

  it("connects, reports reachability, and pairs", async () => {
    expect(await client.isReachable()).toBe(true);
    const pid = await authAndRegister();
    expect(pid).toBeTruthy();
    expect(await client.listSnapshots(pid!)).toEqual([]);
  });

  it("creates a manual save point and lists it", async () => {
    const pid = await authAndRegister();
    expect(await client.createSnapshot(pid!, "manual", "First cut")).toBe(true);
    const versions = await client.listSnapshots(pid!);
    expect(versions).toHaveLength(1);
    expect(versions[0].note).toBe("First cut");
    expect(versions[0].checkpointType).toBe("manual");
    expect(versions[0].filename).toBe("Film.prproj");
  });

  it("deduplicates identical project content", async () => {
    const pid = await authAndRegister();
    expect(await client.createSnapshot(pid!, "manual", "A")).toBe(true);
    expect(await client.createSnapshot(pid!, "manual", "B")).toBe(false);
    expect(await client.listSnapshots(pid!)).toHaveLength(1);
  });

  it("restores as a copy and never touches the active project", async () => {
    const pid = await authAndRegister();
    await client.createSnapshot(pid!, "manual", "Before review");
    const versions = await client.listSnapshots(pid!);
    const restoredPath = await client.restore(versions[0], dir);

    expect(restoredPath).toBeTruthy();
    await expect(readFile(project, "utf8")).resolves.toBe("v1-project-content");
    await expect(readFile(restoredPath!, "utf8")).resolves.toBe("v1-project-content");
    expect(await client.listSnapshots(pid!)).toHaveLength(1);
  });
});
