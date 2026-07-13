import type { PremiereProjectManifest } from "./manifests";

export type SnapshotTrigger = "manual" | "automatic" | "before-restore" | "cloud-pull";
export type CloudStatus = "local-only" | "queued" | "synced" | "failed";
export type ManifestStatus = "verified" | "best-effort" | "unavailable";

export interface Snapshot {
  schemaVersion: 1;
  id: string;
  projectId: string;
  parentSnapshotId?: string;
  streamId: string;
  sequenceNumber: number;
  createdAt: string;
  createdBy: string;
  trigger: SnapshotTrigger;
  label?: string;
  note?: string;

  projectFile: {
    originalFileName: string;
    sourceExtension: ".prproj";
    sha256: string;
    byteSize: number;
  };

  manifest: PremiereProjectManifest;
  manifestStatus: ManifestStatus;
  manifestReason?: string;
  cloudStatus: CloudStatus;
}
