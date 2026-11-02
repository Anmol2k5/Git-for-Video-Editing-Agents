import { expect, it } from "vitest";
import { comparePremiereManifests } from "./premiere-diff";
import type { PremiereProjectManifest } from "@editvcs/shared-types";

const data: PremiereProjectManifest = { host: "premiere", projectName: "Film", projectPathHint: "Film.prproj", capturedAt: "2026-11-02", sequences: [
  { id: "a", name: "Main", clips: [{ stableFingerprint: "clip-a", name: "A", trackIndex: 0, trackType: "video" }] },
  { id: "b", name: "Main", clips: [{ stableFingerprint: "clip-b", name: "B", trackIndex: 0, trackType: "video" }] }
] };
it("compares duplicate sequence names by stable identity", () => {
  expect(comparePremiereManifests(data, structuredClone(data)).groups).toEqual([]);
});
it("does not match a replaced sequence by its reused name", () => {
  const old = { ...data, sequences: [data.sequences[0]] };
  const next = { ...data, sequences: [{ ...data.sequences[0], id: "new" }] };
  const diff = comparePremiereManifests(old, next);
  expect(diff.groups.flatMap(group => group.items)).toEqual(["Removed sequence: Main", "Added sequence: Main"]);
  expect(diff.summary).toContain("Added sequence: Main");
});
it("does not claim exact coverage when the before snapshot lacks clip metadata", () => {
  const before = { ...data, sequences: [{ id: "a", name: "Main" }] };
  const after = { ...data, sequences: [{ id: "a", name: "Main", clips: [] }] };
  expect(comparePremiereManifests(before, after).confidence).not.toBe("exact");
});

it("does not infer removed sequences from different partial active-sequence captures", () => {
  const before = { ...data, sequences: [data.sequences[0]] };
  const after = { ...data, sequences: [data.sequences[1]] };
  const diff = comparePremiereManifests(before, after, { partialCoverage: true });
  expect(diff.groups).toEqual([]);
  expect(diff.summary.join(" ")).toMatch(/cannot be determined/i);
  expect(diff.unsupported.length).toBeGreaterThan(0);
});
