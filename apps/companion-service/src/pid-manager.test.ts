import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { PidManager } from "./pid-manager";

it("treats a dead owner as stale even when its last heartbeat is recent", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-pid-"));
  try {
    await writeFile(path.join(dir, "companion.pid"), JSON.stringify({ pid: 2147483647, port: 8731, heartbeat: new Date().toISOString(), startedAt: new Date().toISOString() }));
    expect(await PidManager.isRunning(dir)).toMatchObject({ running: false, stale: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it("never takes over a live owner's storage because its heartbeat is old", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-live-pid-"));
  try {
    await writeFile(path.join(dir, "companion.pid"), JSON.stringify({ pid: process.pid, port: 8731, heartbeat: "2000-01-01T00:00:00Z", startedAt: "2000-01-01T00:00:00Z" }));
    expect(await PidManager.isRunning(dir)).toMatchObject({ running: true, pid: process.pid, port: 8731 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
