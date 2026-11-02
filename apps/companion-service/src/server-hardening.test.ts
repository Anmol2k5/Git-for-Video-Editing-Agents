import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createServer } from "./server";
import { sessionManager } from "./sessions";
import { ProjectRegistry } from "./project-registry";
import { createSnapshotService } from "./snapshot-service";
import fs from "node:fs/promises";
import * as fileWatchers from "./file-watcher";

let dir: string;
let server: Awaited<ReturnType<typeof createServer>>;
let base: string;
let headers: Record<string, string>;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-http-"));
  server = await createServer({ port: 0, storageRoot: dir });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  headers = { authorization: `Bearer ${sessionManager.createSession().sessionToken}`, "content-type": "application/json" };
});
afterEach(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true }); vi.restoreAllMocks();
});
it("returns 400 for malformed JSON without parser details", async () => {
  const response = await fetch(base + "/snapshots/manual", { method: "POST", headers, body: "{private-data" });
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain("private-data");
});
it("returns 413 for oversized request bodies", async () => {
  const response = await fetch(base + "/snapshots/manual", { method: "POST", headers, body: JSON.stringify({ data: "x".repeat(1600000) }) });
  expect(response.status).toBe(413);
});
it("rejects unsafe project query IDs with a validation error", async () => {
  const response = await fetch(base + "/snapshots?projectId=..%2F..", { headers });
  expect(response.status).toBe(400);
});
it("does not disclose filesystem errors through public health responses", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await rm(dir, { recursive: true, force: true }); await writeFile(dir, "not a directory");
  const response = await fetch(base + "/health");
  expect(response.status).toBe(503); expect(await response.text()).not.toContain(dir);
});

