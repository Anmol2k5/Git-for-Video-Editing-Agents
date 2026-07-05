import { describe, expect, it } from "vitest";
import { createMockAfterEffectsAdapter, createMockPremiereAdapter } from "./index";

describe("host adapters", () => {
  it("detects mock Premiere project and capabilities", async () => {
    const adapter = createMockPremiereAdapter({ projectPath: true });
    await expect(adapter.getCurrentProject()).resolves.toMatchObject({
      host: "premiere",
      extension: ".prproj",
      name: "Film.prproj"
    });
    await expect(adapter.getCapabilities()).resolves.toMatchObject({ projectPath: true });
  });

  it("keeps After Effects behind a mock extension point", async () => {
    const adapter = createMockAfterEffectsAdapter({ enabled: false });
    await expect(adapter.getCurrentProject()).resolves.toBeNull();
  });
});
