import type { ProjectId, SnapshotId, StreamId } from "./brand";

export interface VersionStream {
  id: StreamId;
  projectId: ProjectId;
  name: string;
  createdAt: string;
  baseSnapshotId?: SnapshotId;
  currentSnapshotId?: SnapshotId;
}
