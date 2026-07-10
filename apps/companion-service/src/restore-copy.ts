import fs from "node:fs/promises";
import path from "node:path";
import { createRestoreFileName } from "@editvcs/core";

export async function createRestoreCopy(opts: {
  originalProjectPath: string;
  objectPath: string;
  destinationDirectory: string;
  label: string;
  createdAt: string;
}): Promise<string> {
  const newName = createRestoreFileName(opts.originalProjectPath, opts.label, opts.createdAt);
  const destPath = path.join(opts.destinationDirectory, newName);

  await fs.copyFile(opts.objectPath, destPath);
  return destPath;
}
