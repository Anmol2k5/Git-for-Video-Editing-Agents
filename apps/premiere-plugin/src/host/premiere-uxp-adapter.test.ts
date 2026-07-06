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
  });
});
