import type { HostAdapter, HostCapabilities, ProjectIdentity, ProjectManifest, SnapshotContext } from "@editvcs/shared-types";

export function createMockAfterEffectsAdapter(options: { enabled: boolean }): HostAdapter {
  const getCapabilities = async (): Promise<HostCapabilities> => {
    return {
      projectPath: options.enabled,
      activeSequenceRead: false,
      sequenceInventoryRead: false,
      trackClipRead: false,
      mediaReferenceRead: false,
      saveEventHooks: false,
      compositionInventoryRead: options.enabled,
      layerRead: options.enabled,
      effectRead: false,
      expressionRead: false
    };
  };

  const getCurrentProject = async (): Promise<ProjectIdentity | null> => {
    if (!options.enabled) return null;
    return {
      host: "after-effects",
      projectId: "proj_ae_mock",
      name: "Comp.aep",
      pathHint: "D:/work/Comp.aep",
      extension: ".aep"
    };
  };

  const collectManifest = async (): Promise<ProjectManifest> => {
    return {
      host: "after-effects",
      projectName: "Comp",
      projectPathHint: "D:/work/Comp.aep",
      capturedAt: new Date().toISOString(),
      compositions: []
    };
  };

  const createSnapshotContext = async (): Promise<SnapshotContext> => {
    const project = (await getCurrentProject())!;
    const manifest = await collectManifest();
    return { project, manifest };
  };

  const revealProjectLocation = async (): Promise<void> => {};

  return {
    host: "after-effects",
    getCapabilities,
    getCurrentProject,
    collectManifest,
    createSnapshotContext,
    revealProjectLocation
  };
}
