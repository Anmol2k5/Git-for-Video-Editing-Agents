import { describe, it, expect } from "vitest";
import { resolveDiffer } from "../resolve-differ";
import { TimelineChange } from "../../../core/types";

describe("DaVinci Resolve Semantic Differ", () => {
  it("detects a deleted clip", () => {
    const base = {
      "clip_1": { id: "clip_1", name: "Intro.mp4", type: "video", recordIn: 0, recordOut: 100 }
    };
    const compare = {};
    
    const changes = resolveDiffer("cuts", base, compare);
    
    expect(changes.length).toBe(1);
    expect(changes[0].operation).toBe("remove");
    expect(changes[0].entityType).toBe("clip");
    expect(changes[0].humanReadableSummary).toBe("Removed clip 'Intro.mp4' from 00:00:00:00.");
  });

  it("detects an added audio clip", () => {
    const base = {};
    const compare = {
      "audio_1": { id: "audio_1", name: "SFX.wav", type: "audio", recordIn: 24, recordOut: 48, audioConfig: { volumeDb: -10 } }
    };

    const changes = resolveDiffer("audio", base, compare);
    
    expect(changes.length).toBe(1);
    expect(changes[0].operation).toBe("add");
    expect(changes[0].entityType).toBe("audio_clip");
    expect(changes[0].humanReadableSummary).toBe("Added audio track 'SFX.wav' at 00:00:01:00.");
  });

  it("detects a trimmed clip", () => {
    const base = {
      "clip_1": { id: "clip_1", name: "A-Roll.mp4", type: "video", recordIn: 0, recordOut: 100 }
    };
    const compare = {
      "clip_1": { id: "clip_1", name: "A-Roll.mp4", type: "video", recordIn: 24, recordOut: 100 }
    };

    const changes = resolveDiffer("cuts", base, compare);
    
    expect(changes.length).toBe(1);
    expect(changes[0].operation).toBe("update");
    expect(changes[0].humanReadableSummary).toBe("Trimmed clip 'A-Roll.mp4' by 1.0 seconds from 00:00:01:00 to 00:00:04:04.");
  });

  it("detects a moved clip", () => {
    const base = {
      "clip_1": { id: "clip_1", name: "B-Roll.mp4", type: "video", trackName: "V1", recordIn: 100, recordOut: 200 }
    };
    const compare = {
      "clip_1": { id: "clip_1", name: "B-Roll.mp4", type: "video", trackName: "V1", recordIn: 150, recordOut: 250 }
    };

    const changes = resolveDiffer("cuts", base, compare);
    
    expect(changes.length).toBe(1);
    expect(changes[0].operation).toBe("move");
    expect(changes[0].humanReadableSummary).toBe("Moved 'B-Roll.mp4' on V1 to 00:00:06:06.");
  });

  it("detects a property change (volume)", () => {
    const base = {
      "audio_1": { id: "audio_1", name: "Voice.wav", type: "audio", recordIn: 0, recordOut: 100, audioConfig: { volumeDb: -5 } }
    };
    const compare = {
      "audio_1": { id: "audio_1", name: "Voice.wav", type: "audio", recordIn: 0, recordOut: 100, audioConfig: { volumeDb: -2 } }
    };

    const changes = resolveDiffer("audio", base, compare);
    
    expect(changes.length).toBe(1);
    expect(changes[0].operation).toBe("update");
    expect(changes[0].humanReadableSummary).toBe("Changed dialogue audio gain from -5.0 dB to -2.0 dB for clip 'Voice.wav'.");
  });

  it("detects a caption text change", () => {
    const base = {
      "cap_1": { id: "cap_1", name: "Text+", type: "title", recordIn: 0, recordOut: 100, textConfig: { content: "Hello", font: "Arial", size: 64 } }
    };
    const compare = {
      "cap_1": { id: "cap_1", name: "Text+", type: "title", recordIn: 0, recordOut: 100, textConfig: { content: "Hello World", font: "Arial", size: 64 } }
    };

    const changes = resolveDiffer("captions", base, compare);
    
    expect(changes.length).toBe(1);
    expect(changes[0].operation).toBe("update");
    expect(changes[0].entityType).toBe("caption");
    expect(changes[0].humanReadableSummary).toBe("Updated caption properties for 'Text+'.");
  });
});
