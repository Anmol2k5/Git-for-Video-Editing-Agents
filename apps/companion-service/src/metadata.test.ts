import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createSnapshotService } from "./snapshot-service";
import type { PremiereProjectManifest } from "@editvcs/shared-types";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
const manifest = (): PremiereProjectManifest => ({
  host: "premiere", projectName: "Film", projectPathHint: "/Users/private/Client/Film.prproj", capturedAt: "2026-11-02T00:00:00Z",
  sequences: [{ name: "Main", clips: [{ stableFingerprint: "c1", name: "Clip", trackType: "video", trackIndex: 0, sourcePathHint: "C:\\Users\\private\\Media\\Clip.mov" }] }],
  projectItems: [{ name: "Clip", sourcePathHint: "/Users/private/Media/Clip.mov" }]
});
async function snapshot(metadata: PremiereProjectManifest | null, status: "verified" | "best-effort" | "unavailable") {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-metadata-")); dirs.push(dir);
  const project = path.join(dir, "Film.prproj"); await writeFile(project, "v1");
  const service = createSnapshotService({ storageRoot: path.join(dir, "storage") });
  const result = (await service.createManualSnapshot({ projectId: "proj_test", projectPath: project, label: "Save", manifest: metadata, manifestStatus: status })).snapshot!;
  if (result.manifest.host !== "premiere") throw Error("Expected Premiere manifest");
  return { ...result, manifest: result.manifest };
}
it("preserves best-effort metadata confidence", async () => {
  expect((await snapshot(manifest(), "best-effort")).manifestStatus).toBe("best-effort");
});
it("never verifies missing metadata", async () => {
  expect((await snapshot(null, "verified")).manifestStatus).toBe("unavailable");
});
it("does not publish unavailable metadata as trustworthy sequence data", async () => {
  const saved = await snapshot(manifest(), "unavailable");
  expect(saved.manifestStatus).toBe("unavailable"); expect(saved.manifest.sequences).toEqual([]);
});
it("sanitizes project and media path hints before persisting", async () => {
  const saved = await snapshot(manifest(), "verified");
  expect(saved.manifest.projectPathHint).toBe(".../Client/Film.prproj");
  expect(saved.manifest.sequences[0].clips![0].sourcePathHint).toBe(".../Media/Clip.mov");
  expect(saved.manifest.projectItems![0].sourcePathHint).toBe(".../Media/Clip.mov");
});
it("enforces the manifest limit in UTF-8 bytes", async () => {
  const data = manifest(); data.projectName = "界".repeat(400000);
  const saved = await snapshot(data, "verified");
  expect(saved.manifestStatus).toBe("unavailable"); expect(saved.manifest.sequences).toEqual([]);
});
