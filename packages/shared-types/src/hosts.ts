import type { AfterEffectsProjectManifest, PremiereProjectManifest } from "./manifests";

export type HostName = "premiere" | "after-effects";

export interface HostCapabilities {
  projectPath: boolean;
  activeSequenceRead?: boolean;
  sequenceInventoryRead?: boolean;
  trackClipRead?: boolean;
  mediaReferenceRead?: boolean;
  saveEventHooks?: boolean;
  compositionInventoryRead?: boolean;
  layerRead?: boolean;
  effectRead?: boolean;
  expressionRead?: boolean;
}

export interface PremiereCapabilities extends HostCapabilities {
  projectPath: boolean;
  activeSequenceRead: boolean;
  sequenceInventoryRead: boolean;
  trackClipRead: boolean;
  mediaReferenceRead: boolean;
  saveEventHooks: boolean;
}

export interface ProjectIdentity {
  host: HostName;
  projectId: string;
  name: string;
  path?: string;
  pathHint: string;
  extension: ".prproj" | ".aep" | ".aepx";
}

export interface SnapshotContext {
  project: ProjectIdentity;
  fullProjectPath?: string;
  manifest: ProjectManifest;
}

export interface HostAdapter {
  host: HostName;
  getCapabilities(): Promise<HostCapabilities>;
  getCurrentProject(): Promise<ProjectIdentity | null>;
  collectManifest(): Promise<ProjectManifest>;
  createSnapshotContext(): Promise<SnapshotContext>;
  revealProjectLocation(): Promise<void>;
}

export type ProjectManifest = PremiereProjectManifest | AfterEffectsProjectManifest;
