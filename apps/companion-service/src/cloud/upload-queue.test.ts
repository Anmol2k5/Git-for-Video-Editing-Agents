import { describe, expect, it } from "vitest";
import { createUploadQueue } from "./upload-queue";
import type { Snapshot } from "@editvcs/shared-types";

describe("cloud upload queue", () => {
  it("queues snapshots while offline and retries when online", async () => {
    const uploaded: string[] = [];
    const queue = createUploadQueue({
      provider: {
        async uploadSnapshot(snapshot: Snapshot) {
          uploaded.push(snapshot.id);
        },
        async listSnapshots() {
          return [];
        },
        async downloadSnapshot() {
          return Buffer.from("project");
        }
      },
      isOnline: () => false
    });

    await queue.enqueue({ id: "snap_1", cloudStatus: "queued" } as any);
    expect(uploaded).toEqual([]);

    queue.setOnlineCheck(() => true);
    await queue.flush();
    expect(uploaded).toEqual(["snap_1"]);
  });
});
