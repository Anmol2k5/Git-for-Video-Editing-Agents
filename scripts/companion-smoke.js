import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const defaultCompanion = fileURLToPath(new URL("../apps/companion-service/dist/companion.cjs", import.meta.url));

async function availablePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return port;
}

/** Runs only against owned children and disposable project/storage directories. */
export async function runCompanionSmoke({ companionPath = defaultCompanion, port, startupTimeoutMs = 10000, requestTimeoutMs = 3000, shutdownTimeoutMs = 5000 } = {}) {
  const smokePort = port ?? await availablePort();
  const root = await mkdtemp(path.join(os.tmpdir(), "editvcs-functional-smoke-"));
  const storageRoot = path.join(root, "storage");
  const project = path.join(root, "Film.prproj");
  const restoreDirectory = path.join(root, "restored");
  const base = `http://127.0.0.1:${smokePort}`;
  let owned;

  function requireAlive(record, step) {
    if (record.failed || record.child.exitCode !== null || record.child.signalCode !== null) {
      throw new Error(`Spawned companion exited during ${step}.`);
    }
  }

  async function request(record, pathname, token, init = {}, timeoutMs = requestTimeoutMs) {
    requireAlive(record, "request");
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const response = await fetch(base + pathname, {
        ...init, signal: abort.signal,
        headers: { origin: "null", "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }
      });
      const body = await response.json();
      requireAlive(record, "request completion");
      return { status: response.status, body };
    } finally { clearTimeout(timer); }
  }

  async function start(token) {
    const child = spawn(process.execPath, [companionPath], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: { ...process.env, EDITVCS_STORAGE_ROOT: storageRoot, EDITVCS_COMPANION_PORT: String(smokePort), EDITVCS_AUTO_PAIR_TOKEN: token }
    });
    const record = { child, failed: false, closed: null };
    record.closed = new Promise(resolve => {
      child.once("error", () => { record.failed = true; });
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    owned = record;
    const deadline = Date.now() + startupTimeoutMs;
    while (Date.now() < deadline) {
      requireAlive(record, "startup");
      try {
        const remaining = Math.max(1, Math.min(requestTimeoutMs, deadline - Date.now()));
        const health = await request(record, "/health", null, {}, remaining);
        if (health.status === 200 && health.body.status === "ok") {
          const auth = await request(record, "/snapshots", token, {}, Math.max(1, Math.min(requestTimeoutMs, deadline - Date.now())));
          // Prove both session ownership and isolated process ownership.
          const pid = JSON.parse(await readFile(path.join(storageRoot, "companion.pid"), "utf8"));
          if (auth.status === 200 && Array.isArray(auth.body) && pid.pid === child.pid && pid.port === smokePort) {
            requireAlive(record, "startup authentication");
            return record;
          }
        }
      } catch { requireAlive(record, "startup"); }
      await delay(Math.min(50, Math.max(1, deadline - Date.now())));
    }
    throw new Error("Companion startup deadline exceeded: owned-process readiness and authentication were not established.");
  }

  async function stop(signal = "SIGTERM", requireGraceful = false) {
    const record = owned;
    if (!record) return;
    if (requireGraceful) requireAlive(record, "graceful shutdown");
    let ipcFailed = false;
    if (record.child.exitCode === null && record.child.signalCode === null && !record.failed) {
      if (requireGraceful && record.child.connected) {
        record.child.send({ type: "editvcs:shutdown" }, error => { if (error) ipcFailed = true; });
      } else {
        if (requireGraceful) ipcFailed = true;
        record.child.kill(signal);
      }
    }
    async function waitForClose(timeoutMs) {
      let timer;
      try {
        return await Promise.race([record.closed, new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); })]);
      } finally { clearTimeout(timer); }
    }
    let result = await waitForClose(shutdownTimeoutMs);
    const forced = result === null;
    if (forced) {
      record.child.kill("SIGKILL");
      result = await waitForClose(2000);
      if (result === null) throw new Error("Owned companion did not terminate within the cleanup deadline.");
    }
    owned = undefined;
    if (requireGraceful) {
      if (forced || ipcFailed || result.code !== 0 || result.signal !== null) {
        throw new Error("Companion graceful shutdown failed: normal clean exit was not observed.");
      }
      try {
        await readFile(path.join(storageRoot, "companion.pid"));
        throw new Error("Companion graceful shutdown failed to release its PID file.");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }

  async function api(record, token, pathname, payload) {
    const response = await request(record, pathname, token, payload === undefined ? {} : { method: "POST", body: JSON.stringify(payload) });
    assert.equal(response.status, 200, `Unexpected response status for ${pathname}`);
    return response.body;
  }

  try {
    await mkdir(restoreDirectory);
    await writeFile(project, "EditVCS smoke project A");
    let token = randomBytes(32).toString("hex");
    let record = await start(token);
    const { projectId } = await api(record, token, "/projects/register", { projectPath: project });
    assert.equal(typeof projectId, "string");
    const first = await api(record, token, "/snapshots/manual", { projectId, label: "Smoke A" });
    assert.equal(first.created, true);
    const duplicate = await api(record, token, "/snapshots/manual", { projectId, label: "Duplicate A" });
    assert.equal(duplicate.created, false);
    await writeFile(project, "EditVCS smoke project B");
    const second = await api(record, token, "/snapshots/manual", { projectId, label: "Smoke B" });
    assert.equal(second.created, true); assert.notEqual(second.snapshot.id, first.snapshot.id);
    const restored = await api(record, token, "/snapshots/restore-copy", { projectId, snapshotId: first.snapshot.id, destinationDirectory: restoreDirectory });
    assert.equal(await readFile(restored.restoredPath, "utf8"), "EditVCS smoke project A");
    assert.equal(await readFile(project, "utf8"), "EditVCS smoke project B");

    for (const signal of ["SIGTERM", "SIGKILL"]) {
      const previousToken = token;
      await stop(signal, signal === "SIGTERM");
      token = randomBytes(32).toString("hex");
      record = await start(token);
      assert.equal((await request(record, "/snapshots", previousToken)).status, 401);
      const registered = await api(record, token, "/projects/register", { projectPath: project });
      assert.equal(registered.projectId, projectId);
      const history = await api(record, token, `/snapshots?projectId=${encodeURIComponent(projectId)}`);
      assert.equal(history.length, 2);
      assert.deepEqual(new Set(history.map(snapshot => snapshot.id)), new Set([first.snapshot.id, second.snapshot.id]));
    }
    const afterRestart = await api(record, token, "/snapshots/restore-copy", { projectId, snapshotId: first.snapshot.id, destinationDirectory: restoreDirectory });
    assert.notEqual(afterRestart.restoredPath, restored.restoredPath);
    assert.equal(await readFile(afterRestart.restoredPath, "utf8"), "EditVCS smoke project A");
    assert.equal(await readFile(restored.restoredPath, "utf8"), "EditVCS smoke project A");
    const restoredSecond = await api(record, token, "/snapshots/restore-copy", { projectId, snapshotId: second.snapshot.id, destinationDirectory: restoreDirectory });
    assert.equal(await readFile(restoredSecond.restoredPath, "utf8"), "EditVCS smoke project B");
    assert.equal(await readFile(project, "utf8"), "EditVCS smoke project B");
    return { snapshots: 2, restoreVerified: true, restartVerified: true };
  } finally {
    // Keep storage intact if an owned process could not be stopped.
    await stop();
    await rm(root, { recursive: true, force: true });
  }
}
