import { EventEmitter } from "node:events";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { CompanionClient } from "./engine";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("aborts an unresponsive health request", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", (_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  }));
  const request = new CompanionClient().isReachable();
  let settled = false; void request.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(10001);
  expect(settled).toBe(true); expect(await request).toBe(false);
});
it("uses external Node and handles asynchronous spawn errors", async () => {
  vi.useFakeTimers();
  let command = ""; let bundle = "";
  const spawn = (exe: string, args: string[]) => {
    command = exe; bundle = args[0];
    const child = Object.assign(new EventEmitter(), { unref() {} });
    queueMicrotask(() => child.emit("error", new Error("ENOENT")));
    return child;
  };
  vi.stubGlobal("window", { __adobe_cep__: {}, CSInterface: class { getSystemPath() { return "/repo/apps/premiere-panel"; } }, require(name: string) {
    if (name === "crypto") return { randomBytes: () => ({ toString: () => "token" }) };
    if (name === "child_process") return { spawn };
    if (name === "path") return path;
    if (name === "fs") return { existsSync: (file: string) => file === "/repo/apps/companion-service/dist/companion.cjs" };
    if (name === "process") return { env: {} };
    throw Error(name);
  } });
  vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
  const result = new CompanionClient().ensureRunning();
  await vi.advanceTimersByTimeAsync(11000);
  expect(await result).toBe(false);
  expect(command).toBe("node"); expect(bundle).toBe("/repo/apps/companion-service/dist/companion.cjs");
});

it('does not authenticate an existing token using health alone', async () => {
  vi.stubGlobal('fetch', async (input: string) => input.endsWith('/health')
    ? new Response(JSON.stringify({ status: 'ok' }))
    : new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
  const client = new CompanionClient(); client.sessionToken = 'stale';
  expect(await client.ensureRunning()).toBe(false);
  expect(client.sessionToken).toBeNull();
});
it('does not let an old unauthorized response revoke a newer session', async () => {
  let respond!: (response: Response) => void;
  vi.stubGlobal('fetch', () => new Promise<Response>(resolve => { respond = resolve; }));
  const client = new CompanionClient(); client.sessionToken = 'old';
  const history = client.listSnapshots('A'); client.sessionToken = 'new';
  respond(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
  await history;
  expect(client.sessionToken).toBe('new');
});
it('shares an in-flight supervisor result between concurrent callers', async () => {
  let respond!: (response: Response) => void;
  vi.stubGlobal('fetch', (input: string) => input.endsWith('/health')
    ? new Promise<Response>(resolve => { respond = resolve; })
    : Promise.resolve(new Response(JSON.stringify([]))));
  const client = new CompanionClient(); client.sessionToken = 'valid';
  const first = client.ensureRunning(); const second = client.ensureRunning();
  respond(new Response(JSON.stringify({ status: 'ok' })));
  expect(await first).toBe(true); expect(await second).toBe(true);
});
it('ignores a startup superseded by a newer session while health was pending', async () => {
  let respond!: (response: Response) => void;
  vi.stubGlobal('fetch', () => new Promise<Response>(resolve => { respond = resolve; }));
  const client = new CompanionClient(); client.sessionToken = 'old';
  const startup = client.ensureRunning(); client.sessionToken = 'new';
  respond(new Response(JSON.stringify({ status: 'ok' })));
  expect(await startup).toBe(false); expect(client.sessionToken).toBe('new');
});

it('does not reuse a cancelled supervisor attempt for a new session', async () => {
  let respond!: (response: Response) => void;
  let initial = true;
  vi.stubGlobal('fetch', (input: string) => {
    if (initial) { initial = false; return new Promise<Response>(resolve => { respond = resolve; }); }
    return Promise.resolve(new Response(JSON.stringify(input.endsWith('/health') ? { status: 'ok' } : [])));
  });
  const client = new CompanionClient(); client.sessionToken = 'old';
  const obsolete = client.ensureRunning(); client.sessionToken = 'new';
  const current = client.ensureRunning();
  respond(new Response(JSON.stringify({ status: 'ok' })));
  expect(await obsolete).toBe(false);
  expect(await current).toBe(true);
});

it('does not let an old request clear the bootstrap session installed by a restart', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', {
    __adobe_cep__: {}, CSInterface: class { getSystemPath() { return '/extension'; } },
    require(name: string) {
      if (name === 'crypto') return { randomBytes: () => ({ toString: () => 'bootstrap' }) };
      if (name === 'child_process') return { spawn: () => ({ once() { return this; }, unref() {} }) };
      if (name === 'path') return path;
      if (name === 'fs') return { existsSync: () => true };
      if (name === 'process') return { env: {} };
      throw Error(name);
    }
  });
  let respond!: (response: Response) => void;
  let healthChecks = 0;
  vi.stubGlobal('fetch', (input: string) => {
    if (input.includes('projectId=A')) return new Promise<Response>(resolve => { respond = resolve; });
    if (input.endsWith('/health')) {
      healthChecks++;
      return Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: healthChecks === 1 ? 503 : 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify([])));
  });
  const client = new CompanionClient(); client.sessionToken = 'old';
  const history = client.listSnapshots('A'); const restart = client.ensureRunning();
  await vi.advanceTimersByTimeAsync(1000);
  expect(await restart).toBe(true); expect(client.sessionToken).toBe('bootstrap');
  respond(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
  await history;
  expect(client.sessionToken).toBe('bootstrap');
});
