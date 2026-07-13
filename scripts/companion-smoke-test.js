import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const companionPath = path.resolve(__dirname, "../apps/companion-service/dist/companion.cjs");

console.log("Starting companion smoke test...");
console.log("Companion path:", companionPath);

const proc = spawn("node", [companionPath], {
  stdio: "inherit",
  env: { ...process.env, EDITVCS_STORAGE_ROOT: path.join(__dirname, "../temp-smoke-storage") }
});

proc.on("error", (err) => {
  console.error("Failed to start companion process:", err);
  process.exit(1);
});

// Wait for the companion to start and poll /health
setTimeout(async () => {
  let success = false;
  let attempts = 0;
  while (attempts < 5) {
    try {
      console.log(`Polling /health, attempt ${attempts + 1}...`);
      const res = await fetch("http://127.0.0.1:8731/health");
      if (res.ok) {
        const body = await res.json();
        console.log("Health check response:", body);
        if (body.status === "ok" || body.ok === true) {
          success = true;
          break;
        }
      }
    } catch (e) {
      console.log("Connection failed, retrying...");
    }
    attempts++;
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Kill the process
  proc.kill("SIGTERM");
  // Give it a moment to terminate
  await new Promise((r) => setTimeout(r, 500));

  if (success) {
    console.log("Smoke test PASSED!");
    process.exit(0);
  } else {
    console.error("Smoke test FAILED: Could not reach healthy companion");
    process.exit(1);
  }
}, 2000);
