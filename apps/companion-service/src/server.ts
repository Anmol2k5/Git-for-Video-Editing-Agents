import express from "express";
import cors from "cors";
import { createAuthenticator } from "./auth";
import { createSnapshotService } from "./snapshot-service";
import { createRestoreCopy } from "./restore-copy";
import { createStreamsService } from "./streams-service";
import { sync, type SyncTarget, type SyncResult } from "@editvcs/storage";
import { config } from "./config";
import { projectRegistry } from "./project-registry";
import { pairingService } from "./pairing";
import { sessionManager } from "./sessions";
import {
  registerProjectSchema,
  createSnapshotSchema,
  restoreCopySchema,
  pairCompleteSchema,
  refreshSessionSchema
} from "./schemas";

export function createServer(options: {
  port: number;
  storageRoot?: string;
}) {
  const app = express();
  const storageRoot = options.storageRoot ?? config.storageRoot;
  
  projectRegistry.setStorageRoot(storageRoot);
  projectRegistry.load().catch(console.error);
  
  const snapshotService = createSnapshotService({ storageRoot });
  const streamsService = createStreamsService();

  let syncTarget: SyncTarget | null = null;

  const allowedDevelopmentOrigins = new Set([
    `http://127.0.0.1:${config.devPanelPort}`,
    `http://localhost:${config.devPanelPort}`,
  ]);

  app.use(
    cors({
      origin(origin, callback) {
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
  
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (req, res) => {
    const health = await snapshotService.checkHealth();
    if (!health.ok) {
      return res.status(503).json({ status: "error", error: health.error });
    }
    res.json({ status: "ok" });
  });

  // Pairing flow
  app.post("/pair/start", (req, res) => {
    res.json(pairingService.startPairing());
  });

  app.post("/pair/complete", (req, res, next) => {
    try {
      const { pairingId, code } = pairCompleteSchema.parse(req.body);
      res.json(pairingService.completePairing(pairingId, code));
    } catch (err) {
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
      const projectId = await projectRegistry.validateAndRegisterPath(projectPath);
      res.json({ projectId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid project path";
      res.status(400).json({ error: { code: "INVALID_PROJECT_PATH", message } });
    }
  });

  app.post("/snapshots/manual", async (req, res, next) => {
    try {
      const { projectId, label } = createSnapshotSchema.parse(req.body);
      const projectPath = projectRegistry.getCanonicalPath(projectId);
      if (!projectPath) {
        return res.status(404).json({ error: { code: "PROJECT_NOT_FOUND", message: "Project not registered." } });
      }

      const result = await snapshotService.createManualSnapshot({
        projectId,
        projectPath,
        label: label ?? "Manual save point"
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/snapshots", async (req, res, next) => {
    try {
      res.json(await snapshotService.listSnapshots(req.query.projectId ? String(req.query.projectId) : undefined));
    } catch (error) {
      next(error);
    }
  });

  app.post("/snapshots/restore-copy", async (req, res, next) => {
    try {
      const { projectId, snapshotId, destinationDirectory } = restoreCopySchema.parse(req.body);
      
      const projectPath = projectRegistry.getCanonicalPath(projectId);
      if (!projectPath) {
        return res.status(404).json({ error: { code: "PROJECT_NOT_FOUND", message: "Project not registered." } });
      }

      const snapshots = await snapshotService.listSnapshots(projectId);
      const snapshot = snapshots.find(s => s.id === snapshotId);
      if (!snapshot) {
        return res.status(404).json({ error: { code: "SNAPSHOT_NOT_FOUND", message: "Snapshot not found." } });
      }

      const restoredPath = await createRestoreCopy({
        originalProjectPath: projectPath,
        objectPath: snapshot.projectFile.objectPath,
        destinationDirectory,
        label: snapshot.label ?? "Save point",
        createdAt: snapshot.createdAt,
        expectedHash: snapshot.projectFile.sha256
      });

      res.json({ restoredPath });
    } catch (error) {
      next(error);
    }
  });

  app.get("/changes", (req, res) => res.json({}));
  app.get("/cloud/status", (req, res) => res.json({ status: "not-connected", mode: "local-only" }));
  app.post("/cloud/backup", (req, res) => res.json({ status: "queued" }));
  app.post("/streams", async (req, res) => res.json(await streamsService.createStream(req.body)));
  app.get("/streams", async (req, res) => res.json(await streamsService.getStreams(String(req.query.projectId ?? ""))));
  app.post("/streams/switch", async (req, res) => res.json(await streamsService.switchStream(req.body.streamId)));

  // Sync endpoints
  app.get("/sync/config", (req, res) => {
    res.json({ target: syncTarget });
  });

  app.post("/sync/config", (req, res) => {
    const { type } = req.body;
    if (type === "local") {
      syncTarget = { type: "local", path: req.body.path };
    } else if (type === "github") {
      syncTarget = { type: "github", remoteUrl: req.body.remoteUrl };
    } else {
      return res.status(400).json({ error: { code: "INVALID_SYNC_TARGET", message: "Invalid sync target type. Use 'local' or 'github'." } });
    }
    res.json({ ok: true, target: syncTarget });
  });

  app.post("/sync", async (req, res, next) => {
    try {
      if (!syncTarget) {
        return res.status(400).json({ error: { code: "NO_SYNC_TARGET", message: "No sync target configured. POST /sync/config first." } });
      }
      const result: SyncResult = await sync(storageRoot, syncTarget);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      return next(error);
    }
    // Handle Zod validation errors
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request payload." } });
    }
    
    const message = error instanceof Error ? error.message : "Unexpected companion service error";
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message } });
  });

  const server = app.listen(options.port, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : options.port;
    console.log(`Listening on 127.0.0.1:${port}`);
  });

  return server;
}
