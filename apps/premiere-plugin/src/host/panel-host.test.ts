import { afterEach, describe, expect, it, vi } from "vitest";
import { createPanelHost } from "./panel-host";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("panel host selection", () => {
  it("keeps missing host integration unavailable even in development", async () => {
    vi.stubEnv("DEV", true);
    vi.stubGlobal("require", undefined);

    const host = await createPanelHost();

    expect(host.project).toBeNull();
    expect("isMock" in host && host.isMock).not.toBe(true);
    expect(host.tracked).toBe(false);
    expect(host.companionConnected).toBe(false);
    expect(host.streams).toEqual([]);
  });

  it("uses labeled fixtures only when demo mode is explicitly requested", async () => {
    vi.stubGlobal("require", undefined);

    const host = await createPanelHost({ demoMode: true });

    expect("isMock" in host && host.isMock).toBe(true);
    expect(host.project?.name).toBe("Film.prproj");
    expect(host.snapshots).toHaveLength(2);
  });
});
