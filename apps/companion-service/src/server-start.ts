import { createServer } from "./server";
import { config } from "./config";
import { sessionManager } from "./sessions";
import { PidManager } from "./pid-manager";

const PORT = Number(process.env.EDITVCS_COMPANION_PORT) || config.port;
const STORAGE_ROOT = config.storageRoot;
const AUTO_PAIR_TOKEN = process.env.EDITVCS_AUTO_PAIR_TOKEN;
const pidManager = new PidManager(STORAGE_ROOT, PORT, error => {
  console.error("EditVCS companion storage ownership lost:", error);
  void shutdown("storage ownership lost", 1);
});

let isShuttingDown = false;
let httpServer: import("node:http").Server | null = null;
let startupTask: Promise<void>;
let shutdownTask: Promise<void> | null = null;
let shutdownExitCode = 0;

function shutdown(signal: string, exitCode = 0): Promise<void> {
  shutdownExitCode = Math.max(shutdownExitCode, exitCode);
  if (shutdownTask) return shutdownTask;
  isShuttingDown = true;
  shutdownTask = (async () => {
    console.log(`\nEditVCS companion shutting down (${signal})...`);
    pidManager.stopHeartbeat();
    try {
      // A signal can arrive while ownership or HTTP binding is in flight.
      // Finish startup before closing its resources and releasing its claim.
      await startupTask.catch(() => undefined);
      if (httpServer) {
        await new Promise<void>((resolve, reject) => {
          httpServer!.close(error => error ? reject(error) : resolve());
        });
      }
      // server.close completes after its active watchers have drained. Keep
      // storage exclusively owned until that callback really succeeds.
      await pidManager.release();
      console.log("EditVCS companion stopped.");
    } catch (error) {
      shutdownExitCode = 1;
      console.error("EditVCS companion shutdown failed:", error);
      // Leave ownership in place on a failed drain. Process death establishes
      // a safe takeover; another writer must never start while this one lives.
    }
    process.exit(shutdownExitCode);
  })();
  return shutdownTask;
}

process.on("uncaughtException", error => {
  console.error("EditVCS companion FATAL uncaught exception:", error);
  void shutdown("uncaught exception", 1);
});
process.on("unhandledRejection", reason => {
  console.error("EditVCS companion FATAL unhandled rejection:", reason);
  void shutdown("unhandled rejection", 1);
});
process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
process.on("SIGINT", () => { void shutdown("SIGINT"); });

// Owned parents can request graceful shutdown over private Node IPC on every
// platform. This does not expose a shutdown endpoint to web content.
process.on("message", (message: unknown) => {
  if (message && typeof message === "object" && "type" in message && message.type === "editvcs:shutdown") {
    void shutdown("parent IPC request");
  }
});
if (process.platform === "win32") {
  process.on("SIGHUP", () => { void shutdown("SIGHUP"); });
}

async function start(): Promise<void> {
  console.log(`Starting EditVCS companion service with storage root: ${STORAGE_ROOT}`);
  // acquire performs stale-owner recovery and exclusion together. No HTTP
  // listener, watcher, or request may write storage before this claim succeeds.
  await pidManager.acquire(AUTO_PAIR_TOKEN);
  if (isShuttingDown) return;
  pidManager.startHeartbeat();

  if (AUTO_PAIR_TOKEN) {
    console.log("Auto-pairing token provided. Registering session...");
    sessionManager.createSessionWithToken(AUTO_PAIR_TOKEN);
  }
  httpServer = await createServer({ port: PORT, storageRoot: STORAGE_ROOT });
  httpServer.on("error", error => {
    console.error("EditVCS companion server error:", error);
    void shutdown("server error", 1);
  });
  if (!isShuttingDown) console.log(`EditVCS companion listening on http://127.0.0.1:${PORT}`);
}

startupTask = start();
void startupTask.catch(error => {
  console.error("Failed to initialize server:", error);
  void shutdown("startup failure", 1);
});
