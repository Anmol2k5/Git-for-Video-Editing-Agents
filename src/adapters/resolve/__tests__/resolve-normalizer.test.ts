import { describe, it, expect } from "vitest";
import { normalizeResolveTimeline } from "../resolve-normalizer";

describe("Resolve Normalizer", () => {
  it("extracts subtitle text and effects into respective domains", () => {
    const mockExport = {
      success: true,
      source: "davinci-resolve-live",
      resolveVersion: "18.1.0",
      project: { id: "p1", name: "Project" },
      timeline: {
        id: "tl1",
        name: "Test TL",
        frameRate: 24,
        startFrame: 0,
        startTimecode: "00:00:00:00",
        durationFrames: 100,
        videoTrackCount: 1,
        audioTrackCount: 0,
        subtitleTrackCount: 1,
        markers: [],
        tracks: [
          {
            id: "subtitle-1",
            type: "subtitle",
            index: 1,
            name: "ST1",
            items: [
              {
                id: "sub_1",
                name: "Hello World",
                trackType: "subtitle",
                trackIndex: 1,
                recordFrameStart: 0,
                recordFrameEnd: 50,
                sourceFrameStart: 0,
                sourceFrameEnd: 50,
                durationFrames: 50,
                startTimecode: "0",
                endTimecode: "0",
                enabled: true,
                properties: { text: "Hello World" },
                markers: []
              }
            ]
          } as any,
          {
            id: "video-1",
            type: "video",
            index: 1,
            name: "V1",
            items: [
              {
                id: "vid_1",
                name: "A-Roll",
                trackType: "video",
                trackIndex: 1,
                recordFrameStart: 50,
                recordFrameEnd: 100,
                sourceFrameStart: 0,
                sourceFrameEnd: 50,
                durationFrames: 50,
                startTimecode: "0",
                endTimecode: "0",
                enabled: true,
                properties: { "Fusion Effects": "Gaussian Blur" },
                markers: []
              }
            ]
          } as any
        ]
      },
      warnings: []
    };

    const domains = normalizeResolveTimeline(mockExport);

    const captionsDomain = domains.find(d => d.domain === "captions");
    expect(captionsDomain?.data["sub_1"].textConfig.content).toBe("Hello World");

    const effectsDomain = domains.find(d => d.domain === "effects");
    expect(effectsDomain?.data["vid_1_effect"].effectType).toBe("Gaussian Blur");
  });
});
