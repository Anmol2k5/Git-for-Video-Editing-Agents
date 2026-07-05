import type { HostAdapter, HostCapabilities, ProjectIdentity, ProjectManifest, SnapshotContext } from "@editvcs/shared-types";

export function createMockAfterEffectsAdapter(options: { enabled: boolean }): HostAdapter {
  return {
    host: "after-effects",
    async getCapabilities() {
      return { projectPath: options.enabled };
    },
    async getCurrentProject() {
      if (!options.enabled) return null;
      return {
        host: "after-effects",
        projectId: "proj_ae_mock",
        name: "Comp.aep",
        pathHint: "D:/work/Comp.aep",
        extension: ".aep"
      };
    },
    async collectManifest(): Promise<ProjectManifest> {
      return {
        projectName: "Comp",
        projectPathHint: "D:/work/Comp.aep",
        capturedAt: new Date().toISOString(),
        compositions: []
      };
    },
    async createSnapshotContext(): Promise<SnapshotContext> {
      const project = (await this.getCurrentProject())!;
      const manifest = await this.collectManifest();
      return { project, manifest };
    },
    async revealProjectLocation() {}
  };
}
