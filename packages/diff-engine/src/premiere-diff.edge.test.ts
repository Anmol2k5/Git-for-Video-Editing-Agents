import { describe, expect, it } from "vitest";
import { comparePremiereManifests } from "./index";
import { ticksToTimecode } from "./change-groups";
import type { PremiereProjectManifest } from "@editvcs/shared-types";

function manifest(sequences: PremiereProjectManifest["sequences"]): PremiereProjectManifest {
  return {
    projectName: "Test",
    projectPathHint: "C:/Test.prproj",
    capturedAt: "2026-07-05T00:00:00.000Z",
    sequences
  };
}

const seq = (name: string, clips: any[] = [], durationTicks = "1000") => ({
  name,
  durationTicks,
  videoTrackCount: 1,
  audioTrackCount: 1,
  clips
});

describe("Premiere manifest diff — edge cases", () => {
  it("reports trimmed clips when in/out ticks change", () => {
    const before = manifest([seq("Main Edit", [{ stableFingerprint: "c1", name: "A", trackType: "video", trackIndex: 1, inTicks: "0", outTicks: "10" }])]);
    const after = manifest([seq("Main Edit", [{ stableFingerprint: "c1", name: "A", trackType: "video", trackIndex: 1, inTicks: "2", outTicks: "8" }])]);

    const result = comparePremiereManifests(before, after);
    expect(result.summary).toContain("Trimmed clip: A");
  });

  it("summarizes multiple added sequences", () => {
    const before = manifest([seq("Main Edit")]);
    const after = manifest([seq("Main Edit"), seq("Intro")]);

    const result = comparePremiereManifests(before, after);
    const seqGroup = result.groups.find(g => g.title === "Sequences");
    expect(seqGroup?.items).toContain("Added sequence: Intro");
  });

  it("reports the added-clip count in the summary", () => {
    const before = manifest([seq("Main Edit")]);
    const after = manifest([
      seq("Main Edit", [
        { stableFingerprint: "c1", name: "A", trackType: "video", trackIndex: 1 },
        { stableFingerprint: "c2", name: "B", trackType: "video", trackIndex: 2 }
      ])
    ]);

    const result = comparePremiereManifests(before, after);
    expect(result.summary).toContain("Added 2 clips to Sequence: Main Edit");
  });

  it("produces no changes for an identical project", () => {
    const same = manifest([seq("Main Edit", [{ stableFingerprint: "c1", name: "A", trackType: "video", trackIndex: 1 }])]);
    const result = comparePremiereManifests(same, same);
    expect(result.summary).toEqual([]);
    expect(result.groups).toEqual([]);
  });

  it("formats timecodes below and above one hour", () => {
    const TPS = 254_016_000_000;
    expect(ticksToTimecode(String(522 * TPS))).toBe("08:42");
    expect(ticksToTimecode(String(3600 * TPS))).toBe("01:00:00");
    expect(ticksToTimecode(undefined)).toBe("unknown");
  });

  it("reports removed clips when they are present in before but not after", () => {
    const before = manifest([seq("Main Edit", [{ stableFingerprint: "c1", name: "ClipA", trackType: "video", trackIndex: 1 }])]);
    const after = manifest([seq("Main Edit", [])]);

    const result = comparePremiereManifests(before, after);
    expect(result.summary).toContain("Removed 1 clip from Sequence: Main Edit");
    const group = result.groups.find(g => g.title === "Video timeline");
    expect(group?.items).toContain("Removed clip: ClipA");
  });

  it("reports moved clips when start or end ticks change", () => {
    const before = manifest([seq("Main Edit", [{ stableFingerprint: "c1", name: "ClipA", trackType: "video", trackIndex: 1, startTicks: "100", endTicks: "200" }])]);
    const after = manifest([seq("Main Edit", [{ stableFingerprint: "c1", name: "ClipA", trackType: "video", trackIndex: 1, startTicks: "150", endTicks: "250" }])]);

    const result = comparePremiereManifests(before, after);
    expect(result.summary).toContain("Moved clip: ClipA");
    const group = result.groups.find(g => g.title === "Video timeline");
    expect(group?.items).toContain("Moved clip: ClipA");
  });

  it("reports track index changes", () => {
    const before = manifest([seq("Main Edit", [{ stableFingerprint: "c1", name: "ClipA", trackType: "video", trackIndex: 1 }])]);
    const after = manifest([seq("Main Edit", [{ stableFingerprint: "c1", name: "ClipA", trackType: "video", trackIndex: 2 }])]);

    const result = comparePremiereManifests(before, after);
    expect(result.summary).toContain("Track changed for clip: ClipA");
    const group = result.groups.find(g => g.title === "Video timeline");
    expect(group?.items).toContain("Track changed for clip: ClipA (from track 1 to 2)");
  });

  it("reports removed sequences", () => {
    const before = manifest([seq("Main Edit"), seq("Intro")]);
    const after = manifest([seq("Main Edit")]);

    const result = comparePremiereManifests(before, after);
    const seqGroup = result.groups.find(g => g.title === "Sequences");
    expect(seqGroup?.items).toContain("Removed sequence: Intro");
  });

  it("reports renamed sequences using stable ID", () => {
    const before = {
      projectName: "Test",
      projectPathHint: "C:/Test.prproj",
      capturedAt: "2026-07-05T00:00:00.000Z",
      sequences: [{ id: "seq-1", name: "Old Name", durationTicks: "1000", videoTrackCount: 1, audioTrackCount: 1, clips: [] }]
    };
    const after = {
      projectName: "Test",
      projectPathHint: "C:/Test.prproj",
      capturedAt: "2026-07-05T00:00:00.000Z",
      sequences: [{ id: "seq-1", name: "New Name", durationTicks: "1000", videoTrackCount: 1, audioTrackCount: 1, clips: [] }]
    };

    const result = comparePremiereManifests(before, after);
    const seqGroup = result.groups.find(g => g.title === "Sequences");
    expect(seqGroup?.items).toContain("Renamed sequence from Old Name to New Name");
  });

  it("reports audio clip changes in Audio timeline group", () => {
    const before = manifest([seq("Main Edit", [{ stableFingerprint: "c1", name: "AudioClip", trackType: "audio", trackIndex: 1 }])]);
    const after = manifest([seq("Main Edit", [
      { stableFingerprint: "c1", name: "AudioClip", trackType: "audio", trackIndex: 1, inTicks: "10" },
      { stableFingerprint: "c2", name: "NewAudio", trackType: "audio", trackIndex: 2 }
    ])]);

    const result = comparePremiereManifests(before, after);
    expect(result.summary).toContain("Trimmed audio clip: AudioClip");
    expect(result.summary).toContain("Added 1 audio clip to Sequence: Main Edit");
    const group = result.groups.find(g => g.title === "Audio timeline");
    expect(group?.items).toContain("Trimmed audio clip: AudioClip");
    expect(group?.items).toContain("Added audio clip: NewAudio");
  });
});
