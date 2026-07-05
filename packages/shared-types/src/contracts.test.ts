import { describe, expect, it } from "vitest";
import type { PremiereCapabilities, RemoteStorageProvider, Snapshot } from "./index";

describe("shared contracts", () => {
  it("represents Premiere capability detection explicitly", () => {
    const capabilities: PremiereCapabilities = {
      projectPath: true,
      activeSequenceRead: true,
      sequenceInventoryRead: true,
      trackClipRead: false,
      mediaReferenceRead: false,
      saveEventHooks: false
    };

    expect(capabilities.trackClipRead).toBe(false);
  });

  it("keeps cloud backup behind a provider interface", async () => {
    const uploaded: string[] = [];
    const provider: RemoteStorageProvider = {
      async uploadSnapshot(snapshot: Snapshot) {
        uploaded.push(snapshot.id);
      },
      async listSnapshots() {
        return [];
      },
      async downloadSnapshot() {
        return Buffer.from("project");
      }
    };

    await provider.uploadSnapshot({ id: "snap_1" } as Snapshot);
    expect(uploaded).toEqual(["snap_1"]);
  });
});
