import express from "express";
import cors from "cors";
import { authenticate } from "./auth";

export function createServer(options: { port: number }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (req, res) => res.json({ status: "ok" }));
  app.post("/pair", (req, res) => {
    // Return token
    res.json({ token: "local-secret" });
  });

  app.use(authenticate);

  app.get("/projects/current", (req, res) => res.json({}));
  app.post("/snapshots/manual", (req, res) => res.json({}));
  app.get("/snapshots", (req, res) => res.json([]));
  app.post("/snapshots/restore-copy", (req, res) => res.json({}));
  app.get("/changes", (req, res) => res.json({}));
  app.get("/cloud/status", (req, res) => res.json({}));
  app.post("/cloud/backup", (req, res) => res.json({}));

  return app.listen(options.port, "127.0.0.1", () => {
    console.log(`Listening on 127.0.0.1:${options.port}`);
  });
}
