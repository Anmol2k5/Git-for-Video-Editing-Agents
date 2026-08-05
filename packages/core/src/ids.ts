import { createHash } from "node:crypto";
import type { HostName, ProjectId, SnapshotId } from "@editvcs/shared-types";

export function createProjectId(host: HostName, pathHint: string): ProjectId {
  const digest = createHash("sha256").update(`${host}:${pathHint}`).digest("hex").slice(0, 16);
  return `proj_${digest}` as ProjectId;
}

export function createSnapshotId(projectId: string, createdAt: string, sha256: string): SnapshotId {
  const compactDate = createdAt.replace(/[-:]/g, "").replace(".000Z", "").replace("Z", "");
  return `snap_${compactDate}_${sha256.slice(0, 12)}` as SnapshotId;
}
