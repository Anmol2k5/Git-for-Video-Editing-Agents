import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, expect, it, vi } from "vitest";
import { PidManager } from "./pid-manager";

const directories: string[] = [];
async function directory() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-pid-"));
  directories.push(dir);
  return dir;
}
const metadata = (pid = process.pid) => ({ pid, port: 8731, heartbeat: new Date().toISOString(), startedAt: new Date().toISOString() });
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

it("treats a dead owner as stale even when its last heartbeat is recent", async () => {
  const dir = await directory();
  await writeFile(path.join(dir, "companion.pid"), JSON.stringify(metadata(2147483647)));
  expect(await PidManager.isRunning(dir)).toMatchObject({ running: false, stale: true });
});

it("never takes over a live owner's storage because its heartbeat is old", async () => {
  const dir = await directory();
  await writeFile(path.join(dir, "companion.pid"), JSON.stringify({ ...metadata(), heartbeat: "2000-01-01T00:00:00Z" }));
  expect(await PidManager.isRunning(dir)).toMatchObject({ running: true, pid: process.pid, port: 8731 });
});

it("rejects a second owner without changing its metadata", async () => {
  const dir = await directory();
  const first = new PidManager(dir, 8731);
  await first.acquire("secret");
  const before = await readFile(path.join(dir, "companion.pid"), "utf8");
  await expect(new PidManager(dir, 8732).acquire()).rejects.toThrow();
  expect(await readFile(path.join(dir, "companion.pid"), "utf8")).toBe(before);
  expect(before).not.toContain("secret");
  await first.release();
});

it("allows exactly one of simultaneous acquisition attempts", async () => {
  const dir = await directory();
  const managers = Array.from({ length: 12 }, (_, index) => new PidManager(dir, 8731 + index));
  const results = await Promise.allSettled(managers.map(manager => manager.acquire()));
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  await Promise.all(managers.map(manager => manager.release()));
});

it("recovers a dead owner immediately without a heartbeat timeout", async () => {
  const dir = await directory();
  await writeFile(path.join(dir, "companion.pid"), JSON.stringify(metadata(2147483647)));
  const manager = new PidManager(dir, 8732);
  await manager.acquire();
  expect(JSON.parse(await readFile(path.join(dir, "companion.pid"), "utf8"))).toMatchObject({ pid: process.pid, port: 8732 });
  await manager.release();
});

it.each(["{broken", JSON.stringify({ pid: -1 }), "null"])("fails closed on ambiguous owner metadata: %s", async raw => {
  const dir = await directory();
  await writeFile(path.join(dir, "companion.pid"), raw);
  expect(await PidManager.isRunning(dir)).toMatchObject({ running: true });
  await expect(new PidManager(dir, 8731).acquire()).rejects.toThrow();
  await PidManager.clearStale(dir);
  expect(await readFile(path.join(dir, "companion.pid"), "utf8")).toBe(raw);
});

it("fails closed when the owner record cannot be read as a file", async () => {
  const dir = await directory();
  await mkdir(path.join(dir, "companion.pid"));
  expect(await PidManager.isRunning(dir)).toMatchObject({ running: true });
  await expect(new PidManager(dir, 8731).acquire()).rejects.toThrow();
});

it("does not release ownership it never acquired", async () => {
  const dir = await directory();
  const first = new PidManager(dir, 8731);
  await first.acquire();
  await new PidManager(dir, 8732).release();
  expect(await PidManager.isRunning(dir)).toMatchObject({ running: true, port: 8731 });
  await first.release();
});

it("does not remove or heartbeat a replaced ownership record", async () => {
  const dir = await directory();
  const manager = new PidManager(dir, 8731);
  await manager.acquire();
  const replacement = JSON.stringify({ ...metadata(), ownerId: "replacement", port: 8732 });
  await writeFile(path.join(dir, "companion.pid"), replacement);
  vi.useFakeTimers();
  manager.startHeartbeat();
  await vi.advanceTimersByTimeAsync(5000);
  await manager.release();
  expect(await readFile(path.join(dir, "companion.pid"), "utf8")).toBe(replacement);
});

