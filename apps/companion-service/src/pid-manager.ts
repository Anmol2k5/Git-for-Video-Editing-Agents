import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export interface PidFileContents {
  pid: number;
  port: number;
  startedAt: string;
  heartbeat: string;
  autoPairTokenHash?: string;
  ownerId?: string;
}

const PID_FILENAME = "companion.pid";
const HEARTBEAT_INTERVAL_MS = 5_000;
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";
const hasCode = (error: unknown, code: string) => (error as NodeJS.ErrnoException).code === code;

function isDead(pid: number): boolean {
  try { process.kill(pid, 0); }
  catch (error) { return hasCode(error, "ESRCH"); }
  return false;
}

async function readRecord(filename: string): Promise<{ raw: string; contents: Record<string, unknown> } | null> {
  try {
    const info = await fs.lstat(filename);
    if (!info.isFile()) throw new Error(`Ambiguous companion ownership: ${filename} is not a regular file.`);
    const raw = await fs.readFile(filename, "utf8");
    const contents: unknown = JSON.parse(raw);
    if (!contents || typeof contents !== "object" || !("pid" in contents) ||
      !Number.isInteger(contents.pid) || (contents.pid as number) <= 0) {
      throw new Error(`Invalid companion ownership: ${filename}`);
    }
    return { raw, contents: contents as Record<string, unknown> };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/**
 * Serialize all cooperating writers, including stale cleanup. A complete gate
 * record is published with an exclusive hard link, so a crash cannot expose a
 * half-written owner PID. Unknown ownership always blocks mutation.
 */
async function withMutationGate<T>(storageRoot: string, operation: () => Promise<T>): Promise<T> {
  await fs.mkdir(storageRoot, { recursive: true });
  return withGate(storageRoot, path.join(storageRoot, `${PID_FILENAME}.lock`), operation, 0);
}

async function withGate<T>(storageRoot: string, gate: string, operation: () => Promise<T>, depth: number): Promise<T> {
  if (depth >= 32) throw new Error("Companion ownership recovery is ambiguous; inspect the storage directory.");
  const ownerId = randomUUID();
  const candidate = `${gate}.${ownerId}.tmp`;
  const ownRecord = JSON.stringify({ pid: process.pid, ownerId });
  await fs.writeFile(candidate, ownRecord, { encoding: "utf8", flag: "wx", mode: 0o600 });
  let acquired = false;
  try {
    for (let attempt = 0; attempt < 500; attempt++) {
      try {
        await fs.link(candidate, gate);
        acquired = true;
        break;
      } catch (error) {
        if (!hasCode(error, "EEXIST")) throw error;
      }
      const previous = await readRecord(gate);
      if (!previous) continue;
      if (isDead(previous.contents.pid as number)) {
        // All removers of this exact dead generation share one recovery gate.
        // Holding it closes the check/unlink race with other stale removers.
        // Its complete PID record also permits recovery if the remover dies.
        const generation = createHash("sha256").update(path.basename(gate)).update(previous.raw).digest("hex");
        const recovery = path.join(storageRoot, `.companion-recovery-${generation}`);
        await withGate(storageRoot, recovery, async () => {
          if ((await readRecord(gate))?.raw === previous.raw) await fs.unlink(gate);
        }, depth + 1);
      } else {
        await delay(10);
      }
    }
    if (!acquired) throw new Error("Companion ownership is busy; retry after the current operation completes.");
    return await operation();
  } finally {
    try {
      if (acquired && (await readRecord(gate))?.raw === ownRecord) await fs.unlink(gate);
    } finally {
      await fs.unlink(candidate).catch(error => { if (!isMissing(error)) throw error; });
    }
  }
}

async function publish(filename: string, contents: PidFileContents, replace: boolean): Promise<void> {
  const candidate = `${filename}.${randomUUID()}.tmp`;
  await fs.writeFile(candidate, JSON.stringify(contents, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    if (replace) await fs.rename(candidate, filename);
    else await fs.link(candidate, filename);
  } finally {
    await fs.unlink(candidate).catch(error => { if (!isMissing(error)) throw error; });
  }
}

export class PidManager {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly pidFilePath: string;
  private ownerId: string | null = null;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(
    private storageRoot: string,
    private port: number,
    private onOwnershipLost?: (error: Error) => void
  ) {
    this.pidFilePath = path.join(storageRoot, PID_FILENAME);
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }

  /** Exclusively claim storage before opening the HTTP listener or writing snapshots. */
  async acquire(autoPairToken?: string): Promise<void> {
    return this.serialize(() => withMutationGate(this.storageRoot, async () => {
      const previous = await readRecord(this.pidFilePath);
      if (previous && !isDead(previous.contents.pid as number)) {
        throw new Error(`Another companion owns this storage (PID ${previous.contents.pid}, port ${previous.contents.port}).`);
      }
      const ownerId = randomUUID();
      const now = new Date().toISOString();
      const contents: PidFileContents = { pid: process.pid, port: this.port, startedAt: now, heartbeat: now, ownerId };
      if (autoPairToken) contents.autoPairTokenHash = createHash("sha256").update(autoPairToken).digest("hex");
      await publish(this.pidFilePath, contents, previous !== null);
      this.ownerId = ownerId;
    }));
  }

  /** Release only this acquisition, after any in-flight heartbeat has finished. */
  async release(): Promise<void> {
    this.stopHeartbeat();
    return this.serialize(async () => {
      if (!this.ownerId) return;
      await withMutationGate(this.storageRoot, async () => {
        const previous = await readRecord(this.pidFilePath);
        if (previous?.contents.ownerId === this.ownerId && previous.contents.pid === process.pid) {
          await fs.unlink(this.pidFilePath);
        }
        this.ownerId = null;
      });
    });
  }

  startHeartbeat(): void {
    if (this.heartbeatTimer || !this.ownerId) return;
    this.heartbeatTimer = setInterval(() => {
      void this.serialize(async () => {
        if (!this.ownerId) return;
        await withMutationGate(this.storageRoot, async () => {
          const previous = await readRecord(this.pidFilePath);
          if (previous?.contents.ownerId !== this.ownerId || previous.contents.pid !== process.pid) {
            this.loseOwnership(new Error("Companion storage ownership was removed or replaced."));
            return;
          }
          const contents = previous.contents as unknown as PidFileContents;
          contents.heartbeat = new Date().toISOString();
          await publish(this.pidFilePath, contents, true);
        });
      }).catch(error => {
        // Losing the ability to prove ownership must also stop HTTP writers.
        this.loseOwnership(error);
      });
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref();
  }

  private loseOwnership(reason: unknown): void {
    const owned = this.ownerId !== null;
    this.ownerId = null;
    this.stopHeartbeat();
    if (owned) this.onOwnershipLost?.(reason instanceof Error ? reason : new Error("Companion storage ownership could not be verified."));
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  /** Only ENOENT means absent; corrupt/unreadable records conservatively block startup. */
  static async isRunning(storageRoot: string): Promise<{ running: boolean; pid?: number; port?: number; stale?: boolean }> {
    try {
      const record = await readRecord(path.join(storageRoot, PID_FILENAME));
      if (!record) return { running: false };
      const pid = record.contents.pid as number;
      if (isDead(pid)) return { running: false, stale: true, pid };
      return { running: true, pid, port: record.contents.port as number | undefined };
    } catch {
      return { running: true };
    }
  }

  /** Recheck liveness under the same gate as acquire; never remove a live or unknown owner. */
  static async clearStale(storageRoot: string): Promise<void> {
    await withMutationGate(storageRoot, async () => {
      let record;
      try { record = await readRecord(path.join(storageRoot, PID_FILENAME)); }
      catch { return; }
      if (record && isDead(record.contents.pid as number)) await fs.unlink(path.join(storageRoot, PID_FILENAME));
    });
  }
}
