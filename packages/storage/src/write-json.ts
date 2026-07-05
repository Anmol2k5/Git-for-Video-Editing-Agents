import { writeFile } from "node:fs/promises";

export async function writeJsonAtomic(filePath: string, data: any): Promise<void> {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  const { rename } = await import("node:fs/promises");
  await rename(tempPath, filePath);
}
