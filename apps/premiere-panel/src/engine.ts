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

export class CompanionClient {
  private baseUrl: string;
  private token: string | null = null;
  private currentProjectId: string | null = null;
  public onUnauthorized?: () => void;
  
  // Expose for testing/UI
  public get sessionToken() { return this.token; }
  public set sessionToken(t: string | null) { this.token = t; }

  constructor(port: number = COMPANION_PORT) {
    this.baseUrl = `http://127.0.0.1:${port}`;
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
