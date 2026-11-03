import { describe, expect, it } from "vitest";
import { createPremierePanelHost, createPremiereUxpAdapter } from "./premiere-uxp-adapter";

describe("Premiere UXP adapter", () => {
  it("detects the active Premiere project through the UXP premierepro module", async () => {
    const adapter = createPremiereUxpAdapter({
      requireModule: (name) => {
        expect(name).toBe("premierepro");
        return {
          Project: {
            async getActiveProject() {
              return {
                guid: "project-guid",
                name: "Film.prproj",
                path: "D:/work/Film.prproj",
                async getActiveSequence() {
                  return null;
                },
                async getSequences() {
                  return [];
                }
              };
            }
          }
        };
      }
    });

    await expect(adapter.getCapabilities()).resolves.toMatchObject({
      projectPath: true,
      activeSequenceRead: true,
      sequenceInventoryRead: true
    });
    await expect(adapter.getCurrentProject()).resolves.toMatchObject({
      host: "premiere",
      projectId: "project-guid",
      name: "Film.prproj",
      path: "D:/work/Film.prproj",
      extension: ".prproj"
    });
  });

  it("collects a Premiere manifest from sequences and clips when the host exposes them", async () => {
    const adapter = createPremiereUxpAdapter({
      requireModule: () => ({
        appVersion: "25.6",
        Project: {
          async getActiveProject() {
            return {
              guid: "project-guid",
              name: "Film.prproj",
              path: "D:/work/Film.prproj",
              async getSequences() {
                return [
                  {
                    guid: "sequence-guid",
                    name: "Main Edit",
                    duration: { ticks: "9000" },
                    videoTracks: [
                      {
                        clips: [
                          {
                            guid: "clip-guid",
                            name: "Intro.mov",
                            start: { ticks: "0" },
                            end: { ticks: "1200" },
                            inPoint: { ticks: "0" },
                            outPoint: { ticks: "1200" },
                            projectItem: {
                              getMediaFilePath: () => "D:/media/Intro.mov"
                            }
                          }
                        ]
                      }
                    ],
                    audioTracks: []
                  }
                ];
              }
            };
          }
        }
      })
    });

    await expect(adapter.collectManifest()).resolves.toMatchObject({
      projectName: "Film.prproj",
      projectPathHint: "D:/work/Film.prproj",
      appVersion: "25.6",
      sequences: [
        {
          id: "sequence-guid",
          name: "Main Edit",
          durationTicks: "9000",
          videoTrackCount: 1,
          audioTrackCount: 0,
          clips: [
            {
              stableFingerprint: "clip-guid",
              name: "Intro.mov",
              trackType: "video",
              trackIndex: 0,
              sourcePathHint: "Intro.mov"
            }
          ]
        }
      ]
    });
  });

  it("degrades to an unavailable panel host outside Premiere UXP", async () => {
    const host = await createPremierePanelHost({
      requireModule: () => {
        throw new Error("Cannot find module");
      }
    });

    expect(host.project).toBeNull();
    expect(host.capabilities.projectPath).toBe(false);
    expect(host.companionConnected).toBe(false);
    expect(host.tracked).toBe(false);
    expect(host.streams).toEqual([]);
  });
});


describe("UXP prototype readiness", () => {
  it("does not infer companion tracking, version streams, or changes from a project path", async () => {
    const host = await createPremierePanelHost({
      requireModule: () => ({
        Project: {
          getActiveProject: async () => ({
            name: "Film.prproj",
            path: "D:/work/Film.prproj",
            getSequences: async () => [{ name: "Main edit" }]
          })
        }
      })
    });

    expect(host.project?.path).toBe("D:/work/Film.prproj");
    expect(host.tracked).toBe(false);
    expect(host.companionConnected).toBe(false);
    expect(host.streams).toEqual([]);
    expect(host.changes.summary).toEqual([]);
  });

  it("does not claim clip or media access when only project identity is exposed", async () => {
    const adapter = createPremiereUxpAdapter({
      requireModule: () => ({
        Project: { getActiveProject: async () => ({ name: "Film.prproj" }) }
      })
    });

    expect(await adapter.getCapabilities()).toMatchObject({
      trackClipRead: false,
      mediaReferenceRead: false
    });
  });

  it("reports clip and media access only for exposed tracks and media readers", async () => {
    const adapter = createPremiereUxpAdapter({
      requireModule: () => ({
        Project: {
          getActiveProject: async () => ({
            getSequences: async () => [{
              videoTracks: [{ clips: [{ projectItem: { getMediaFilePath: () => "D:/media/Intro.mov" } }] }],
              audioTracks: []
            }]
          })
        }
      })
    });

    expect(await adapter.getCapabilities()).toMatchObject({
      trackClipRead: true,
      mediaReferenceRead: true
    });
  });
});
