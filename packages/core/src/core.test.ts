import { describe, expect, it } from "vitest";
import { createProjectId, createSnapshotId, createRestoreFileName, createStream, canShowMergeLanguage } from "./index";

describe("core utilities", () => {
  it("creates stable project IDs from host and path hint", () => {
    expect(createProjectId("premiere", "D:/work/Film.prproj")).toMatch(/^proj_[a-f0-9]{16}$/);
    expect(createProjectId("premiere", "D:/work/Film.prproj")).toBe(createProjectId("premiere", "D:/work/Film.prproj"));
  });

  it("creates snapshot IDs with time and hash material", () => {
    expect(createSnapshotId("proj_abc", "2026-07-05T12:00:00.000Z", "a".repeat(64))).toBe("snap_20260705T120000_aaaaaaaaaaaa");
  });

  it("creates restore-as-copy file names", () => {
    expect(createRestoreFileName("YouTube Video Final.prproj", "Client feedback applied", "2026-07-05T18:41:00.000Z")).toBe("YouTube Video Final_restored_Client_feedback_applied_2026-07-05.prproj");
  });

  it("creates user-facing version streams", () => {
    expect(createStream("proj_1", "Client feedback", "snap_1")).toMatchObject({
      projectId: "proj_1",
      name: "Client feedback",
      baseSnapshotId: "snap_1"
    });
  });

  it("never allows merge language in Phase 1 UI", () => {
    expect(canShowMergeLanguage()).toBe(false);
  });
});
