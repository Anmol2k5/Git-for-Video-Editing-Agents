// Panel-side client for the EditVCS companion service.
//
// All filesystem work (hashing, storage, restore-as-copy, sync) happens in the
// companion service over a localhost HTTP API. The panel never touches the
// active project file directly, so restore can never overwrite it.

const COMPANION_PORT = 8731;

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
  private supervisorLock = false;

  // Expose for testing/UI
  public get sessionToken() { return this.token; }
  public set sessionToken(t: string | null) { this.token = t; }

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

  async startPairing(): Promise<{ pairingId: string; expiresAt: number } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/pair/start`, { method: "POST" });
      if (!res.ok) return null;
      return (await res.json()) as { pairingId: string; expiresAt: number };
    } catch {
      return null;
    }
  }

  async completePairing(pairingId: string, code: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/pair/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairingId, code })
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { sessionToken: string };
      this.token = body.sessionToken;
      return true;
    } catch {
      return false;
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T | null> {
    if (!this.token) return null;
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          authorization: `Bearer ${this.token}`,
          "content-type": "application/json"
        }
      });
      if (res.status === 401) {
        this.token = null;
        this.onUnauthorized?.();
      }
      if (!res.ok) {
        try {
          const errBody = await res.json() as any;
          console.error("API REQUEST ERROR:", errBody);
        } catch {
          console.error("API REQUEST FAILED WITH STATUS:", res.status);
        }
        return null;
      }
      return (await res.json()) as T;
    } catch (e) {
      console.error("API REQUEST EXCEPTION:", e);
      return null;
    }
  }

  /** Used by the UI to show a disconnected state. */
  async isReachable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      return res.ok;
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
  async ensureRunning(): Promise<boolean> {
    // Prevent concurrent supervisor calls
    if (this.supervisorLock) return this._status === "connected";
    this.supervisorLock = true;

    try {
      // Already connected and healthy?
      if (await this.isReachable() && this.token) {
        this.setStatus("connected");
        this.restartAttempts = 0;
        this.lastSuccessfulConnect = Date.now();
        return true;
      }

      // Reachable but no token? Try to start fresh with auto-pair
      if (await this.isReachable() && !this.token) {
        // Server is running but we have no session — it was started externally
        // or we lost our token. The panel needs to pair manually in this case,
        // unless we can re-spawn with a fresh auto-pair token.
        // For zero-config: kill and respawn with auto-pair token.
        // But we can't kill an external process — just try pairing as fallback
        this.setStatus("connected");
        return false; // caller will show pairing UI
      }

      // Not reachable — need to spawn
      if (this.restartAttempts >= this.maxRestarts) {
        this.setStatus("failed");
        return false;
      }

      this.setStatus(this.restartAttempts === 0 ? "starting" : "reconnecting");
      const success = await this.spawnCompanion();

      if (success) {
        this.setStatus("connected");
        this.restartAttempts = 0;
        this.lastSuccessfulConnect = Date.now();
        return true;
      }

      this.restartAttempts++;
      this.setStatus(this.restartAttempts >= this.maxRestarts ? "failed" : "reconnecting");
      return false;
    } finally {
      this.supervisorLock = false;
    }
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
  private async spawnCompanion(): Promise<boolean> {
    // Must be in CEP environment to spawn process
    if (typeof window === "undefined" || !(window as any).require) return false;

    try {
      const crypto = (window as any).require("crypto");
      const cp = (window as any).require("child_process");
      const path = (window as any).require("path");
      const fs = (window as any).require("fs");

      // Generate a secure auto-pairing token
      const autoPairToken = crypto.randomBytes(32).toString("base64url");

      // Locate the companion service executable
      let exePath = "";
      if ((window as any).CSInterface) {
        const csInterface = new (window as any).CSInterface();
        const extensionPath = csInterface.getSystemPath("extension");
        exePath = path.join(extensionPath, "server", "companion.cjs");

        // Fallback for local development monorepo
        if (!fs.existsSync(exePath)) {
          exePath = path.join(extensionPath, "../../companion-service/dist/companion.cjs");
        }
      }

      if (!exePath || !fs.existsSync(exePath)) {
        console.error("Auto-start failed: Could not locate companion.cjs at", exePath);
        return false;
      }

      // Spawn the companion server in the background
      const env = Object.assign({}, process.env, { EDITVCS_AUTO_PAIR_TOKEN: autoPairToken });
      const child = cp.spawn(process.execPath, [exePath], {
        detached: true,
        stdio: "ignore",
        env
      });

      child.unref(); // Allow the parent (Premiere panel) to exit independently of the child

      // Wait for the server to become reachable (poll up to 10 times, 500ms apart)
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (await this.isReachable()) {
          this.token = autoPairToken;
          return true;
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
    return res ?? { created: false, message: "Companion unreachable." };
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
