import express from "express";
import cors from "cors";
import { randomBytes } from "node:crypto";
import { createAuthenticator } from "./auth";
import { createSnapshotService } from "./snapshot-service";
import { createRestoreCopy } from "./restore-copy";
import { createStreamsService } from "./streams-service";

export function createServer(options: {
  port: number;
  storageRoot?: string;
  currentProjectPath?: string;
}) {
  const app = express();
  const localToken = randomBytes(32).toString("hex");
  const snapshotService = createSnapshotService({
    storageRoot: options.storageRoot ?? ".editvcs"
  });
  const streamsService = createStreamsService();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (req, res) => res.json({ status: "ok" }));
  app.post("/pair", (req, res) => {
    res.json({ token: localToken });
  });

  app.use(createAuthenticator(() => localToken));

  app.get("/projects/current", (req, res) => {
    if (!options.currentProjectPath) {
      return res.status(404).json({ error: "No Premiere project is currently tracked." });
    }

    res.json({ projectPath: options.currentProjectPath });
  });

  app.post("/snapshots/manual", async (req, res, next) => {
    try {
      const projectPath = req.body?.projectPath ?? options.currentProjectPath;
      if (!projectPath) {
        return res.status(400).json({ error: "Project path is required to create a save point." });
      }

      const result = await snapshotService.createManualSnapshot({
        projectPath,
        label: req.body?.label ?? "Manual save point"
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
      const restoredPath = await createRestoreCopy({
        originalProjectPath: req.body.originalProjectPath,
        objectPath: req.body.objectPath,
        destinationDirectory: req.body.destinationDirectory,
        label: req.body.label ?? "Save point",
        createdAt: req.body.createdAt ?? new Date().toISOString()
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

  app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      return next(error);
    }
    const message = error instanceof Error ? error.message : "Unexpected companion service error";
    res.status(500).json({ error: message });
  });

  const server = app.listen(options.port, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : options.port;
    console.log(`Listening on 127.0.0.1:${port}`);
  });

  return server;
}
