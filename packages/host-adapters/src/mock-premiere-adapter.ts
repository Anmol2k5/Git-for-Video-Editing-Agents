import type { HostAdapter, HostCapabilities, ProjectIdentity, ProjectManifest, SnapshotContext } from "@editvcs/shared-types";
import { defaultPremiereCapabilities } from "./premiere-capabilities";

export function createMockPremiereAdapter(capabilities: Partial<HostCapabilities> = {}): HostAdapter {
  const getCapabilities = async (): Promise<HostCapabilities> => {
    return { ...defaultPremiereCapabilities, ...capabilities };
  };

  const getCurrentProject = async (): Promise<ProjectIdentity | null> => {
    return {
      host: "premiere",
      projectId: "proj_mock",
      name: "Film.prproj",
      pathHint: "D:/work/Film.prproj",
      extension: ".prproj"
    };
  };

  const collectManifest = async (): Promise<ProjectManifest> => {
    return {
      host: "premiere",
      projectName: "Film",
      projectPathHint: "D:/work/Film.prproj",
      capturedAt: new Date().toISOString(),
      sequences: [{ name: "Main Edit" }]
    };
  };

  const createSnapshotContext = async (): Promise<SnapshotContext> => {
    const project = (await getCurrentProject())!;
    const manifest = await collectManifest();
    return { project, manifest, fullProjectPath: "D:/work/Film.prproj" };
  };

  const revealProjectLocation = async (): Promise<void> => {};

  return {
    host: "premiere",
    getCapabilities,
    getCurrentProject,
    collectManifest,
    createSnapshotContext,
    revealProjectLocation
  };
}
