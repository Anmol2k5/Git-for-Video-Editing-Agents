import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer as createHttpServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";

let fixtures: string;
let executable: string;
const directories: string[] = [];
const children: ChildProcess[] = [];
beforeAll(async () => {
  fixtures = await mkdtemp(path.join(os.tmpdir(), "editvcs-start-fixture-"));
  executable = path.join(fixtures, "companion.cjs");
  // Keep real startup, ownership, IPC, and HTTP binding. Only the app's drain
  // boundary is controlled, so we can hold it beyond the old shutdown timeout.
  await build({
    entryPoints: [path.resolve("src/server-start.ts")], outfile: executable,
    platform: "node", format: "cjs", bundle: true,
    plugins: [{ name: "controlled-server-drain", setup(builder) {
      builder.onResolve({ filter: /^\.\/server$/ }, () => ({ path: "fixture", namespace: "controlled-server-drain" }));
      builder.onLoad({ filter: /.*/, namespace: "controlled-server-drain" }, () => ({ contents: `
        import { createServer as createHttpServer } from 'node:http';
        import { readFile } from 'node:fs/promises';
        import path from 'node:path';
        export async function createServer(options) {
          let owner = null;
          try { owner = JSON.parse(await readFile(path.join(options.storageRoot, 'companion.pid'), 'utf8')); } catch {}
          process.send({ type: 'creating-server', owner });
          const server = createHttpServer((_request, response) => response.end('ready'));
          await new Promise((resolve, reject) => { server.once('error', reject); server.listen(options.port, '127.0.0.1', resolve); });
          const closeHttp = server.close.bind(server);
          server.close = callback => {
            closeHttp(error => {
              if (process.env.TEST_DRAIN === 'blocked') {
                process.send({ type: 'draining' });
                const finish = message => {
                  if (message?.type !== 'test:finish-drain') return;
                  process.off('message', finish);
                  callback(error);
                };
                process.on('message', finish);
              } else callback(process.env.TEST_DRAIN === 'error' ? new Error('drain failed') : error);
            });
            return server;
          };
          process.send({ type: 'listening' });
          return server;
        }
      ` }));
    } }],
  });
});
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close");
      child.kill("SIGKILL");
      await closed;
    }
  }
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});
afterAll(async () => { await rm(fixtures, { recursive: true, force: true }); });

async function availablePort() {
  const server = createHttpServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}
async function start(port: number, mode = "", existing?: string) {
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), "editvcs-start-"));
  directories.push(storageRoot);
  if (existing) await writeFile(path.join(storageRoot, "companion.pid"), existing);
  const child = spawn(process.execPath, [executable], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { ...process.env, EDITVCS_STORAGE_ROOT: storageRoot, EDITVCS_COMPANION_PORT: String(port), TEST_DRAIN: mode },
  });
  children.push(child);
  const messages: Array<{ type: string; owner?: { pid: number; port: number } }> = [];
  child.on("message", message => messages.push(message as typeof messages[number]));
  const closed = once(child, "close");
  async function message(type: string) {
    const deadline = Date.now() + 5000;
    while (!messages.some(item => item.type === type)) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Companion exited before ${type}`);
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${type}`);
      await delay(10);
    }
    return messages.find(item => item.type === type)!;
  }
  return { child, storageRoot, messages, message, closed };
}

it("owns storage before creating the HTTP listener", async () => {
  const port = await availablePort();
  const instance = await start(port);
  const event = await instance.message("creating-server");
  expect(event.owner).toMatchObject({ pid: instance.child.pid, port });
  await instance.message("listening");
  instance.child.send({ type: "editvcs:shutdown" });
  expect(await instance.closed).toEqual([0, null]);
  await expect(readFile(path.join(instance.storageRoot, "companion.pid"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("does not create a listener when ownership is ambiguous", async () => {
  const instance = await start(await availablePort(), "", "{corrupt");
  expect(await instance.closed).toEqual([1, null]);
  expect(instance.messages).toEqual([]);
  expect(await readFile(path.join(instance.storageRoot, "companion.pid"), "utf8")).toBe("{corrupt");
});

it("releases its startup claim when HTTP binding fails", async () => {
  const occupied = createHttpServer();
  await new Promise<void>(resolve => occupied.listen(0, "127.0.0.1", resolve));
  try {
    const instance = await start((occupied.address() as { port: number }).port);
    expect(await instance.closed).toEqual([1, null]);
    await expect(readFile(path.join(instance.storageRoot, "companion.pid"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await new Promise<void>(resolve => occupied.close(() => resolve())); }
});

it("retains ownership and stays alive until drain really completes beyond three seconds", async () => {
  const instance = await start(await availablePort(), "blocked");
  await instance.message("listening");
  instance.child.send({ type: "editvcs:shutdown" });
  await instance.message("draining");
  await delay(3200);
  expect(instance.child.exitCode).toBeNull();
  expect(JSON.parse(await readFile(path.join(instance.storageRoot, "companion.pid"), "utf8"))).toMatchObject({ pid: instance.child.pid });
  instance.child.send({ type: "test:finish-drain" });
  expect(await instance.closed).toEqual([0, null]);
  await expect(readFile(path.join(instance.storageRoot, "companion.pid"))).rejects.toMatchObject({ code: "ENOENT" });
}, 10000);

it("reports a failed drain with a nonzero exit", async () => {
  const instance = await start(await availablePort(), "error");
  await instance.message("listening");
  instance.child.send({ type: "editvcs:shutdown" });
  expect(await instance.closed).toEqual([1, null]);
});

it("shuts down with failure when its heartbeat detects replaced ownership", async () => {
  const instance = await start(await availablePort());
  await instance.message("listening");
  const replacement = JSON.stringify({ pid: process.pid, port: 8731, ownerId: "replacement", heartbeat: new Date().toISOString(), startedAt: new Date().toISOString() });
  await writeFile(path.join(instance.storageRoot, "companion.pid"), replacement);
  expect(await instance.closed).toEqual([1, null]);
  expect(await readFile(path.join(instance.storageRoot, "companion.pid"), "utf8")).toBe(replacement);
}, 10000);
