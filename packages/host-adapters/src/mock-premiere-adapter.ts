import type { HostAdapter, HostCapabilities, ProjectIdentity, ProjectManifest, SnapshotContext } from "@editvcs/shared-types";

export function createMockPremiereAdapter(capabilities: Partial<HostCapabilities>): HostAdapter {
  return {
    host: "premiere",
    async getCapabilities() {
      return { projectPath: true, ...capabilities };
    },
    async getCurrentProject() {
      return {
        host: "premiere",
        projectId: "proj_mock",
        name: "Film.prproj",
        pathHint: "D:/work/Film.prproj",
        extension: ".prproj"
      };
    },
    async collectManifest(): Promise<ProjectManifest> {
      return {
        projectName: "Film",
        projectPathHint: "D:/work/Film.prproj",
        capturedAt: new Date().toISOString(),
        sequences: [{ name: "Main Edit" }]
      };
    },
    async createSnapshotContext(): Promise<SnapshotContext> {
      const project = (await this.getCurrentProject())!;
      const manifest = await this.collectManifest();
      return { project, manifest, fullProjectPath: "D:/work/Film.prproj" };
    },
    async revealProjectLocation() {}
  };
}
