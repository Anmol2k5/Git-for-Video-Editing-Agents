import type { ProjectManifest } from "./hosts";
import type { ProjectId, SnapshotId, StreamId } from "./brand";

export type SnapshotTrigger = "manual" | "automatic" | "before-restore" | "cloud-pull";
export type CloudStatus = "local-only" | "queued" | "synced" | "failed";
export type ManifestStatus = "verified" | "best-effort" | "unavailable";

export interface Snapshot {
  schemaVersion: 1;
  id: SnapshotId;
  projectId: ProjectId;
  parentSnapshotId?: SnapshotId;
  streamId: StreamId;
  sequenceNumber: number;
  createdAt: string;
  createdBy: string;
  trigger: SnapshotTrigger;
  label?: string;
  note?: string;

  projectFile: {
    originalFileName: string;
    sourceExtension: ".prproj" | ".aep" | ".aepx";
    sha256: string;
    byteSize: number;
  };

  manifest: ProjectManifest;
  manifestStatus: ManifestStatus;
  manifestReason?: string;
  cloudStatus: CloudStatus;
}
