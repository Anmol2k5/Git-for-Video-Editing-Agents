import type { RemoteStorageProvider, Snapshot } from "@editvcs/shared-types";

export class MockCloudProvider implements RemoteStorageProvider {
  private storage = new Map<string, Snapshot>();

  async uploadSnapshot(snapshot: Snapshot): Promise<void> {
    this.storage.set(snapshot.id, snapshot);
  }

  async listSnapshots(projectId: string): Promise<Snapshot[]> {
    return Array.from(this.storage.values()).filter(s => s.projectId === projectId);
  }

  async downloadSnapshot(): Promise<Buffer> {
    return Buffer.from("mock-project");
  }
}
