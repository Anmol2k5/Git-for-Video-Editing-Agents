import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it } from "vitest";
import { timelineStateSchema } from "./schemas";

const script = readFileSync(new URL("../jsx/hostscript.jsx", import.meta.url), "utf8");
function host(saveResult: number) {
  const context = { $: {} as any, app: { project: { name: "Film", path: "/tmp/Film.prproj", save: () => saveResult, activeSequence: { sequenceID: "sequence-A", timebase: "10584000000", name: "Main", videoTracks: { numTracks: 0 }, audioTracks: { numTracks: 0 } } } } };
  vm.runInNewContext(script, context); return context.$._editvcs;
}
it("converts Premiere tick-string timebase to numeric frame rate", () => {
  const state = timelineStateSchema.parse(JSON.parse(host(0).getTimelineState()));
  expect(state.framerate).toBe(24);
});
it("preserves sequence identity across host serialization and panel validation", () => {
  const state = timelineStateSchema.parse(JSON.parse(host(0).getTimelineState()));
  expect((state as { sequenceId?: string }).sequenceId).toBe("sequence-A");
});
it("does not report a nonzero Premiere save result as success", () => {
  expect(host(1).saveActiveProject()).not.toBe("SUCCESS");
  expect(host(0).saveActiveProject()).toBe("SUCCESS");
});

it('does not save a different project from the one requested by the panel', () => {
  expect(host(0).saveActiveProject('/tmp/Other.prproj')).toBe('FAILED');
});
it('rejects metadata for a different project from the requested save point', () => {
  const state = JSON.parse(host(0).getTimelineState('/tmp/Other.prproj'));
  expect(state.error).toBe('PROJECT_CHANGED');
});
