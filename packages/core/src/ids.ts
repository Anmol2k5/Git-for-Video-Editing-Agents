import { createHash } from "node:crypto";
import type { HostName } from "@editvcs/shared-types";

export function createProjectId(host: HostName, pathHint: string): string {
  const digest = createHash("sha256").update(`${host}:${pathHint}`).digest("hex").slice(0, 16);
  return `proj_${digest}`;
}

export function createSnapshotId(projectId: string, createdAt: string, sha256: string): string {
  const compactDate = createdAt.replace(/[-:]/g, "").replace(".000Z", "").replace("Z", "");
  return `snap_${compactDate}_${sha256.slice(0, 12)}`;
}
