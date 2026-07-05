import fs from "node:fs/promises";
import path from "node:path";

export async function createRestoreCopy(opts: {
  originalProjectPath: string;
  objectPath: string;
  destinationDirectory: string;
  label: string;
  createdAt: string;
}): Promise<string> {
  const parsed = path.parse(opts.originalProjectPath);
  const safeLabel = opts.label.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "Save_point";
  const date = opts.createdAt.slice(0, 10);
  const newName = `${parsed.name}_restored_${safeLabel}_${date}${parsed.ext}`;
  const destPath = path.join(opts.destinationDirectory, newName);

  await fs.copyFile(opts.objectPath, destPath);
  return destPath;
}
