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
  let server: Awaited<ReturnType<typeof createServer>>;
  let client: CompanionClient;

  let testPresenter: any;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-int-"));
    project = path.join(dir, "Film.prproj");
    storageRoot = path.join(dir, ".editvcs");
    await writeFile(project, "v1-project-content");

    const { pairingService, TestPairingPresenter } = await import("./pairing");
    testPresenter = new TestPairingPresenter();
    pairingService.presenter = testPresenter;

    server = await createServer({ port: 0, storageRoot });
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
    const code = testPresenter.latestCode;
    if (!code) throw new Error("Could not retrieve test pairing code");
    await client.completePairing(pair.pairingId, code);
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
    expect((await client.createSnapshot(pid!, "manual", "First cut")).created).toBe(true);
    const versions = await client.listSnapshots(pid!);
    expect(versions).toHaveLength(1);
    expect(versions[0].note).toBe("First cut");
    expect(versions[0].checkpointType).toBe("manual");
    expect(versions[0].filename).toBe("Film.prproj");
  });

  it("deduplicates identical project content", async () => {
    const pid = await authAndRegister();
    expect((await client.createSnapshot(pid!, "manual", "A")).created).toBe(true);
    expect((await client.createSnapshot(pid!, "manual", "B")).created).toBe(false);
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

  it("persists project registry and history across companion restart but invalidates sessions", async () => {
    const pair1 = await client.startPairing();
    expect(pair1).toBeTruthy();
    const code1 = testPresenter.latestCode;
    await client.completePairing(pair1!.pairingId, code1!);
    const pid = await client.registerProject(project);
    expect(pid).toBeTruthy();
    
    const snapRes = await client.createSnapshot(pid!, "manual", "Persisted Version");
    expect(snapRes.created).toBe(true);

    await new Promise<void>((resolve) => server.close(() => resolve()));

    const { pairingService } = await import("./pairing");
    const { sessionManager: sMgr } = await import("./sessions");
    sMgr.reset();
    pairingService.reset();

    const newServer = await createServer({ port: 0, storageRoot });
    const address = newServer.address();
    if (!address || typeof address === "string") throw new Error("no address");
    const newClient = new CompanionClient(address.port);

    try {
      const oldToken = client.sessionToken;
      newClient.sessionToken = oldToken;
      const unauthSnapshots = await newClient.listSnapshots(pid!);
      expect(unauthSnapshots).toEqual([]);

      const pair2 = await newClient.startPairing();
      const code2 = testPresenter.latestCode;
      await newClient.completePairing(pair2!.pairingId, code2!);

      const history = await newClient.listSnapshots(pid!);
      expect(history).toHaveLength(1);
      expect(history[0].note).toBe("Persisted Version");

      const restoredPath = await newClient.restore(history[0], dir);
      expect(restoredPath).toBeTruthy();
      await expect(readFile(restoredPath!, "utf8")).resolves.toBe("v1-project-content");
    } finally {
      await new Promise<void>((resolve) => newServer.close(() => resolve()));
    }
  });

  it("allows A -> B -> A snapshots to be created", async () => {
    const pid = await authAndRegister();
    
    // Write A, snapshot
    await writeFile(project, "A");
    expect((await client.createSnapshot(pid!, "manual", "First A")).created).toBe(true);
    
    // Write B, snapshot
    await writeFile(project, "B");
    expect((await client.createSnapshot(pid!, "manual", "First B")).created).toBe(true);
    
    // Write A, snapshot again
    await writeFile(project, "A");
    expect((await client.createSnapshot(pid!, "manual", "Second A")).created).toBe(true);
    
    const snapshots = await client.listSnapshots(pid!);
    expect(snapshots).toHaveLength(3);
  });
});
