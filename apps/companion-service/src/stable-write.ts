import fs from "node:fs/promises";

export async function waitForStableFile(filePath: string, opts: { intervalMs: number, stableChecks: number, timeoutMs: number }): Promise<void> {
  const { intervalMs, stableChecks, timeoutMs } = opts;
  const start = Date.now();
  
  let checks = 0;
  let lastSize = -1;
  let lastMtime = -1;

  while (Date.now() - start < timeoutMs) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size === lastSize && stat.mtimeMs === lastMtime) {
        checks++;
        if (checks >= stableChecks) return;
      } else {
        checks = 0;
        lastSize = stat.size;
        lastMtime = stat.mtimeMs;
      }
    } catch {
      checks = 0;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error("Project file is still changing. Try again after Premiere finishes saving.");
}
