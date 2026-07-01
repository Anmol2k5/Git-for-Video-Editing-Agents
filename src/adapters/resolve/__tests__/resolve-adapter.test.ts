import { describe, it, expect, vi } from "vitest";
import { ResolveAdapter } from "../resolve-adapter";
import { ResolveLiveImporter } from "../resolve-live-import";

// Mock the python child_process spawn
vi.mock("child_process", () => ({
  spawn: vi.fn().mockImplementation((command, args) => {
    return {
      stdout: { on: vi.fn((event, cb) => cb(JSON.stringify({
        success: true,
        source: "davinci-resolve-live",
        project: { id: "p1", name: "Project" },
        timeline: { id: "123", name: "Test TL", tracks: [], startFrame: 0 }
      }))) },
      stderr: { on: vi.fn() },
      on: vi.fn((event, cb) => {
        if (event === "close") cb(0);
      })
    };
  })
}));

describe("Resolve Adapter Live Import", () => {
  it("imports live data successfully via python bridge", async () => {
    const adapter = new ResolveAdapter();
    const snapshot = await adapter.importState({ live: true });
    
    expect(snapshot.sourceType).toBe("resolve-live-import");
    expect(snapshot.domains.find(d => d.domain === "metadata")?.data.timelineId).toBe("123");
  });
});
