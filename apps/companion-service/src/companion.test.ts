import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSnapshotService, createRestoreCopy } from "./index";
import { createServer } from "./server";

describe("companion service", () => {
  it("creates a manual snapshot and ignores duplicate content", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-companion-"));
    const project = path.join(dir, "Film.prproj");
    await writeFile(project, "project-v1");
    const service = createSnapshotService({ storageRoot: path.join(dir, ".editvcs") });

    const first = await service.createManualSnapshot({ projectId: "00000000-0000-0000-0000-000000000000", projectPath: project, label: "Before export" });
    const second = await service.createManualSnapshot({ projectId: "00000000-0000-0000-0000-000000000000", projectPath: project, label: "Before export again" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
  });

  it("restores as a separate copy and leaves current project unchanged", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-restore-"));
    const active = path.join(dir, "Film.prproj");
    const object = path.join(dir, "object.prproj");
    await writeFile(active, "current");
    const { createHash } = await import("node:crypto");
    const oldContent = "old";
    await writeFile(object, oldContent);
    const expectedHash = createHash("sha256").update(oldContent).digest("hex");

    const restoredPath = await createRestoreCopy({
      originalProjectPath: active,
      objectPath: object,
      destinationDirectory: dir,
      label: "Client feedback",
      createdAt: "2026-07-05T18:41:00.000Z",
      expectedHash,
      originalFileName: "Film.prproj"
    });

    await expect(readFile(active, "utf8")).resolves.toBe("current");
    await expect(readFile(restoredPath, "utf8")).resolves.toBe("old");
  });

  it("pairs with a generated bearer token and protects snapshot routes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-server-"));
    const project = path.join(dir, "Film.prproj");
    await writeFile(project, "project-v1");

    const server = await createServer({
      port: 0,
      storageRoot: path.join(dir, ".editvcs")
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected local server address");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const rejected = await fetch(`${baseUrl}/projects/register`, { method: "POST" });
      expect(rejected.status).toBe(401);

      // Start pairing - should return pairingId and expiresAt, NOT code
      const startResponse = await fetch(`${baseUrl}/pair/start`, { method: "POST" });
      const pairInfo = await startResponse.json() as { pairingId: string, expiresAt: number, code?: string };
      expect(pairInfo.pairingId).toBeTruthy();
      expect(pairInfo.code).toBeUndefined();

      const { pairingService } = await import("./pairing");
      const code = pairingService.getPairingCodeForTest(pairInfo.pairingId);
      expect(code).toBeTruthy();

      const pairResponse = await fetch(`${baseUrl}/pair/complete`, { 
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairingId: pairInfo.pairingId, code })
      });
      const pairBody = await pairResponse.json() as { sessionToken: string };
      expect(pairBody.sessionToken).toBeTruthy();

      const headers = {
        authorization: `Bearer ${pairBody.sessionToken}`,
        "content-type": "application/json"
      };

      const regResponse = await fetch(`${baseUrl}/projects/register`, {
        method: "POST",
        headers,
        body: JSON.stringify({ projectPath: project })
      });
      const regBody = await regResponse.json() as { projectId: string };
      expect(regResponse.status).toBe(200);

      const snapshotResponse = await fetch(`${baseUrl}/snapshots/manual`, {
        method: "POST",
        headers,
        body: JSON.stringify({ projectId: regBody.projectId, label: "Before export" })
      });
      const snapshotBody = await snapshotResponse.json() as { created: boolean; snapshot?: { label?: string } };

      expect(snapshotResponse.status).toBe(200);
      expect(snapshotBody.created).toBe(true);
      expect(snapshotBody.snapshot?.label).toBe("Before export");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
