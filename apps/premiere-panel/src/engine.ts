import { isCepRuntime } from './cep-runtime';
// Panel-side client for the EditVCS companion service.
//
// All filesystem work (hashing, storage, restore-as-copy, sync) happens in the
// companion service over a localhost HTTP API. The panel never touches the
// active project file directly, so restore can never overwrite it.

export const COMPANION_PORT = 8731;

export type ProjectVersion = {
  id: string;
  projectId: string;
  versionNumber: number;
  filename: string;
  contentHash: string;
  createdAt: string;
  checkpointType: "auto" | "manual";
  note?: string;
};

export type SyncTargetInput = {
  type: "local" | "github";
  path?: string;
  remoteUrl?: string;
};

type RawSnapshot = {
  id: string;
  projectId: string;
  sequenceNumber: number;
  createdAt: string;
  trigger: string;
  label?: string;
  projectFile: {
    originalFileName: string;
    sha256: string;
  };
};

/**
 * Supervisor states used by the UI to show appropriate feedback.
 */
export type CompanionStatus =
  | "unknown"       // Initial state, haven't checked yet
  | "starting"      // Spawning the companion process
  | "connected"     // Healthy and authenticated
  | "pairing-required" // Healthy, awaiting authorization
  | "reconnecting"  // Was connected, lost connection, auto-restarting
  | "failed";       // Exhausted restart attempts

export class CompanionClient {
  private baseUrl: string;
  private token: string | null = null;
  private currentProjectId: string | null = null;
  public onUnauthorized?: () => void;
  public onStatusChange?: (status: CompanionStatus) => void;

  // Supervisor state
  private _status: CompanionStatus = "unknown";
  private restartAttempts = 0;
  private readonly maxRestarts = 5;
  private readonly baseRestartDelayMs = 2_000;
  private lastSuccessfulConnect = 0;
  private supervisorPromise: Promise<boolean> | null = null;
  private supervisorGeneration = -1;
  private sessionGeneration = 0;

  // Expose for testing/UI
  public get sessionToken() { return this.token; }
  public set sessionToken(t: string | null) {
    this.sessionGeneration++;
    this.token = t;
    this.currentProjectId = null;
  }

  /** Invalidate pending authentication when the panel cancels or unmounts. */
  cancelAuthentication(): void { this.sessionGeneration++; }

  public get status(): CompanionStatus { return this._status; }

  constructor(port: number = COMPANION_PORT) {
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  private setStatus(s: CompanionStatus): void {
    if (this._status !== s) {
      this._status = s;
      this.onStatusChange?.(s);
    }
  }

  private async fetchJson(path: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
      const body: unknown = await response.json();
      return { ok: response.ok, status: response.status, body };
    } finally { clearTimeout(timer); }
  }

  async startPairing(): Promise<{ pairingId: string; expiresAt: number } | null> {
    try {
      const res = await this.fetchJson(`/pair/start`, { method: "POST" });
      if (!res.ok) return null;
      return res.body as { pairingId: string; expiresAt: number };
    } catch {
      return null;
    }
  }

