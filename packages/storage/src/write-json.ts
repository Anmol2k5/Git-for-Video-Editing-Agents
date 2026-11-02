import { open, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp-${randomUUID()}`;
  const file = await open(tempPath, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(data, null, 2), "utf8");
    await file.sync();
    await file.close();
    await rename(tempPath, filePath);
  } finally {
    await file.close().catch(() => {});
    await unlink(tempPath).catch(() => {});
  }
}
