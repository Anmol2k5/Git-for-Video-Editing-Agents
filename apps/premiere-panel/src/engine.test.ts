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