  async completePairing(pairingId: string, code: string): Promise<boolean> {
    const generation = this.sessionGeneration;
    try {
      const res = await this.fetchJson(`/pair/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairingId, code })
      });
      if (!res.ok || generation !== this.sessionGeneration) return false;
      const body = res.body as { sessionToken: string };
      if (typeof body.sessionToken !== "string" || !body.sessionToken) return false;
      this.sessionToken = body.sessionToken;
      this.setStatus("connected");
      return true;
    } catch {
      return false;
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T | null> {
    if (!this.token) return null;
    const token = this.token;
    const generation = this.sessionGeneration;
    try {
      const res = await this.fetchJson(path, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        }
      });
      if (generation !== this.sessionGeneration || token !== this.token) return null;
      if (res.status === 401) {
        this.sessionToken = null;
        this.onUnauthorized?.();
        return null;
      }
      if (!res.ok) {
        try {
          const errBody = res.body;
          console.error("API REQUEST ERROR:", errBody);
        } catch {
          console.error("API REQUEST FAILED WITH STATUS:", res.status);
        }
        return null;
      }
      return res.body as T;
    } catch (e) {
      console.error("API REQUEST EXCEPTION:", e);
      return null;
    }
  }

  /** Used by the UI to show a disconnected state. */
  async isReachable(): Promise<boolean> {
    try {
      const res = await this.fetchJson(`/health`);
      return res.ok && (res.body as { status?: string })?.status === "ok";
    } catch {
      return false;
    }
  }

  // ── Supervisor: Ensure companion is running ────────────────────────────

  /**
   * Main entry point for zero-config startup. Called by App.tsx on init
   * and whenever a health check fails.
   *
   * 1. If already reachable + authenticated → return true
   * 2. If not reachable → spawn the companion with auto-pair token
   * 3. On failure → retry with exponential backoff up to maxRestarts
   *
   * Returns true if the companion is running and the client is authenticated.
   */
  ensureRunning(): Promise<boolean> {
    const generation = this.sessionGeneration;
    if (this.supervisorPromise && this.supervisorGeneration === generation) return this.supervisorPromise;
    this.supervisorGeneration = generation;
    const attempt = this.ensureRunningAttempt(generation);
    this.supervisorPromise = attempt;
    void attempt.finally(() => {
      if (this.supervisorPromise === attempt) this.supervisorPromise = null;
    });
    return attempt;
  }

  private async ensureRunningAttempt(generation: number): Promise<boolean> {
    const reachable = await this.isReachable();
    if (generation !== this.sessionGeneration) return false;
    if (reachable) {
      // Health is public. Prove the stored token works before opening the panel.
      if (!this.token) {
        this.setStatus("pairing-required");
        return false;
      }
      try {
        const auth = await this.fetchJson("/snapshots", {
          headers: { authorization: `Bearer ${this.token}` }
        });
        if (generation !== this.sessionGeneration) return false;
        if (auth.status === 401) {
          this.sessionToken = null;
          this.setStatus("pairing-required");
          this.onUnauthorized?.();
          return false;
        }
        if (!auth.ok) {
          this.setStatus("reconnecting");
          return false;
        }
      } catch {
        if (generation === this.sessionGeneration) this.setStatus("reconnecting");
        return false;
      }
      this.restartAttempts = 0;
      this.lastSuccessfulConnect = Date.now();
      this.setStatus("connected");
      return true;
    }

    if (this.restartAttempts >= this.maxRestarts) {
      this.setStatus("failed");
      return false;
    }
    this.setStatus(this.restartAttempts === 0 ? "starting" : "reconnecting");
    const success = await this.spawnCompanion(generation);
    if (generation !== this.sessionGeneration) return false;
    if (success) {
      this.setStatus("connected");
      this.restartAttempts = 0;
      this.lastSuccessfulConnect = Date.now();
      return true;
    }
    this.restartAttempts++;
    this.setStatus(this.restartAttempts >= this.maxRestarts ? "failed" : "reconnecting");
    return false;
  }

  /** Clear local authorization immediately; remote revocation is bounded. */
  async disconnect(): Promise<boolean> {
    const token = this.token;
    this.sessionToken = null;
    if (!token) return true;
    try {
      const response = await this.fetchJson("/sessions/revoke", {
        method: "POST", headers: { authorization: `Bearer ${token}` }
      });
      return response.ok;
    } catch { return false; }
  }

  /**
   * Reset the restart counter. Called by App.tsx after the companion has been
   * running successfully for a sustained period (e.g. 30 seconds).
   */
  resetRestartCounter(): void {
    this.restartAttempts = 0;
    if (this._status === "failed") {
      this.setStatus("unknown");
    }
  }

  /**
   * Get the delay before the next restart attempt (exponential backoff).
   */
  getRestartDelayMs(): number {
    return Math.min(this.baseRestartDelayMs * Math.pow(2, this.restartAttempts), 30_000);
  }

  /**
   * Spawn the companion process with an auto-pair token.
   * Works only in the CEP environment where `window.require` is available.
   */
  private async spawnCompanion(generation: number): Promise<boolean> {
    // Must be in CEP environment to spawn process
    if (!isCepRuntime() || !(window as any).require) return false;

    try {
      const crypto = (window as any).require("crypto");
      const cp = (window as any).require("child_process");
      const path = (window as any).require("path");
      const fs = (window as any).require("fs");
      const nodeProcess = (window as any).require("process");

      // Generate a secure auto-pairing token
      const autoPairToken = crypto.randomBytes(32).toString("hex");

      // Locate the companion service executable
      let exePath = "";
      if ((window as any).CSInterface) {
        const csInterface = new (window as any).CSInterface();
        const extensionPath = csInterface.getSystemPath("extension");
        exePath = path.join(extensionPath, "server", "companion.cjs");

        // Fallback for local development monorepo
        if (!fs.existsSync(exePath)) {
          exePath = path.join(extensionPath, "../companion-service/dist/companion.cjs");
        }
      }

      if (!exePath || !fs.existsSync(exePath)) {
        console.error("Auto-start failed: Could not locate companion.cjs at", exePath);
        return false;
      }

      // Spawn the companion server in the background
      const env = Object.assign({}, nodeProcess.env, { EDITVCS_AUTO_PAIR_TOKEN: autoPairToken });
      // CEP's process.execPath is Adobe/CEF, not a supported standalone Node runtime.
      const nodeExecutable = nodeProcess.env.EDITVCS_NODE_EXECUTABLE || "node";
      const child = cp.spawn(nodeExecutable, [exePath], {
        detached: true,
        stdio: "ignore",
        env
      });

      let exited = false;
      child.once("error", () => { exited = true; });
      child.once("exit", () => { exited = true; });
      child.unref();

      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (exited || generation !== this.sessionGeneration) return false;
        if (await this.isReachable()) {
          if (generation !== this.sessionGeneration) return false;
          // Another companion may have won the port race. Prove the spawned
          // bootstrap token is accepted before treating this client as paired.
          const auth = await this.fetchJson("/snapshots", { headers: { authorization: `Bearer ${autoPairToken}` } });
          if (auth.ok && generation === this.sessionGeneration) { this.token = autoPairToken; return true; }
          return false;
        }
      }
      return false;
    } catch (e) {
      console.error("Auto-start failed with error:", e);
      return false;
    }
  }

  // ── Project & snapshot operations ──────────────────────────────────────

  async registerProject(projectPath: string): Promise<string | null> {
    const res = await this.request<{ projectId: string }>("/projects/register", {
      method: "POST",
      body: JSON.stringify({ projectPath })
    });
    if (res?.projectId) {
      this.currentProjectId = res.projectId;
      return res.projectId;
    }
    return null;
  }

  async listSnapshots(projectId: string = this.currentProjectId!): Promise<ProjectVersion[]> {
    if (!projectId) return [];
    const all = await this.request<RawSnapshot[]>(`/snapshots?projectId=${projectId}`);
    if (!all) return [];
    
    return all
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((s) => ({
        id: s.id,
        projectId: s.projectId,
        versionNumber: s.sequenceNumber,
        filename: s.projectFile.originalFileName,
        contentHash: s.projectFile.sha256,
        createdAt: s.createdAt,
        checkpointType: s.trigger === "automatic" ? "auto" : "manual",
        note: s.label
      }));
  }

  async createSnapshot(
    projectId: string = this.currentProjectId!,
    type: "auto" | "manual" = "auto",
    note?: string,
    manifest?: any,
    manifestStatus?: string,
    manifestReason?: string
  ): Promise<{ created: boolean; message?: string }> {
    if (!projectId) return { created: false, message: "No active project registered." };
    const res = await this.request<{ created: boolean; message?: string }>("/snapshots/manual", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        label: note || (type === "manual" ? "Manual save point" : "Automatic save point"),
        trigger: type === "manual" ? "manual" : "automatic",
        manifest,
        manifestStatus,
        manifestReason
      })
    });
    return res ?? { created: false, message: "Companion request failed. Check the companion connection and retry." };
  }

  /** Restore as a new copy beside the active project. Never overwrites it. */
  async restore(version: ProjectVersion, destinationDirectory: string): Promise<string | null> {
    const res = await this.request<{ restoredPath: string }>("/snapshots/restore-copy", {
      method: "POST",
      body: JSON.stringify({
        projectId: version.projectId,
        snapshotId: version.id,
        destinationDirectory
      })
    });
    return res ? res.restoredPath : null;
  }

  async getChanges(projectId: string, fromSnapshotId: string, toSnapshotId: string): Promise<{
    fromSnapshotId: string;
    toSnapshotId: string;
    confidence: string;
    summary: string[];
    groups: Array<{ title: string; items: string[] }>;
    unsupported: string[];
  } | null> {
    return this.request<{
      fromSnapshotId: string;
      toSnapshotId: string;
      confidence: string;
      summary: string[];
      groups: Array<{ title: string; items: string[] }>;
      unsupported: string[];
    }>(`/projects/${projectId}/changes?from=${fromSnapshotId}&to=${toSnapshotId}`);
  }

  async startWatching(projectId: string): Promise<boolean> {
    const res = await this.request<{ status: string }>(`/projects/${projectId}/watch/start`, { method: "POST" });
    return res?.status === "watching";
  }

  async stopWatching(projectId: string): Promise<boolean> {
    const res = await this.request<{ status: string }>(`/projects/${projectId}/watch/stop`, { method: "POST" });
    return res?.status === "stopped";
  }

  async getWatchStatus(projectId: string): Promise<string> {
    const res = await this.request<{ status: string }>(`/projects/${projectId}/watch/status`);
    return res?.status ?? "stopped";
  }

  async sync(target: SyncTargetInput): Promise<{ pushed: number; pulled: number; errors: string[] } | null> {
    await this.request("/sync/config", { method: "POST", body: JSON.stringify(target) });
    return this.request<{ pushed: number; pulled: number; errors: string[] }>("/sync", {
      method: "POST"
    });
  }
}

export const companionClient = new CompanionClient();
