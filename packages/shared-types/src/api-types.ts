import type { ProjectId, SnapshotId } from "./brand";
import type { PremiereProjectManifest } from "./manifests";
import type { Snapshot, SnapshotTrigger, ManifestStatus } from "./snapshots";
import type { ErrorResponse } from "./error-codes";

export interface RegisterProjectRequest {
  projectPath: string;
}

export interface RegisterProjectResponse {
  projectId: ProjectId;
}

export interface CreateSnapshotRequest {
  projectId: ProjectId;
  label: string;
  trigger?: SnapshotTrigger;
  manifest?: PremiereProjectManifest | null;
  manifestStatus?: ManifestStatus;
  manifestReason?: string;
}

export interface CreateSnapshotResponse {
  created: boolean;
  reason?: string;
  snapshot?: Snapshot;
}

export interface RestoreCopyRequest {
  projectId: ProjectId;
  snapshotId: SnapshotId;
  destinationDirectory: string;
}

export interface RestoreCopyResponse {
  restoredPath: string;
}

export interface PairStartResponse {
  pairingId: string;
  expiresAt: number;
}

export interface PairCompleteRequest {
  pairingId: string;
  code: string;
}

export interface PairCompleteResponse {
  sessionToken: string;
  expiresAt: number;
}

export interface RefreshSessionRequest {
  sessionToken: string;
}

export interface ChangesQueryRequest {
  from: SnapshotId;
  to: SnapshotId;
}

export type ChangesConfidence = "verified" | "best-effort" | "metadata-unavailable";

export interface ChangesResponse {
  fromSnapshotId: SnapshotId;
  toSnapshotId: SnapshotId;
  confidence: ChangesConfidence;
  summary: string[];
  groups: Array<{
    title: string;
    items: string[];
    clipChanges?: Array<{
      type: "added" | "removed" | "moved" | "trimmed" | "track-changed";
      clipName: string;
      trackType: "video" | "audio";
      trackIndex: number;
      oldTrackIndex?: number;
      detail: string;
      oldTimecode?: string;
      newTimecode?: string;
    }>;
  }>;
  unsupported: string[];
}

export type ApiResponse<T> = T | ErrorResponse;