it("returns a safe internal error for failed registry persistence", async () => {
  const project = path.join(dir, "Film.prproj"); await writeFile(project, "v1");
  // The server has loaded its registry; make its persistence destination a directory.
  await fs.mkdir(path.join(dir, "registry.json"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await fetch(base + "/projects/register", { method: "POST", headers, body: JSON.stringify({ projectPath: project }) });
  expect(response.status).toBe(500);
  const body = await response.json() as { error: { code: string; message: string } };
  expect(body.error.code).toBe("INTERNAL_ERROR");
  expect(JSON.stringify(body)).not.toContain(dir);
  expect(JSON.stringify(body)).not.toContain("registry.json");
  expect(log).toHaveBeenCalledTimes(1);
});

it("keeps expected project validation errors actionable without leaking paths", async () => {
  const project = path.join(dir, "notes.txt"); await writeFile(project, "notes");
  const response = await fetch(base + "/projects/register", { method: "POST", headers, body: JSON.stringify({ projectPath: project }) });
  expect(response.status).toBe(400);
  const body = await response.json() as { error: { code: string; message: string } };
  expect(body.error.code).toBe("INVALID_PROJECT_PATH"); expect(body.error.message).toMatch(/Premiere/);
  const missing = await fetch(base + "/projects/register", { method: "POST", headers, body: JSON.stringify({ projectPath: path.join(dir, "missing.prproj") }) });
  expect(missing.status).toBe(400); expect(await missing.text()).not.toContain(dir);
});

it("uses the payload validation response for malformed project registration", async () => {
  const response = await fetch(base + "/projects/register", { method: "POST", headers, body: JSON.stringify({ projectPath: 42 }) });
  expect(response.status).toBe(400);
  expect((await response.json() as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
});

it("logs private health failures once until recovery, including concurrent polls", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await rm(dir, { recursive: true, force: true }); await writeFile(dir, "blocked storage");
  const failures = await Promise.all(Array.from({ length: 5 }, () => fetch(base + "/health")));
  expect(failures.every(response => response.status === 503)).toBe(true);
  expect(log).toHaveBeenCalledTimes(1);
  expect(log.mock.calls.flat().join(" ")).toContain(dir);
  for (const response of failures) expect(await response.text()).not.toContain(dir);
  await rm(dir); await fs.mkdir(dir);
  expect((await fetch(base + "/health")).status).toBe(200);
  await rm(dir, { recursive: true, force: true }); await writeFile(dir, "blocked again");
  expect((await fetch(base + "/health")).status).toBe(503);
  expect(log).toHaveBeenCalledTimes(2);
});

it("does not report storage failure when healthy probes run concurrently", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const responses = await Promise.all(Array.from({ length: 30 }, () => fetch(base + "/health")));
  expect(responses.map(response => response.status)).toEqual(Array(30).fill(200));
});

it("supports CEP file-origin requests without bypassing bearer authentication", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await fetch(base + "/health", { headers: { origin: "null" } });
  expect(response.status).toBe(200); expect(response.headers.get("access-control-allow-origin")).toBe("null");
  const protectedResponse = await fetch(base + "/snapshots", { headers: { origin: "null" } });
  expect(protectedResponse.status).toBe(401);
  const preflight = await fetch(base + "/projects/register", { method: "OPTIONS", headers: { origin: "null", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" } });
  expect(preflight.status).toBe(204); expect(preflight.headers.get("access-control-allow-origin")).toBe("null");
  expect(log).not.toHaveBeenCalled();
});

it("denies unrelated web origins with a safe 403 response", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await fetch(base + "/snapshots", { headers: { ...headers, origin: "https://unrelated.example" } });
  expect(response.status).toBe(403);
  expect(response.headers.has("access-control-allow-origin")).toBe(false);
  expect((await response.json() as { error: { code: string } }).error.code).toBe("INVALID_REQUEST");
});
it("does not turn missing timeline metadata into removed sequences", async () => {
  // Register before server startup so its in-memory registry sees the persisted mapping.
  await new Promise<void>(resolve => server.close(() => resolve()));
  const project = path.join(dir, "Film.prproj"); await writeFile(project, "v1");
  const registry = new ProjectRegistry(dir); await registry.load();
  const projectId = await registry.validateAndRegisterPath(project);
  const service = createSnapshotService({ storageRoot: dir });
  const first = await service.createManualSnapshot({ projectId, projectPath: project, label: "A", manifestStatus: "verified", manifest: { host: "premiere", projectName: "Film", projectPathHint: project, capturedAt: new Date().toISOString(), sequences: [{ id: "main", name: "Main", clips: [] }] } });
  await writeFile(project, "v2");
  const second = await service.createManualSnapshot({ projectId, projectPath: project, label: "B" });
  server = await createServer({ port: 0, storageRoot: dir });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const response = await fetch(`${base}/projects/${projectId}/changes?from=${first.snapshot!.id}&to=${second.snapshot!.id}`, { headers });
  const data = await response.json() as { confidence: string; groups: unknown[]; summary: string[] };
  expect(data.confidence).toBe("metadata-unavailable"); expect(data.groups).toEqual([]);
  expect(data.summary.join(" ")).toMatch(/unavailable/i);
  const same = await fetch(`${base}/projects/${projectId}/changes?from=${second.snapshot!.id}&to=${second.snapshot!.id}`, { headers });
  expect((await same.json() as { confidence: string }).confidence).toBe("metadata-unavailable");
  const verifiedSame = await fetch(`${base}/projects/${projectId}/changes?from=${first.snapshot!.id}&to=${first.snapshot!.id}`, { headers });
  expect((await verifiedSame.json() as { confidence: string }).confidence).toBe("verified");
  await writeFile(project, "v3");
  const third = await service.createManualSnapshot({ projectId, projectPath: project, label: "C", manifest: first.snapshot!.manifest as import("@editvcs/shared-types").PremiereProjectManifest, manifestStatus: "best-effort" });
  const bestEffortSame = await fetch(`${base}/projects/${projectId}/changes?from=${third.snapshot!.id}&to=${third.snapshot!.id}`, { headers });
  expect((await bestEffortSame.json() as { confidence: string }).confidence).toBe("best-effort");
});
it("rejects an occupied port instead of hanging during startup", async () => {
  const port = (server.address() as { port: number }).port;
  await expect(createServer({ port, storageRoot: dir })).rejects.toMatchObject({ code: "EADDRINUSE" });
});

it("closes owned project watchers before the server close callback completes", async () => {
  const project = path.join(dir, "Film.prproj"); await writeFile(project, "v1");
  const registration = await fetch(base + "/projects/register", { method: "POST", headers, body: JSON.stringify({ projectPath: project }) });
  const { projectId } = await registration.json() as { projectId: string };
  const start = await fetch(`${base}/projects/${projectId}/watch/start`, { method: "POST", headers });
  expect(start.status).toBe(200);
  await new Promise<void>(resolve => server.close(() => resolve()));
  await writeFile(project, "v2");
  await new Promise(resolve => setTimeout(resolve, 3200));
  expect(await readdir(path.join(dir, "projects")).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error))).toEqual([]);
});

it("owns only one watcher for concurrent start requests and closes it", async () => {
  const project = path.join(dir, "Film.prproj"); await writeFile(project, "v1");
  const registration = await fetch(base + "/projects/register", { method: "POST", headers, body: JSON.stringify({ projectPath: project }) });
  const { projectId } = await registration.json() as { projectId: string };
  const access = fs.access.bind(fs);
  let unblock!: () => void;
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  let entries = 0;
  vi.spyOn(fs, "access").mockImplementation(async (...args) => { if (args[0] === project) { entries++; await gate; } return access(...args); });
  const watch = fileWatchers.watchProjectFileForSnapshots;
  const created: Awaited<ReturnType<typeof watch>>[] = [];
  vi.spyOn(fileWatchers, "watchProjectFileForSnapshots").mockImplementation(async options => { const watcher = await watch(options); created.push(watcher); return watcher; });
  try {
    const requests = Array.from({ length: 2 }, () => fetch(`${base}/projects/${projectId}/watch/start`, { method: "POST", headers }));
    await vi.waitFor(() => expect(entries).toBeGreaterThan(0));
    // Give both HTTP handlers time to reach their asynchronous access check.
    await new Promise(resolve => setTimeout(resolve, 100)); unblock();
    expect((await Promise.all(requests)).map(response => response.status)).toEqual([200, 200]);
    expect(created).toHaveLength(1);
  } finally { unblock(); await Promise.all(created.map(watcher => watcher.close())); }
});

it("restarts watching after an overlapping stop completes", async () => {
  const project = path.join(dir, "Film.prproj"); await writeFile(project, "v1");
  const registration = await fetch(base + "/projects/register", { method: "POST", headers, body: JSON.stringify({ projectPath: project }) });
  const { projectId } = await registration.json() as { projectId: string };
  const watch = fileWatchers.watchProjectFileForSnapshots;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let stopping = false;
  let first = true;
  vi.spyOn(fileWatchers, "watchProjectFileForSnapshots").mockImplementation(async options => {
    const watcher = await watch(options);
    if (!first) return watcher;
    first = false;
    return { async close() { stopping = true; await barrier; await watcher.close(); } };
  });
  try {
    await fetch(`${base}/projects/${projectId}/watch/start`, { method: "POST", headers });
    const stop = fetch(`${base}/projects/${projectId}/watch/stop`, { method: "POST", headers });
    await vi.waitFor(() => expect(stopping).toBe(true));
    const restart = fetch(`${base}/projects/${projectId}/watch/start`, { method: "POST", headers });
    await new Promise(resolve => setTimeout(resolve, 100)); release();
    expect((await stop).status).toBe(200); expect((await restart).status).toBe(200);
    const status = await fetch(`${base}/projects/${projectId}/watch/status`, { headers });
    expect(await status.json()).toEqual({ status: "watching" });
  } finally { release(); }
});
