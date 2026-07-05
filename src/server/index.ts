import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { ProposalManager } from "../core/proposals.js";
import { EditVCSEngine } from "../core/engine.js";
import { ResolveLiveImporter } from "../adapters/resolve/resolve-live-import.js";

export function startServer(repoPath: string, port: number = 3333) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const engine = new EditVCSEngine(repoPath);
  const proposalManager = new ProposalManager(repoPath);

  // Serve static dashboard
  const dashboardDir = path.join(process.cwd(), "dashboard");
  if (fs.existsSync(dashboardDir)) {
    app.use(express.static(dashboardDir));
  }

  // ─── Resolve Sync ────────────────────────────────────────────────────────────
  app.post("/api/projects/:id/sync-resolve", async (req, res) => {
    try {
      const engine = new EditVCSEngine(process.cwd());
      const importer = new ResolveLiveImporter();
      const result = await importer.runImport();
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorType: result.errorType });
      }

      const snapshot = await engine.importState({ live: true }); // Uses internal live flow
      res.json({ success: true, snapshotId: snapshot.id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── API Routes ─────────────────────────────────────────────────────────

  app.get("/api/projects/current", async (req, res) => {
    try {
      const config = engine.getConfig();
      const branches = await engine.listBranches();
      const status = await engine.status();
      
      res.json({
        id: "proj_01",
        name: config.name,
        adapterType: config.adapter,
        branches,
        status
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/proposals", (req, res) => {
    try {
      const proposals = proposalManager.listProposals();
      res.json(proposals);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/proposals/:id", (req, res) => {
    try {
      const proposal = proposalManager.getProposal(req.params.id);
      if (!proposal) return res.status(404).json({ error: "Not found" });
      res.json(proposal);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/proposals/:id/approve", (req, res) => {
    try {
      const reviewer = req.body.reviewer || { type: "human", name: "Reviewer" };
      const proposal = proposalManager.approveProposal(req.params.id, reviewer);
      res.json(proposal);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/proposals/:id/reject", (req, res) => {
    try {
      const reviewer = req.body.reviewer || { type: "human", name: "Reviewer" };
      const reason = req.body.reason || "Rejected via dashboard";
      const proposal = proposalManager.rejectProposal(req.params.id, reviewer, reason);
      res.json(proposal);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/proposals/:id/change-groups/:groupId", (req, res) => {
    try {
      const { status } = req.body;
      const proposal = proposalManager.setChangeGroupStatus(req.params.id, req.params.groupId, status);
      res.json(proposal);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/proposals/:id/apply", async (req, res) => {
    try {
      const proposal = proposalManager.getProposal(req.params.id);
      if (!proposal) return res.status(404).json({ error: "Not found" });

      if (proposal.status !== "approved") {
        return res.status(400).json({ error: "Cannot apply unapproved proposal" });
      }

      // In a full implementation, this would selectively merge only the approved change groups
      // For MVP, we merge the branch via git
      await engine.merge(proposal.sourceBranch);
      
      proposal.status = "merged";
      proposalManager.saveProposal(proposal);

      res.json(proposal);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fallback for SPA routing if needed
  app.get("*", (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(dashboardDir, "index.html"));
    } else {
      res.status(404).json({ error: "Not found" });
    }
  });

  app.listen(port, () => {
    console.log(`EditVCS API & Dashboard running on http://localhost:${port}`);
  });
}
