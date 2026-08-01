import { createServer } from "./server";
import { config } from "./config";
import { sessionManager } from "./sessions";
import { PidManager } from "./pid-manager";

const PORT = Number(process.env.EDITVCS_COMPANION_PORT) || config.port;
const STORAGE_ROOT = config.storageRoot;
const AUTO_PAIR_TOKEN = process.env.EDITVCS_AUTO_PAIR_TOKEN;

const pidManager = new PidManager(STORAGE_ROOT, PORT);

// ── Graceful shutdown ──────────────────────────────────────────────────────
let isShuttingDown = false;
let httpServer: import("node:http").Server | null = null;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\nEditVCS companion shutting down (${signal})...`);

  // 1. Stop heartbeat immediately
  pidManager.stopHeartbeat();

  // 2. Close HTTP server (stop accepting new connections)
  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer!.close(() => resolve());
      // Force-close after 3 seconds if connections are hanging
      setTimeout(() => resolve(), 3_000);
    });
  }

  // 3. Release PID file
  await pidManager.release();

  console.log("EditVCS companion stopped.");
  process.exit(0);
}

// ── Crash handlers ─────────────────────────────────────────────────────────
// These ensure the process exits with a non-zero code on unhandled errors,
// so the supervisor (CEP panel) knows to restart it.

process.on("uncaughtException", async (err) => {
  console.error("EditVCS companion FATAL uncaught exception:", err);
  try {
    pidManager.stopHeartbeat();
    await pidManager.release();
  } catch { /* best-effort cleanup */ }
  process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
  console.error("EditVCS companion FATAL unhandled rejection:", reason);
  try {
    pidManager.stopHeartbeat();
    await pidManager.release();
  } catch { /* best-effort cleanup */ }
  process.exit(1);
});

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Windows: handle Ctrl+C in console
if (process.platform === "win32") {
  process.on("SIGHUP", () => shutdown("SIGHUP"));
}

// ── Startup ────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  console.log(`Starting EditVCS companion service with storage root: ${STORAGE_ROOT}`);

  // Check for stale PID from a crashed previous instance
  const status = await PidManager.isRunning(STORAGE_ROOT);
  if (status.running) {
    console.log(`Another companion appears to be running (PID ${status.pid}, port ${status.port}).`);
    console.log("If this is incorrect, delete the PID file and retry.");
    process.exit(0);
  }
  if (status.stale) {
    console.log(`Clearing stale PID file from crashed companion (PID ${status.pid}).`);
    await PidManager.clearStale(STORAGE_ROOT);
  }

  // Register auto-pair token if provided (for zero-config CEP auto-start)
  if (AUTO_PAIR_TOKEN) {
    console.log("Auto-pairing token provided. Registering session...");
    sessionManager.createSessionWithToken(AUTO_PAIR_TOKEN);
  }

  try {
    httpServer = await createServer({ port: PORT, storageRoot: STORAGE_ROOT });

    httpServer.on("error", async (err) => {
      console.error("EditVCS companion server error:", err);
      try {
        pidManager.stopHeartbeat();
        await pidManager.release();
      } catch { /* best-effort */ }
      process.exit(1);
    });

    // Acquire PID file and start heartbeat
    await pidManager.acquire(AUTO_PAIR_TOKEN);
    pidManager.startHeartbeat();

    console.log(`EditVCS companion listening on http://127.0.0.1:${PORT}`);
  } catch (err) {
    console.error("Failed to initialize server:", err);
    process.exit(1);
  }
}

start();

