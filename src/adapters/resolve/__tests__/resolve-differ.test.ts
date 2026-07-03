import { describe, it, expect } from "vitest";
import { resolveDiffer } from "../resolve-differ";

describe("DaVinci Resolve Semantic Differ (Live Import)", () => {
  it("detects a deleted clip", () => {
    const base = {
      "clip_1": { id: "clip_1", name: "Intro.mp4", type: "video", trackName: "V1", recordFrameStart: 0, recordFrameEnd: 100 }
    };
    const compare = {};
    
    const changes = resolveDiffer("cuts", base, compare);
    
    expect(changes.length).toBe(1);
    expect(changes[0].operation).toBe("remove");
    expect(changes[0].humanReadableSummary).toBe("Removed clip 'Intro.mp4' from V1.");
  });

  it("detects an added clip", () => {
    const base = {};
    const compare = {
      "clip_1": { id: "clip_1", name: "SFX.wav", type: "audio", trackName: "A1", recordFrameStart: 24, recordFrameEnd: 48 }
    };

    const changes = resolveDiffer("audio", base, compare);
    
    expect(changes.length).toBe(1);
    expect(changes[0].operation).toBe("add");
    expect(changes[0].humanReadableSummary).toBe("Added audio clip 'SFX.wav' to A1.");
  });

  it("detects a trimmed clip", () => {
    const base = {
      "clip_1": { id: "clip_1", name: "A-Roll.mp4", type: "video", trackName: "V1", recordFrameStart: 0, recordFrameEnd: 100 }
    };
    const compare = {
      "clip_1": { id: "clip_1", name: "A-Roll.mp4", type: "video", trackName: "V1", recordFrameStart: 24, recordFrameEnd: 100 }
    };

    const changes = resolveDiffer("cuts", base, compare);
    
    expect(changes.length).toBe(1);
    expect(changes[0].operation).toBe("update");
    expect(changes[0].humanReadableSummary).toBe("Trimmed 'A-Roll.mp4' by 24 frames.");
  });

  it("detects a moved clip", () => {
    const base = {
      "clip_1": { id: "clip_1", name: "B-Roll.mp4", type: "video", trackName: "V2", recordFrameStart: 100, recordFrameEnd: 200 }
    };
    const compare = {
      "clip_1": { id: "clip_1", name: "B-Roll.mp4", type: "video", trackName: "V2", recordFrameStart: 168, recordFrameEnd: 268 }
    };

    const changes = resolveDiffer("cuts", base, compare);
    
    expect(changes.length).toBe(1);
    expect(changes[0].operation).toBe("move");
    expect(changes[0].humanReadableSummary).toBe("Moved 'B-Roll.mp4' 68 frames later on V2.");
  });

  it("detects a marker addition", () => {
    const base = {};
    const compare = {
      "marker_1": { id: "marker_1", frameId: 86800, name: "Client Note", note: "Use alternate hook" }
    };

    const changes = resolveDiffer("markers", base, compare);
    
    expect(changes.length).toBe(1);
    expect(changes[0].operation).toBe("add");
    expect(changes[0].humanReadableSummary).toBe("Added marker at 86800: 'Use alternate hook'");
  });

  it("detects a caption update", () => {
    const base = {
      "caption_1": { id: "caption_1", name: "Subtitle", textConfig: { content: "Hello world" }, trackName: "ST1", recordFrameStart: 0, recordFrameEnd: 50 }
    };
    const compare = {
      "caption_1": { id: "caption_1", name: "Subtitle", textConfig: { content: "Hello everyone" }, trackName: "ST1", recordFrameStart: 0, recordFrameEnd: 50 }
    };

    const changes = resolveDiffer("captions", base, compare);
    
    expect(changes.length).toBe(1);
    expect(changes[0].operation).toBe("update");
    expect(changes[0].humanReadableSummary).toBe("Updated caption text to 'Hello everyone'.");
  });

  it("detects an effect addition", () => {
    const base = {};
    const compare = {
      "effect_1": { id: "effect_1", effectType: "Gaussian Blur", name: "Blur 1", trackName: "V1" }
    };

    const changes = resolveDiffer("effects", base, compare);
    
    expect(changes.length).toBe(1);
    expect(changes[0].operation).toBe("add");
    expect(changes[0].humanReadableSummary).toBe("Added effect 'Gaussian Blur' to V1.");
  });

  it("detects a color grade adjustment", () => {
    const base = {
      "grade_1": { id: "grade_1", clipName: "A-Roll.mp4", nodes: [{ type: "primary", lift: 0 }] }
    };
    const compare = {
      "grade_1": { id: "grade_1", clipName: "A-Roll.mp4", nodes: [{ type: "primary", lift: 0.5 }] }
    };

    const changes = resolveDiffer("color", base, compare);
    
    expect(changes.length).toBe(1);
    expect(changes[0].operation).toBe("update");
    expect(changes[0].humanReadableSummary).toBe("Adjusted color grade for 'A-Roll.mp4'.");
  });
});
