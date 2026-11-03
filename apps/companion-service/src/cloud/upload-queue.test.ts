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


describe("concurrent cloud queue integrity", () => {
  it("uploads every queued snapshot once when flushes overlap an enqueue", async () => {
    let online = false;
    let releaseUploads!: () => void;
    const uploadsReady = new Promise<void>(resolve => { releaseUploads = resolve; });
    const uploaded: string[] = [];
    const queue = createUploadQueue({
      provider: {
        async uploadSnapshot(snapshot) {
          await uploadsReady;
          uploaded.push(snapshot.id);
        },
        async listSnapshots() { return []; },
        async downloadSnapshot() { return Buffer.from("project"); }
      },
      isOnline: () => online
    });
    const snapshots = ["snap_1", "snap_2", "snap_3"].map(id => ({ id, cloudStatus: "queued" }) as Snapshot);
    await queue.enqueue(snapshots[0]);
    await queue.enqueue(snapshots[1]);

    online = true;
    const firstFlush = queue.flush();
    const secondFlush = queue.flush();
    const enqueue = queue.enqueue(snapshots[2]);
    releaseUploads();
    await Promise.all([firstFlush, secondFlush, enqueue]);
    await queue.flush();

    expect(uploaded.sort()).toEqual(["snap_1", "snap_2", "snap_3"]);
    expect(snapshots.map(snapshot => snapshot.cloudStatus)).toEqual(["synced", "synced", "synced"]);
  });

  it("retains failed uploads for retry during overlapping flushes without duplicating successful uploads", async () => {
    let online = false;
    let releaseUploads!: () => void;
    const uploadsReady = new Promise<void>(resolve => { releaseUploads = resolve; });
    const uploaded: string[] = [];
    let failFirst = true;
    const queue = createUploadQueue({
      provider: {
        async uploadSnapshot(snapshot) {
          await uploadsReady;
          if (snapshot.id === "snap_1" && failFirst) {
            failFirst = false;
            throw new Error("Offline during upload");
          }
          uploaded.push(snapshot.id);
        },
        async listSnapshots() { return []; },
        async downloadSnapshot() { return Buffer.from("project"); }
      },
      isOnline: () => online
    });
    const snapshots = ["snap_1", "snap_2"].map(id => ({ id, cloudStatus: "queued" }) as Snapshot);
    await queue.enqueue(snapshots[0]);
    await queue.enqueue(snapshots[1]);

    online = true;
    const firstFlush = queue.flush();
    const secondFlush = queue.flush();
    releaseUploads();
    await Promise.all([firstFlush, secondFlush]);
    await queue.flush();

    expect(uploaded.sort()).toEqual(["snap_1", "snap_2"]);
    expect(snapshots.map(snapshot => snapshot.cloudStatus)).toEqual(["synced", "synced"]);
  });
});
