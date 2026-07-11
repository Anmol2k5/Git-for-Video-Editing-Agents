import { constants } from "node:fs";
import { copyFile, link, stat, unlink, realpath } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { hashFileSha256 } from "@editvcs/storage";
import { createRestoreFileName } from "@editvcs/core";

export async function createRestoreCopy(opts: {
  originalProjectPath: string;
  objectPath: string;
  destinationDirectory: string;
  label: string;
  createdAt: string;
  expectedHash: string;
}): Promise<string> {
  const sourcePath = await realpath(path.resolve(opts.objectPath));

  const sourceHash = await hashFileSha256(sourcePath);
  if (sourceHash !== opts.expectedHash) {
    throw new Error("Stored object failed integrity verification.");
  }

  const canonicalDestDir = await realpath(path.resolve(opts.destinationDirectory));

  const generatedName = createRestoreFileName(
    opts.originalProjectPath, opts.label, opts.createdAt
  );
  const destPath = path.join(canonicalDestDir, generatedName);

  const pathsEqual = process.platform === "win32"
    ? sourcePath.toLowerCase() === destPath.toLowerCase()
    : sourcePath === destPath;
  
  if (pathsEqual) {
    throw new Error("Destination resolves to the source file.");
  }

  const tmpPath = path.join(
    canonicalDestDir,
    `.editvcs-restore-${randomUUID()}.tmp`
  );

  try {
    await copyFile(sourcePath, tmpPath, constants.COPYFILE_EXCL);

    const tmpHash = await hashFileSha256(tmpPath);
    if (tmpHash !== sourceHash) {
      throw new Error("Restore integrity check failed.");
    }

    try {
      await link(tmpPath, destPath);
    } catch (linkErr: any) {
      if (!["EPERM", "ENOTSUP", "EXDEV"].includes(linkErr.code)) {
        throw linkErr;
      }
      await copyFile(tmpPath, destPath, constants.COPYFILE_EXCL);
    }

    await unlink(tmpPath);
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    throw err;
  }

  const [sourceStat, destStat] = await Promise.all([
    stat(sourcePath),
    stat(destPath),
  ]);
  
  if (sourceStat.dev === destStat.dev && sourceStat.ino === destStat.ino) {
    await unlink(destPath).catch(() => {});
    throw new Error("Restored file has the same identity as the source.");
  }

  return destPath;
}
