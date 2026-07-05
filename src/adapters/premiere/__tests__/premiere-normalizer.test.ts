import { describe, it, expect } from "vitest";
import { normalizePremiereTimeline } from "../premiere-normalizer.js";

describe("Premiere Normalizer", () => {
  it("should normalize a valid premiere JSON export into domains", () => {
    const mockExport = {
      projectName: "Test Project",
      sequenceName: "Sequence 01",
      framerate: 24,
      markers: [
        { id: "m1", name: "Start", start: 0, end: 0, comments: "Intro" }
      ],
      videoTracks: [
        {
          name: "V1",
          clips: [
            { id: "v1_c1", name: "A_Roll.mp4", start: 0, end: 10, inPoint: 5, outPoint: 15 }
          ]
        }
      ],
      audioTracks: [
        {
          name: "A1",
          clips: [
            { id: "a1_c1", name: "A_Roll_Audio.wav", start: 0, end: 10, inPoint: 5, outPoint: 15 }
          ]
        }
      ]
    };

    const domains = normalizePremiereTimeline(mockExport);

    const metadata = domains.find(d => d.domain === "metadata")?.data;
    expect(metadata).toBeDefined();
    expect(metadata?.projectName).toBe("Test Project");
    expect(metadata?.timelineName).toBe("Sequence 01");

    const cuts = domains.find(d => d.domain === "cuts")?.data;
    expect(cuts).toBeDefined();
    expect(cuts!["v1_c1"]).toBeDefined();
    expect(cuts!["v1_c1"].name).toBe("A_Roll.mp4");
    expect(cuts!["v1_c1"].recordFrameStart).toBe(0);

    const audio = domains.find(d => d.domain === "audio")?.data;
    expect(audio).toBeDefined();
    expect(audio!["a1_c1"]).toBeDefined();
    expect(audio!["a1_c1"].name).toBe("A_Roll_Audio.wav");

    const markers = domains.find(d => d.domain === "markers")?.data;
    expect(markers).toBeDefined();
    expect(markers!["m1"]).toBeDefined();
    expect(markers!["m1"].name).toBe("Start");
  });

  it("should return empty domains on error", () => {
    const domains = normalizePremiereTimeline({ error: "Failed to extract" });
    const metadata = domains.find(d => d.domain === "metadata")?.data;
    expect(metadata).toEqual({});
  });
});
