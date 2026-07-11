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
  objectPath?: string;
};

export type SyncTargetInput = {
  type: "local" | "github";
  path?: string;
  remoteUrl?: string;
};

type RawSnapshot = {
  id: string;
  projectId: string;
  createdAt: string;
  trigger: string;
  label?: string;
  projectFile: {
    originalFileName: string;
    sha256: string;
    objectPath: string;
  };
};

export class CompanionClient {
  private baseUrl: string;
  private token: string | null = null;
  private currentProjectId: string | null = null;
  
  // Expose for testing/UI
  public get sessionToken() { return this.token; }
  public set sessionToken(t: string | null) { this.token = t; }

  constructor(port: number = COMPANION_PORT) {
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  async startPairing(): Promise<{ pairingId: string; expiresAt: number; code: string } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/pair/start`, { method: "POST" });
      if (!res.ok) return null;
      return (await res.json()) as { pairingId: string; expiresAt: number; code: string };
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
      const body = (await res.json()) as { token: string };
      this.token = body.token;
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
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
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
      .map((s, i) => ({
        id: s.id,
        projectId: s.projectId,
        versionNumber: i + 1,
        filename: s.projectFile.originalFileName,
        contentHash: s.projectFile.sha256,
        createdAt: s.createdAt,
        checkpointType: s.trigger === "automatic" ? "auto" : "manual",
        note: s.label,
        objectPath: s.projectFile.objectPath
      }));
  }

  async createSnapshot(
    projectId: string = this.currentProjectId!,
    type: "auto" | "manual" = "auto",
    note?: string
  ): Promise<boolean> {
    if (!projectId) return false;
    const res = await this.request<{ created: boolean }>("/snapshots/manual", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        label: note || (type === "manual" ? "Manual save point" : "Automatic save point")
      })
    });
    return res?.created === true;
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

  async sync(target: SyncTargetInput): Promise<{ pushed: number; pulled: number; errors: string[] } | null> {
    await this.request("/sync/config", { method: "POST", body: JSON.stringify(target) });
    return this.request<{ pushed: number; pulled: number; errors: string[] }>("/sync", {
      method: "POST"
    });
  }

  /** Watch the project file and create automatic save points via the companion. */
  watchProject(projectPath: string, onUpdate: () => void): { close: () => void } | null {
    const requireFn = (window as any).require;
    const chokidar = requireFn ? requireFn("chokidar") : null;
    const fs = requireFn ? requireFn("fs") : null;
    if (!chokidar || !fs || !fs.existsSync(projectPath)) return null;

    const watcher = chokidar.watch(projectPath, {
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }
    });

    let timer: any = null;
    watcher.on("change", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        if (!this.currentProjectId) await this.registerProject(projectPath);
        await this.createSnapshot(this.currentProjectId!, "auto");
        onUpdate();
      }, 1000);
    });

    return { close: () => watcher.close() };
  }
}

export const companionClient = new CompanionClient();
