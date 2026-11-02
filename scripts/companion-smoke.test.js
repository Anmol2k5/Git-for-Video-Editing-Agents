import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCompanionSmoke } from "./companion-smoke.js";
import { fileURLToPath } from "node:url";

async function fixture(source, handler) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-smoke-regression-"));
  const bundle = path.join(dir, "companion.cjs"); await writeFile(bundle, source);
  const server = createServer(handler);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return { bundle, port: server.address().port, async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); } };
}

test("smoke cannot pass against an unrelated healthy server after its child exits", async () => {
  const f = await fixture("process.exit(0)", (_req, res) => { res.setHeader("content-type", "application/json"); res.end('{"status":"ok"}'); });
  try {
    await assert.rejects(runCompanionSmoke({ companionPath: f.bundle, port: f.port, startupTimeoutMs: 1000, requestTimeoutMs: 200 }), /exited|startup|owned/i);
    assert.equal((await fetch(`http://127.0.0.1:${f.port}/health`)).status, 200);
  } finally { await f.close(); }
});

test("smoke bounds readiness when an unrelated listener never responds", async () => {
  const f = await fixture("setInterval(()=>{},1000)", () => {});
  const started = Date.now();
  try {
    await assert.rejects(runCompanionSmoke({ companionPath: f.bundle, port: f.port, startupTimeoutMs: 300, requestTimeoutMs: 100 }), /startup|ready|deadline/i);
    assert.ok(Date.now() - started < 3000, "readiness and child cleanup must be bounded");
  } finally { await f.close(); }
});

test("smoke rejects a healthy service that does not accept its bootstrap session", async () => {
  const f = await fixture("setInterval(()=>{},1000)", (req, res) => {
    res.setHeader("content-type", "application/json");
    res.statusCode = req.url === "/health" ? 200 : 401;
    res.end(req.url === "/health" ? '{"status":"ok"}' : '{"error":"unauthorized"}');
  });
  try {
    await assert.rejects(runCompanionSmoke({ companionPath: f.bundle, port: f.port, startupTimeoutMs: 400, requestTimeoutMs: 100 }), /startup|owned|authentication/i);
  } finally { await f.close(); }
});

test("built companion preserves snapshot bytes and history across process restart", { timeout: 30000 }, async () => {
  assert.deepEqual(await runCompanionSmoke(), { snapshots: 2, restoreVerified: true, restartVerified: true });
});

for (const [name, handler] of [["crashes", "process.exit(17)"], ["ignores shutdown", ""]]) {
  test(`smoke rejects a companion that ${name} during graceful shutdown`, { timeout: 20000 }, async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-shutdown-regression-"));
    const wrapper = path.join(dir, "companion.cjs");
    const actual = fileURLToPath(new URL("../apps/companion-service/dist/companion.cjs", import.meta.url));
    await writeFile(wrapper, `require(${JSON.stringify(actual)});\nprocess.removeAllListeners("SIGTERM");\nprocess.on("SIGTERM",()=>{${handler}});\nprocess.removeAllListeners("message");\nprocess.on("message",()=>{${handler}});`);
    try {
      await assert.rejects(runCompanionSmoke({ companionPath: wrapper, shutdownTimeoutMs: 250 }), /graceful|shutdown/i);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}
