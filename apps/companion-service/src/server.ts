import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs/promises";
import { createAuthenticator } from "./auth";
import { createSnapshotService } from "./snapshot-service";
import { createRestoreCopy } from "./restore-copy";
import { config } from "./config";
import { ProjectRegistry } from "./project-registry";
import { pairingService } from "./pairing";
import { sessionManager } from "./sessions";
import { watchProjectFileForSnapshots } from "./file-watcher";
import {
  registerProjectSchema,
  createSnapshotSchema,
  restoreCopySchema,
  pairCompleteSchema,
  refreshSessionSchema,
  changesQuerySchema
} from "./schemas";

export async function createServer(options: {
  port: number;
  storageRoot?: string;
}) {
  const app = express();
  const storageRoot = options.storageRoot ?? config.storageRoot;
  
  // Await registry load before starting
  const registry = new ProjectRegistry(storageRoot);
  await registry.load();
  
  const snapshotService = createSnapshotService({ storageRoot });
  const activeWatchers = new Map<string, any>();

  const allowedDevelopmentOrigins = new Set([
    `http://127.0.0.1:${config.devPanelPort}`,
    `http://localhost:${config.devPanelPort}`,
  ]);

  app.use(
    cors({
      origin(origin, callback) {
        // Allow no-origin request (empty origin) from packaged CEP
        if (!origin) {
          return callback(null, true);
        }
        try {
          const parsed = new URL(origin);
          const allowed = allowedDevelopmentOrigins.has(parsed.origin);
          callback(allowed ? null : new Error("Origin not allowed"), allowed);
        } catch {
          callback(new Error("Invalid origin"));
        }
      },
      methods: ["GET", "POST"],
      allowedHeaders: ["authorization", "content-type", "x-editvcs-client"],
      credentials: false,
    })
  );
  
  app.use(express.json({ limit: "1.5mb" }));

  app.get("/health", async (req, res) => {
    const health = await snapshotService.checkHealth();
    if (!health.ok) {
      return res.status(503).json({ status: "error", error: health.error });
    }
    res.json({ status: "ok" });
  });

  // Pairing endpoints
  app.post("/pair/start", (req, res) => {
    try {
      const pairInfo = pairingService.startPairing();
      res.json(pairInfo);
    } catch (err: any) {
      res.status(429).json({ error: { code: "RATE_LIMIT_EXCEEDED", message: err.message } });
    }
  });

  app.post("/pair/complete", (req, res) => {
    try {
      const { pairingId, code } = pairCompleteSchema.parse(req.body);
      const session = pairingService.completePairing(pairingId, code);
      res.json(session);
    } catch (err: any) {
      res.status(400).json({ error: { code: "PAIRING_FAILED", message: err instanceof Error ? err.message : "Pairing failed" } });
    }
  });

  app.post("/sessions/refresh", (req, res) => {
    try {
      const { sessionToken } = refreshSessionSchema.parse(req.body);
      const newSession = sessionManager.refresh(sessionToken);
      if (!newSession) {
        return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid session" } });
      }
      res.json(newSession);
    } catch (err) {
      res.status(400).json({ error: { code: "INVALID_REQUEST", message: "Invalid request" } });
    }
  });

  app.post("/sessions/revoke", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      sessionManager.revoke(authHeader.substring(7));
    }
    res.json({ status: "revoked" });
  });

  // Authenticated routes
  app.use(createAuthenticator());

  app.post("/projects/register", async (req, res, next) => {
    try {
      const { projectPath } = registerProjectSchema.parse(req.body);
      const projectId = await registry.validateAndRegisterPath(projectPath);
      res.json({ projectId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid project path";
      res.status(400).json({ error: { code: "INVALID_PROJECT_PATH", message } });
    }
  });

  app.post("/snapshots/manual", async (req, res, next) => {
    try {
      const parsedBody = createSnapshotSchema.parse(req.body);
      
      // Retrieve the path from registry
      const projectPath = registry.getCanonicalPath(parsedBody.projectId);
      if (!projectPath) {
        return res.status(404).json({ error: { code: "PROJECT_NOT_FOUND", message: "Project not registered." } });
      }

      // Revalidate active file path before sensitive operation
      await registry.revalidatePath(parsedBody.projectId);

      const result = await snapshotService.createManualSnapshot({
        projectId: parsedBody.projectId,
        projectPath,
        label: parsedBody.label,
        trigger: parsedBody.trigger,
        manifest: parsedBody.manifest,
        manifestStatus: parsedBody.manifestStatus,
        manifestReason: parsedBody.manifestReason
      });

      if (!result.created) {
        return res.status(200).json({ created: false, message: result.reason });
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/snapshots", async (req, res, next) => {
    try {
      const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
      res.json(await snapshotService.listSnapshots(projectId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/snapshots/restore-copy", async (req, res, next) => {
    try {
      const { projectId, snapshotId, destinationDirectory } = restoreCopySchema.parse(req.body);
      
      const projectPath = registry.getCanonicalPath(projectId);
      if (!projectPath) {
        return res.status(404).json({ error: { code: "PROJECT_NOT_FOUND", message: "Project not registered." } });
      }

      const snapshots = await snapshotService.listSnapshots(projectId);
      const snapshot = snapshots.find(s => s.id === snapshotId);
      if (!snapshot) {
        return res.status(404).json({ error: { code: "SNAPSHOT_NOT_FOUND", message: "Snapshot not found." } });
      }

      // Derive objects location dynamically at runtime
      const objectPath = path.join(storageRoot, "objects", snapshot.projectFile.sha256.slice(0, 2), snapshot.projectFile.sha256);

      const restoredPath = await createRestoreCopy({
        originalProjectPath: projectPath,
        objectPath,
        destinationDirectory,
        label: snapshot.label ?? "Save point",
        createdAt: snapshot.createdAt,
        expectedHash: snapshot.projectFile.sha256,
        originalFileName: snapshot.projectFile.originalFileName
      });

      res.json({ restoredPath });
    } catch (error) {
      next(error);
    }
  });

  // Changes endpoint: GET /projects/:projectId/changes?from=<snapshotId>&to=<snapshotId>
  app.get("/projects/:projectId/changes", async (req, res, next) => {
    try {
      const { projectId } = req.params;
      const { from, to } = changesQuerySchema.parse(req.query);

      const projectPath = registry.getCanonicalPath(projectId);
      if (!projectPath) {
        return res.status(404).json({ error: { code: "PROJECT_NOT_FOUND", message: "Project not registered." } });
      }

      const snapshots = await snapshotService.listSnapshots(projectId);
      const fromSnap = snapshots.find(s => s.id === from);
      const toSnap = snapshots.find(s => s.id === to);

      if (!fromSnap || !toSnap) {
        return res.status(404).json({ error: { code: "SNAPSHOT_NOT_FOUND", message: "Snapshot not found." } });
      }

      if (fromSnap.projectId !== projectId || toSnap.projectId !== projectId) {
        return res.status(400).json({ error: { code: "INVALID_SNAPSHOT", message: "Snapshots must belong to the specified project." } });
      }

      if (from === to) {
        return res.json({
          fromSnapshotId: from,
          toSnapshotId: to,
          confidence: "verified",
          summary: ["No changes detected (comparing same save point)."],
          groups: [],
          unsupported: []
        });
      }

      const { comparePremiereManifests } = await import("@editvcs/diff-engine");
      const diffResult = comparePremiereManifests(fromSnap.manifest, toSnap.manifest);

      const confidence = (fromSnap.manifestStatus === "verified" && toSnap.manifestStatus === "verified")
        ? "verified"
        : (fromSnap.manifestStatus === "unavailable" || toSnap.manifestStatus === "unavailable")
          ? "metadata-unavailable"
          : "best-effort";

      res.json({
        fromSnapshotId: from,
        toSnapshotId: to,
        confidence,
        summary: diffResult.summary,
        groups: diffResult.groups,
        unsupported: diffResult.unsupported
      });
    } catch (error) {
      next(error);
    }
  });

  // Watch endpoints
  app.post("/projects/:projectId/watch/start", async (req, res, next) => {
    try {
      const { projectId } = req.params;
      const projectPath = registry.getCanonicalPath(projectId);
      if (!projectPath) {
        return res.status(404).json({ error: { code: "PROJECT_NOT_FOUND", message: "Project not registered." } });
      }

      if (activeWatchers.has(projectId)) {
        return res.json({ status: "watching" });
      }

      try {
        await fs.access(projectPath);
      } catch {
        return res.status(400).json({ error: { code: "FILE_NOT_FOUND", message: "Project file not found on disk." } });
      }

      const watcher = await watchProjectFileForSnapshots({
        projectPath,
        debounceMs: 2000,
        onStableChange: async () => {
          await snapshotService.createManualSnapshot({
            projectId,
            projectPath,
            label: "Automatic save point",
            trigger: "automatic"
          });
        }
      });

      activeWatchers.set(projectId, watcher);
      res.json({ status: "watching" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/projects/:projectId/watch/stop", async (req, res, next) => {
    try {
      const { projectId } = req.params;
      const watcher = activeWatchers.get(projectId);
      if (watcher) {
        await watcher.close();
        activeWatchers.delete(projectId);
      }
      res.json({ status: "stopped" });
    } catch (error) {
      next(error);
    }
  });

  app.get("/projects/:projectId/watch/status", async (req, res) => {
    const { projectId } = req.params;
    const isWatching = activeWatchers.has(projectId);
    res.json({ status: isWatching ? "watching" : "stopped" });
  });

  // 501 Unfinished fallback endpoints
  app.get("/cloud/status", (req, res) => {
    res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "Cloud backup is not available in Phase 1." } });
  });

  app.post("/cloud/backup", (req, res) => {
    res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "Cloud backup is not available in Phase 1." } });
  });

  app.post("/sync", (req, res) => {
    res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "Sync is not available in Phase 1." } });
  });

  app.get("/sync/config", (req, res) => {
    res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "Sync is not available in Phase 1." } });
  });

  app.post("/sync/config", (req, res) => {
    res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "Sync is not available in Phase 1." } });
  });

  app.post("/streams", (req, res) => {
    res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "Version streams are not available in Phase 1." } });
  });

  app.get("/streams", (req, res) => {
    res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "Version streams are not available in Phase 1." } });
  });

  app.post("/streams/switch", (req, res) => {
    res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "Version streams are not available in Phase 1." } });
  });

  app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      return next(error);
    }
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request payload." } });
    }
    const message = error instanceof Error ? error.message : "Unexpected companion service error";
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message } });
  });

  const server = app.listen(options.port, "127.0.0.1");

  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve());
  });

  return server;
}
