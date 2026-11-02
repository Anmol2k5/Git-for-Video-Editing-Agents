import express from "express";
import { createServer as createHttpServer } from "node:http";
import { storageIdentifierSchema } from "@editvcs/storage";
import cors from "cors";
import path from "node:path";
import fs from "node:fs/promises";
import { createAuthenticator } from "./auth";
import { createSnapshotService } from "./snapshot-service";
import { createRestoreCopy } from "./restore-copy";
import { config } from "./config";
import { InvalidProjectPathError, ProjectRegistry } from "./project-registry";
import { pairingService } from "./pairing";
import { sessionManager } from "./sessions";
import { watchProjectFileForSnapshots } from "./file-watcher";
import { createErrorResponse, type ErrorCode } from "@editvcs/shared-types";
import {
  registerProjectSchema,
  createSnapshotSchema,
  restoreCopySchema,
  pairCompleteSchema,
  refreshSessionSchema,
  changesQuerySchema
} from "./schemas";

interface FileWatcherInstance {
  close: () => Promise<void>;
}

class OriginDeniedError extends Error {}

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
  const activeWatchers = new Map<string, Promise<FileWatcherInstance>>();
  const stoppingWatchers = new Map<string, Promise<void>>();
  let closing = false;
  let lastHealthFailure: string | undefined;

  const allowedDevelopmentOrigins = new Set([
    `http://127.0.0.1:${config.devPanelPort}`,
    `http://localhost:${config.devPanelPort}`,
  ]);

  app.use(
    cors({
      origin(origin, callback) {
        // CEP loads the extension from disk, producing the literal opaque
        // Origin "null". Bearer authentication still guards project data.
        if (!origin || origin === "null") {
          return callback(null, true);
        }
        const allowed = allowedDevelopmentOrigins.has(origin);
        callback(allowed ? null : new OriginDeniedError(), allowed);
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
      // Health probes include a unique ID in their filename. Normalize it for
      // deduplication while preserving the original detail in the private log.
      const failure = (health.error ?? "Unknown storage failure").replace(/\.health-[a-f0-9-]+/gi, ".health-<probe>");
      if (failure !== lastHealthFailure) {
        lastHealthFailure = failure;
        console.error("Local storage health check failed:", health.error ?? "Unknown storage failure");
      }
      return res.status(503).json({ status: "error", error: "Local storage is unavailable. Check companion logs and storage permissions." });
    }
    lastHealthFailure = undefined;
    res.json({ status: "ok" });
  });

  // Pairing endpoints
  app.post("/pair/start", (req, res) => {
    try {
      const pairInfo = pairingService.startPairing();
      res.json(pairInfo);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Rate limit exceeded";
      res.status(429).json(createErrorResponse("RATE_LIMIT_EXCEEDED", msg));
    }
  });

  app.post("/pair/complete", (req, res) => {
    try {
      const { pairingId, code } = pairCompleteSchema.parse(req.body);
      const session = pairingService.completePairing(pairingId, code);
      res.json(session);
    } catch (err: unknown) {
      res.status(400).json(createErrorResponse("PAIRING_FAILED", err instanceof Error ? err.message : "Pairing failed"));
    }
  });

  app.post("/sessions/refresh", (req, res) => {
    try {
      const { sessionToken } = refreshSessionSchema.parse(req.body);
      const newSession = sessionManager.refresh(sessionToken);
      if (!newSession) {
        return res.status(401).json(createErrorResponse("UNAUTHORIZED", "Invalid session"));
      }
      res.json(newSession);
    } catch (err) {
      res.status(400).json(createErrorResponse("INVALID_REQUEST", "Invalid request"));
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
      if (error instanceof InvalidProjectPathError) {
        return res.status(400).json(createErrorResponse("INVALID_PROJECT_PATH", error.message));
      }
      next(error);
    }
  });

  app.post("/snapshots/manual", async (req, res, next) => {
    try {
      const parsedBody = createSnapshotSchema.parse(req.body);
      
      const projectPath = registry.getCanonicalPath(parsedBody.projectId);
      if (!projectPath) {
        return res.status(404).json(createErrorResponse("PROJECT_NOT_FOUND", "Project not registered."));
      }

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
      const projectId = req.query.projectId === undefined ? undefined : storageIdentifierSchema.parse(req.query.projectId);
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
        return res.status(404).json(createErrorResponse("PROJECT_NOT_FOUND", "Project not registered."));
      }

      const snapshots = await snapshotService.listSnapshots(projectId);
      const snapshot = snapshots.find(s => s.id === snapshotId);
      if (!snapshot) {
        return res.status(404).json(createErrorResponse("SNAPSHOT_NOT_FOUND", "Snapshot not found."));
      }

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
        return res.status(404).json(createErrorResponse("PROJECT_NOT_FOUND", "Project not registered."));
      }

      const snapshots = await snapshotService.listSnapshots(projectId);
      const fromSnap = snapshots.find(s => s.id === from);
      const toSnap = snapshots.find(s => s.id === to);

      if (!fromSnap || !toSnap) {
        return res.status(404).json(createErrorResponse("SNAPSHOT_NOT_FOUND", "Snapshot not found."));
      }

      if (fromSnap.projectId !== projectId || toSnap.projectId !== projectId) {
        return res.status(400).json(createErrorResponse("INVALID_SNAPSHOT", "Snapshots must belong to the specified project."));
      }

      if (fromSnap.manifestStatus === "unavailable" || toSnap.manifestStatus === "unavailable") {
        return res.json({
          fromSnapshotId: from, toSnapshotId: to, confidence: "metadata-unavailable",
          summary: ["Timeline metadata is unavailable for one or both save points."],
          groups: [], unsupported: ["Structural changes cannot be determined from project bytes alone."]
        });
      }

      if (from === to) {
        return res.json({
          fromSnapshotId: from,
          toSnapshotId: to,
          confidence: fromSnap.manifestStatus === "verified" ? "verified" : "best-effort",
          summary: ["No changes detected (comparing same save point)."],
          groups: [],
          unsupported: []
        });
      }

      const { comparePremiereManifests } = await import("@editvcs/diff-engine");
      const diffResult = comparePremiereManifests(fromSnap.manifest as any, toSnap.manifest as any, { partialCoverage: fromSnap.manifestStatus !== "verified" || toSnap.manifestStatus !== "verified" });

      const confidence = (fromSnap.manifestStatus === "verified" && toSnap.manifestStatus === "verified")
        ? "verified"
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
        return res.status(404).json(createErrorResponse("PROJECT_NOT_FOUND", "Project not registered."));
      }

      const pendingStop = stoppingWatchers.get(projectId);
      if (pendingStop) await pendingStop;
      if (closing) return res.status(503).json(createErrorResponse("INTERNAL_ERROR", "Companion is shutting down."));
      if (activeWatchers.has(projectId)) {
        await activeWatchers.get(projectId);
        return res.json({ status: "watching" });
      }

      // Reserve ownership before any filesystem await so concurrent requests
      // share this startup promise instead of allocating hidden watchers.
      const watcher = (async () => {
        await fs.access(projectPath);
        return watchProjectFileForSnapshots({
        projectPath,
        debounceMs: 2000,
        onStableChange: async () => {
          const currentPath = await registry.revalidatePath(projectId);
          await snapshotService.createManualSnapshot({
            projectId,
            projectPath: currentPath,
            label: "Automatic save point",
            trigger: "automatic"
          });
        }
        });
      })();

      activeWatchers.set(projectId, watcher);
      try { await watcher; } catch (error) {
        if (activeWatchers.get(projectId) === watcher) activeWatchers.delete(projectId);
        throw error;
      }
      res.json({ status: "watching" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/projects/:projectId/watch/stop", async (req, res, next) => {
    try {
      const { projectId } = req.params;
      const watcher = activeWatchers.get(projectId);
      let stopping = stoppingWatchers.get(projectId);
      if (!stopping && watcher) {
        stopping = (async () => {
          await (await watcher).close();
          if (activeWatchers.get(projectId) === watcher) activeWatchers.delete(projectId);
        })();
        stoppingWatchers.set(projectId, stopping);
      }
      if (stopping) {
        try { await stopping; }
        finally { if (stoppingWatchers.get(projectId) === stopping) stoppingWatchers.delete(projectId); }
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
    res.status(501).json(createErrorResponse("NOT_IMPLEMENTED", "Cloud backup is not available in Phase 1."));
  });

  app.post("/cloud/backup", (req, res) => {
    res.status(501).json(createErrorResponse("NOT_IMPLEMENTED", "Cloud backup is not available in Phase 1."));
  });

  app.post("/sync", (req, res) => {
    res.status(501).json(createErrorResponse("NOT_IMPLEMENTED", "Sync is not available in Phase 1."));
  });

  app.get("/sync/config", (req, res) => {
    res.status(501).json(createErrorResponse("NOT_IMPLEMENTED", "Sync is not available in Phase 1."));
  });

  app.post("/sync/config", (req, res) => {
    res.status(501).json(createErrorResponse("NOT_IMPLEMENTED", "Sync is not available in Phase 1."));
  });

  app.post("/streams", (req, res) => {
    res.status(501).json(createErrorResponse("NOT_IMPLEMENTED", "Version streams are not available in Phase 1."));
  });

  app.get("/streams", (req, res) => {
    res.status(501).json(createErrorResponse("NOT_IMPLEMENTED", "Version streams are not available in Phase 1."));
  });

  app.post("/streams/switch", (req, res) => {
    res.status(501).json(createErrorResponse("NOT_IMPLEMENTED", "Version streams are not available in Phase 1."));
  });

  app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      return next(error);
    }
    if (error instanceof OriginDeniedError) {
      return res.status(403).json(createErrorResponse("INVALID_REQUEST", "Request origin is not allowed."));
    }
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      return res.status(400).json(createErrorResponse("VALIDATION_ERROR", "Invalid request payload."));
    }
    const bodyError = error as { type?: string } | null;
    if (bodyError?.type === "entity.parse.failed") {
      return res.status(400).json(createErrorResponse("INVALID_REQUEST", "Malformed JSON request."));
    }
    if (bodyError?.type === "entity.too.large") {
      return res.status(413).json(createErrorResponse("INVALID_REQUEST", "Request body is too large."));
    }
    console.error("Companion request failed", error);
    res.status(500).json(createErrorResponse("INTERNAL_ERROR", "Companion operation failed. Check the local companion logs."));
  });

  const server = createHttpServer(app);
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => { server.off("listening", onListening); reject(error); };
    const onListening = () => { server.off("error", onError); resolve(); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(options.port, "127.0.0.1");
  });

  const closeHttp = server.close.bind(server);
  server.close = (callback?: (error?: Error) => void) => {
    closing = true;
    closeHttp(error => {
      void Promise.allSettled([...activeWatchers.values()].map(async watcher => (await watcher).close()))
        .then(results => {
          activeWatchers.clear();
          const failure = results.find(result => result.status === "rejected");
          callback?.(error ?? (failure?.status === "rejected" ? failure.reason : undefined));
        });
    });
    return server;
  };
  return server;
}
