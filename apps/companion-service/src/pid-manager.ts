import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export interface PidFileContents {
  pid: number;
  port: number;
  startedAt: string;
  heartbeat: string;
  autoPairTokenHash?: string;
}

const PID_FILENAME = "companion.pid";
const HEARTBEAT_INTERVAL_MS = 5_000;
/** If heartbeat is older than this, the process is considered stale/crashed. */
const STALE_THRESHOLD_MS = 15_000;

export class PidManager {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pidFilePath: string;

  constructor(
    private storageRoot: string,
    private port: number
  ) {
    this.pidFilePath = path.join(storageRoot, PID_FILENAME);
  }

  /**
   * Write the PID file. Should be called once on successful server start.
   * If an autoPairToken is in use, its SHA-256 hash is stored (never the raw token).
   */
  async acquire(autoPairToken?: string): Promise<void> {
    await fs.mkdir(this.storageRoot, { recursive: true });

    const contents: PidFileContents = {
      pid: process.pid,
      port: this.port,
      startedAt: new Date().toISOString(),
      heartbeat: new Date().toISOString(),
    };

    if (autoPairToken) {
      contents.autoPairTokenHash = createHash("sha256")
        .update(autoPairToken)
        .digest("hex");
    }

    await fs.writeFile(this.pidFilePath, JSON.stringify(contents, null, 2), "utf-8");
  }

  /**
   * Remove the PID file on clean shutdown.
   */
  async release(): Promise<void> {
    this.stopHeartbeat();
    try {
      await fs.unlink(this.pidFilePath);
    } catch {
      // File may already be gone — that's fine
    }
  }

  /**
   * Start the heartbeat loop. Updates the PID file's `heartbeat` timestamp
   * every 5 seconds so external processes can detect a stale/crashed companion.
   */
  startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(async () => {
      try {
        const raw = await fs.readFile(this.pidFilePath, "utf-8");
        const contents: PidFileContents = JSON.parse(raw);
        contents.heartbeat = new Date().toISOString();
        await fs.writeFile(this.pidFilePath, JSON.stringify(contents, null, 2), "utf-8");
      } catch {
        // If we can't update the heartbeat, the file may have been
        // removed externally. Not fatal — the process is still running.
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Don't let the heartbeat timer prevent Node from exiting
    if (this.heartbeatTimer && typeof this.heartbeatTimer === "object" && "unref" in this.heartbeatTimer) {
      this.heartbeatTimer.unref();
    }
  }

  /**
   * Stop the heartbeat interval.
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Static check: Is a companion already running at the given storageRoot?
   *
   * Returns:
   * - `{ running: true, pid, port }` if the PID file has a recent heartbeat
   * - `{ running: false, stale: true, pid }` if the PID file exists but heartbeat is old
   * - `{ running: false }` if no PID file exists
   */
  static async isRunning(storageRoot: string): Promise<{
    running: boolean;
    pid?: number;
    port?: number;
    stale?: boolean;
  }> {
    const pidFilePath = path.join(storageRoot, PID_FILENAME);
    try {
      const raw = await fs.readFile(pidFilePath, "utf-8");
      const contents: PidFileContents = JSON.parse(raw);

      const heartbeatAge = Date.now() - new Date(contents.heartbeat).getTime();
      if (heartbeatAge < STALE_THRESHOLD_MS) {
        return { running: true, pid: contents.pid, port: contents.port };
      }

      // Heartbeat is stale — process probably crashed
      return { running: false, stale: true, pid: contents.pid };
    } catch {
      // No PID file or unreadable
      return { running: false };
    }
  }

  /**
   * Static: Remove a stale PID file so a new instance can start cleanly.
   */
  static async clearStale(storageRoot: string): Promise<void> {
    const pidFilePath = path.join(storageRoot, PID_FILENAME);
    try {
      await fs.unlink(pidFilePath);
    } catch {
      // Already gone
    }
  }
}
