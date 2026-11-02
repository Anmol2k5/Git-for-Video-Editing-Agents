import { runCompanionSmoke } from "./companion-smoke.js";

console.log("Starting isolated companion functional smoke test...");
try {
  const result = await runCompanionSmoke();
  console.log(`Smoke test PASSED: ${result.snapshots} snapshots, deduplication, restore integrity, graceful/crash restart and session invalidation.`);
} catch (error) {
  console.error("Smoke test FAILED:", error instanceof Error ? error.message : "Unexpected validation failure");
  process.exitCode = 1;
}
