import before from "../../../tests/fixtures/manifests/premiere-before-client.json";
import after from "../../../tests/fixtures/manifests/premiere-after-client.json";
import { describe, expect, it } from "vitest";
import { comparePremiereManifests } from "./index";

describe("Premiere manifest diff", () => {
  it("summarizes trustworthy sequence and clip changes", () => {
    // @ts-ignore
    const result = comparePremiereManifests(before, after);

    expect(result.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Sequences" }),
        expect.objectContaining({ title: "Video timeline" })
      ])
    );
    expect(result.summary).toContain("Added 1 clip to Sequence: Main Edit");
    expect(result.summary).toContain("Changed sequence duration from 08:42 to 09:17");
  });

  it("reports unsupported clip-level changes honestly", () => {
    // @ts-ignore
    const result = comparePremiereManifests({ ...before, sequences: [{ name: "Main Edit" }] }, after);
    expect(result.unsupported).toContain("Could not inspect clip-level changes in this Premiere version");
  });
});
