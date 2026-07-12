import { constants } from "node:fs";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { hashFileSha256 } from "@editvcs/storage";
import { createRestoreFileName } from "@editvcs/core";

export function sanitizeFileName(name: string): string {
  const parsed = path.parse(name);
  let cleanName = parsed.name.replace(/[\\\/:*?"<>|]/g, "_").trim();
  cleanName = cleanName.replace(/__+/g, "_");
  
  // Windows reserved names check
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
  if (reserved.test(cleanName)) {
    cleanName = "restored_" + cleanName;
  }
  
  if (cleanName.length > 120) {
    cleanName = cleanName.slice(0, 120);
  }
  
  return cleanName + parsed.ext;
}

export async function createRestoreCopy(opts: {
  originalProjectPath: string; // May not exist on disk
  objectPath: string;
  destinationDirectory: string;
  label: string;
  createdAt: string;
  expectedHash: string;
  originalFileName: string;
}): Promise<string> {
  const sourcePath = await fs.realpath(path.resolve(opts.objectPath));

  // 1. Verify stored object hash before copying
  const sourceHash = await hashFileSha256(sourcePath);
  if (sourceHash !== opts.expectedHash) {
    throw new Error("Stored object failed integrity verification.");
  }

  // 2. Canonicalize destination parent directory
  const canonicalDestDir = await fs.realpath(path.resolve(opts.destinationDirectory));

  // 3. Generate and sanitize filename
  const baseName = createRestoreFileName(
    opts.originalFileName, opts.label, opts.createdAt
  );
  const sanitizedName = sanitizeFileName(baseName);
  const parsed = path.parse(sanitizedName);

  // 4. Resolve filename collision increment suffix (Option B) using exclusive creation checks
  let finalName = sanitizedName;
  let finalPath = path.join(canonicalDestDir, finalName);
  let counter = 1;

  while (true) {
    try {
      await fs.access(finalPath);
      // If no error, file exists
      counter++;
      finalName = `${parsed.name}_${counter}${parsed.ext}`;
      finalPath = path.join(canonicalDestDir, finalName);
    } catch {
      // Access threw error, file does not exist, we can try this path
      break;
    }
  }

  // 5. Case-insensitive path comparison check against active project path
  const win32 = process.platform === "win32";
  const activeNormalized = path.normalize(opts.originalProjectPath);
  const finalNormalized = path.normalize(finalPath);
  const pathsEqual = win32
    ? activeNormalized.toLowerCase() === finalNormalized.toLowerCase()
    : activeNormalized === finalNormalized;

  if (pathsEqual) {
    throw new Error("Destination path is the same as the active project path.");
  }

  // Also verify against source object path
  const sourceNormalized = path.normalize(sourcePath);
  const sourcePathsEqual = win32
    ? sourceNormalized.toLowerCase() === finalNormalized.toLowerCase()
    : sourceNormalized === finalNormalized;

  if (sourcePathsEqual) {
    throw new Error("Destination resolves to the stored source object.");
  }

  // 6. Copy to temp file in destination directory
  const tmpPath = path.join(
    canonicalDestDir,
    `.editvcs-restore-${randomUUID()}.tmp`
  );

  try {
    await fs.copyFile(sourcePath, tmpPath);

    // 7. Verify temporary file hash
    const tmpHash = await hashFileSha256(tmpPath);
    if (tmpHash !== sourceHash) {
      throw new Error("Restore integrity check failed.");
    }

    // 8. Publish atomically/exclusively
    // First try link if on same filesystem (where supported)
    try {
      await fs.link(tmpPath, finalPath);
    } catch (linkErr: any) {
      // Fallback to COPYFILE_EXCL copy if link not supported
      await fs.copyFile(tmpPath, finalPath, constants.COPYFILE_EXCL);
    }

    await fs.unlink(tmpPath).catch(() => {});
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }

  // 9. Post-copy identity checks (ensure final output has separate inode/device)
  const [sourceStat, destStat] = await Promise.all([
    fs.stat(sourcePath),
    fs.stat(finalPath),
  ]);
  
  if (sourceStat.dev === destStat.dev && sourceStat.ino === destStat.ino) {
    await fs.unlink(finalPath).catch(() => {});
    throw new Error("Restored file has the same identity as the source.");
  }

  return finalPath;
}
