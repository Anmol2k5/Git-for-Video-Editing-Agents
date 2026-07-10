// Panel-side client for the EditVCS companion service.
//
// All filesystem work (hashing, storage, restore-as-copy, sync) happens in the
// companion service over a localhost HTTP API. The panel never touches the
// active project file directly, so restore can never overwrite it.

// The companion binds to 127.0.0.1 on this port. Keep in sync with
// apps/companion-service/src/server-start.ts.
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
  private baseUrl = `http://127.0.0.1:${COMPANION_PORT}`;
  private token: string | null = null;

  private async ensureToken(): Promise<boolean> {
    if (this.token) return true;
    try {
      const res = await fetch(`${this.baseUrl}/pair`, { method: "POST" });
      if (!res.ok) return false;
      const body = (await res.json()) as { token: string };
      this.token = body.token;
      return true;
    } catch {
      return false;
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T | null> {
    const authed = await this.ensureToken();
    if (!authed) return null;
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

  private basename(p: string): string {
    return p.split(/[\\/]/).pop() ?? p;
  }

  private dirname(p: string): string {
    const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return i < 0 ? "." : p.slice(0, i);
  }

  async listSnapshots(projectPath: string): Promise<ProjectVersion[]> {
    const all = await this.request<RawSnapshot[]>("/snapshots");
    if (!all) return [];
    const name = this.basename(projectPath);
    return all
      .filter((s) => s.projectFile?.originalFileName === name)
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
    projectPath: string,
    type: "auto" | "manual" = "auto",
    note?: string
  ): Promise<boolean> {
    const res = await this.request("/snapshots/manual", {
      method: "POST",
      body: JSON.stringify({
        projectPath,
        label: note || (type === "manual" ? "Manual save point" : "Automatic save point")
      })
    });
    return res !== null;
  }

  /** Restore as a new copy beside the active project. Never overwrites it. */
  async restore(version: ProjectVersion, projectPath: string): Promise<string | null> {
    const res = await this.request<{ restoredPath: string }>("/snapshots/restore-copy", {
      method: "POST",
      body: JSON.stringify({
        originalProjectPath: projectPath,
        objectPath: version.objectPath,
        destinationDirectory: this.dirname(projectPath),
        label: version.note || "Save point",
        createdAt: version.createdAt
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
        await this.createSnapshot(projectPath, "auto");
        onUpdate();
      }, 1000);
    });

    return { close: () => watcher.close() };
  }
}

export const companionClient = new CompanionClient();
