import type { Snapshot } from "./snapshots";

export interface RemoteStorageProvider {
  uploadSnapshot(snapshot: Snapshot): Promise<void>;
  listSnapshots(projectId: string): Promise<Snapshot[]>;
  downloadSnapshot(snapshotId: string): Promise<Buffer>;
}
