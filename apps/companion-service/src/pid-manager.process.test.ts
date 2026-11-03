import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { PidManager } from "./pid-manager";

let fixtureRoot: string;
let executable: string;
const roots: string[] = [];
const owned: Array<{ child: ChildProcess; closed: Promise<unknown> }> = [];
beforeAll(async () => {
  fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "editvcs-owner-fixture-"));
  executable = path.join(fixtureRoot, "owner.cjs");
  await build({
    stdin: { contents: `
      import { PidManager } from './src/pid-manager';
      const manager = new PidManager(process.env.TEST_STORAGE_ROOT, Number(process.env.TEST_PORT));
      process.on('message', async message => {
        if (message?.type === 'acquire') {
          try { await manager.acquire('test-bootstrap-token'); manager.startHeartbeat(); process.send({ type: 'acquired' }); }
          catch { process.send({ type: 'rejected' }); }
        } else if (message?.type === 'release') {
          await manager.release();
          process.exit(0);
        }
      });
      process.send({ type: 'ready' });
    `, resolveDir: process.cwd() },
    outfile: executable, bundle: true, platform: "node", format: "cjs",
  });
});
afterEach(async () => {
  for (const { child, closed } of owned.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await closed;
  }
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
afterAll(async () => { await rm(fixtureRoot, { recursive: true, force: true }); });
async function root() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "editvcs-owner-process-"));
  roots.push(directory);
  return directory;
}
function start(storageRoot: string, port: number) {
  const child = spawn(process.execPath, [executable], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    env: { ...process.env, TEST_STORAGE_ROOT: storageRoot, TEST_PORT: String(port) },
  });
  const closed = once(child, "close");
  owned.push({ child, closed });
  const messages: string[] = [];
  child.on("message", message => messages.push((message as { type: string }).type));
  async function waitFor(types: string[]) {
    const deadline = Date.now() + 4000;
    while (!messages.some(message => types.includes(message))) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error("Owner process exited unexpectedly.");
      if (Date.now() >= deadline) throw new Error("Owner process did not answer before the deadline.");
      await delay(5);
    }
    return messages.find(message => types.includes(message))!;
  }
  return { child, closed, waitFor };
}

it("permits one writer across simultaneous independent Node processes", async () => {
  const directory = await root();
  const contenders = Array.from({ length: 6 }, (_, index) => start(directory, 8731 + index));
  await Promise.all(contenders.map(contender => contender.waitFor(["ready"])));
  for (const contender of contenders) contender.child.send({ type: "acquire" });
  const results = await Promise.all(contenders.map(contender => contender.waitFor(["acquired", "rejected"])));
  expect(results.filter(result => result === "acquired")).toHaveLength(1);
  const winner = contenders[results.indexOf("acquired")];
  const metadata = JSON.parse(await readFile(path.join(directory, "companion.pid"), "utf8"));
  expect(metadata.pid).toBe(winner.child.pid);
  // Losers' shutdown paths must not release the surviving writer's claim.
  const losers = contenders.filter(contender => contender !== winner);
  for (const loser of losers) loser.child.send({ type: "release" });
  await Promise.all(losers.map(loser => loser.closed));
  expect(await PidManager.isRunning(directory)).toMatchObject({ running: true, pid: winner.child.pid });
  winner.child.send({ type: "release" });
  expect(await winner.closed).toEqual([0, null]);
  expect(await PidManager.isRunning(directory)).toEqual({ running: false });
});

it("recovers immediately after an owned child dies with a fresh heartbeat", async () => {
  const directory = await root();
  const first = start(directory, 8731);
  await first.waitFor(["ready"]);
  first.child.send({ type: "acquire" });
  await first.waitFor(["acquired"]);
  first.child.kill("SIGKILL");
  await first.closed;
  expect(await PidManager.isRunning(directory)).toMatchObject({ running: false, stale: true, pid: first.child.pid });
  const successor = start(directory, 8732);
  await successor.waitFor(["ready"]);
  successor.child.send({ type: "acquire" });
  expect(await successor.waitFor(["acquired", "rejected"])).toBe("acquired");
  expect(await PidManager.isRunning(directory)).toMatchObject({ running: true, pid: successor.child.pid, port: 8732 });
  successor.child.send({ type: "release" });
  expect(await successor.closed).toEqual([0, null]);
});
