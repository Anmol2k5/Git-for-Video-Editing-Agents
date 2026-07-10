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

    const first = await service.createManualSnapshot({ projectPath: project, label: "Before export" });
    const second = await service.createManualSnapshot({ projectPath: project, label: "Before export again" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
  });

  it("restores as a separate copy and leaves current project unchanged", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-restore-"));
    const active = path.join(dir, "Film.prproj");
    const object = path.join(dir, "object.prproj");
    await writeFile(active, "current");
    await writeFile(object, "old");

    const restoredPath = await createRestoreCopy({
      originalProjectPath: active,
      objectPath: object,
      destinationDirectory: dir,
      label: "Client feedback",
      createdAt: "2026-07-05T18:41:00.000Z"
    });

    await expect(readFile(active, "utf8")).resolves.toBe("current");
    await expect(readFile(restoredPath, "utf8")).resolves.toBe("old");
  });

  it("pairs with a generated bearer token and protects snapshot routes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-server-"));
    const project = path.join(dir, "Film.prproj");
    await writeFile(project, "project-v1");

    const server = createServer({
      port: 0,
      storageRoot: path.join(dir, ".editvcs"),
      currentProjectPath: project
    });

    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected local server address");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const rejected = await fetch(`${baseUrl}/snapshots/manual`, { method: "POST" });
      expect(rejected.status).toBe(401);

      const pairResponse = await fetch(`${baseUrl}/pair`, { method: "POST" });
      const pairBody = await pairResponse.json() as { token: string };
      expect(pairBody.token).toMatch(/^[a-f0-9]{64}$/);
      expect(pairBody.token).not.toBe("local-secret");

      const snapshotResponse = await fetch(`${baseUrl}/snapshots/manual`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${pairBody.token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ label: "Before export" })
      });
      const snapshotBody = await snapshotResponse.json() as { created: boolean; snapshot?: { label?: string } };

      expect(snapshotResponse.status).toBe(200);
      expect(snapshotBody.created).toBe(true);
      expect(snapshotBody.snapshot?.label).toBe("Before export");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("serves local history, stream controls, and cloud backup status over authenticated routes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-history-"));
    const project = path.join(dir, "Film.prproj");
    await writeFile(project, "project-v1");

    const server = createServer({
      port: 0,
      storageRoot: path.join(dir, ".editvcs"),
      currentProjectPath: project
    });

    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected local server address");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const token = ((await (await fetch(`${baseUrl}/pair`, { method: "POST" })).json()) as { token: string }).token;
      const headers = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      };

      await fetch(`${baseUrl}/snapshots/manual`, {
        method: "POST",
        headers,
        body: JSON.stringify({ label: "Before client review" })
      });

      const snapshots = await (await fetch(`${baseUrl}/snapshots`, { headers })).json() as Array<{ label?: string }>;
      expect(snapshots.map((snapshot) => snapshot.label)).toContain("Before client review");

      const createdStream = await (await fetch(`${baseUrl}/streams`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: "stream_client_feedback",
          projectId: "proj_mock",
          name: "Client feedback",
          createdAt: "2026-07-05T12:00:00.000Z"
        })
      })).json() as { name: string };
      expect(createdStream.name).toBe("Client feedback");

      const cloudStatus = await (await fetch(`${baseUrl}/cloud/status`, { headers })).json() as { status: string };
      expect(cloudStatus.status).toBe("not-connected");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
