import type { Snapshot } from "./snapshots";
import type { ProjectId, SnapshotId } from "./brand";

export interface RemoteStorageProvider {
  uploadSnapshot(snapshot: Snapshot): Promise<void>;
  listSnapshots(projectId: ProjectId): Promise<Snapshot[]>;
  downloadSnapshot(snapshotId: SnapshotId): Promise<Buffer>;
}
