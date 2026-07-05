import type { PremiereProjectManifest } from "./manifests";

export type SnapshotTrigger = "manual" | "automatic" | "before-restore" | "cloud-pull";
export type CloudStatus = "local-only" | "queued" | "synced" | "failed";

export interface Snapshot {
  id: string;
  projectId: string;
  parentSnapshotId?: string;
  streamId: string;
  createdAt: string;
  createdBy: "local-user" | string;
  trigger: SnapshotTrigger;
  label?: string;
  note?: string;
  projectFile: {
    originalFileName: string;
    sourceExtension: ".prproj";
    sha256: string;
    byteSize: number;
    objectPath: string;
  };
  manifest: PremiereProjectManifest;
  cloudStatus: CloudStatus;
}
