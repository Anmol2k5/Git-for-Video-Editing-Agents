export interface VersionStream {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  baseSnapshotId?: string;
  currentSnapshotId?: string;
}