it("clearStale does not remove a live owner", async () => {
  const dir = await directory();
  const manager = new PidManager(dir, 8731);
  await manager.acquire();
  await PidManager.clearStale(dir);
  expect(await PidManager.isRunning(dir)).toMatchObject({ running: true, port: 8731 });
  await manager.release();
});

it("a heartbeat queued before release cannot recreate released ownership", async () => {
  const dir = await directory();
  const manager = new PidManager(dir, 8731);
  await manager.acquire();
  vi.useFakeTimers();
  manager.startHeartbeat();
  await vi.advanceTimersByTimeAsync(5000);
  await manager.release();
  expect(await PidManager.isRunning(dir)).toEqual({ running: false });
});


it("recovers a dead mutation owner and a dead reclamation owner immediately", async () => {
  const dir = await directory();
  const gate = path.join(dir, "companion.pid.lock");
  const deadGate = JSON.stringify({ pid: 2147483647, ownerId: "dead-gate-owner" });
  await writeFile(gate, deadGate);
  const recoveryGate = path.join(dir, `.companion-recovery-${createHash("sha256").update(path.basename(gate)).update(deadGate).digest("hex")}`);
  await writeFile(recoveryGate, JSON.stringify({ pid: 2147483647, ownerId: "dead-recovery-owner" }));
  const manager = new PidManager(dir, 8731);
  await manager.acquire();
  expect(await PidManager.isRunning(dir)).toMatchObject({ running: true, pid: process.pid });
  await expect(readFile(recoveryGate)).rejects.toMatchObject({ code: "ENOENT" });
  await manager.release();
});

it("elects one owner when simultaneous contenders recover a dead mutation gate", async () => {
  const dir = await directory();
  await writeFile(path.join(dir, "companion.pid.lock"), JSON.stringify({ pid: 2147483647, ownerId: "dead-gate-owner" }));
  await writeFile(path.join(dir, "companion.pid"), JSON.stringify(metadata(2147483647)));
  const managers = Array.from({ length: 12 }, (_, index) => new PidManager(dir, 8731 + index));
  const results = await Promise.allSettled(managers.map(manager => manager.acquire()));
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  await Promise.all(managers.map(manager => manager.release()));
});


it("cannot overtake another live process while it is reclaiming a dead mutation owner", async () => {
  const dir = await directory();
  const gate = path.join(dir, "companion.pid.lock");
  const deadGate = JSON.stringify({ pid: 2147483647, ownerId: "dead-gate-owner" });
  await writeFile(gate, deadGate);
  const recoveryGate = path.join(dir, `.companion-recovery-${createHash("sha256").update(path.basename(gate)).update(deadGate).digest("hex")}`);
  await writeFile(recoveryGate, JSON.stringify({ pid: process.pid, ownerId: "live-recovery-owner" }));
  const manager = new PidManager(dir, 8731);
  const acquisition = manager.acquire();
  try {
    await delay(50);
    expect(await PidManager.isRunning(dir)).toEqual({ running: false });
  } finally {
    await unlink(recoveryGate);
    await acquisition;
    await manager.release();
  }
});

it.each(["missing", "replaced", "corrupt"])("notifies its owner when heartbeat detects %s ownership", async kind => {
  const dir = await directory();
  const errors: Error[] = [];
  const manager = new PidManager(dir, 8731, error => { errors.push(error); });
  await manager.acquire();
  const filename = path.join(dir, "companion.pid");
  const replacement = kind === "corrupt" ? "{corrupt" : JSON.stringify({ ...metadata(), ownerId: "replacement" });
  if (kind === "missing") await unlink(filename);
  else await writeFile(filename, replacement);
  vi.useFakeTimers();
  manager.startHeartbeat();
  await vi.advanceTimersByTimeAsync(5000);
  await manager.release().catch(() => undefined);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toBeInstanceOf(Error);
  if (kind === "missing") await expect(readFile(filename)).rejects.toMatchObject({ code: "ENOENT" });
  else expect(await readFile(filename, "utf8")).toBe(replacement);
});
