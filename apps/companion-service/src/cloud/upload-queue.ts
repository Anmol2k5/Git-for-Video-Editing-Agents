import type { RemoteStorageProvider, Snapshot } from "@editvcs/shared-types";

export function createUploadQueue(opts: {
  provider: RemoteStorageProvider;
  isOnline: () => boolean;
}) {
  const queue: Snapshot[] = [];
  let onlineCheck = opts.isOnline;

  return {
    setOnlineCheck(check: () => boolean) {
      onlineCheck = check;
    },
    async enqueue(snapshot: Snapshot) {
      queue.push(snapshot);
      if (onlineCheck()) {
        await this.flush();
      }
    },
    async flush() {
      if (!onlineCheck()) return;
      while (queue.length > 0) {
        const snap = queue.shift();
        if (snap) {
          try {
            await opts.provider.uploadSnapshot(snap);
            snap.cloudStatus = "synced";
          } catch {
            snap.cloudStatus = "failed";
            queue.unshift(snap);
            break;
          }
        }
      }
    }
  };
}
