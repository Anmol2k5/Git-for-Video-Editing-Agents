import { z } from "zod";

export const clipSchema = z.object({
  stableFingerprint: z.string().min(1),
  name: z.string(),
  trackType: z.enum(["video", "audio"]),
  trackIndex: z.number(),
  startTicks: z.string().optional(),
  endTicks: z.string().optional(),
  inTicks: z.string().optional(),
  outTicks: z.string().optional(),
  sourcePathHint: z.string().optional(),
});

export const sequenceSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  durationTicks: z.string().optional(),
  videoTrackCount: z.number().optional(),
  audioTrackCount: z.number().optional(),
  clips: z.array(clipSchema).optional(),
});

export const premiereManifestSchema = z.object({
  projectName: z.string(),
  projectPathHint: z.string(),
  capturedAt: z.string(),
  appVersion: z.string().optional(),
  sequences: z.array(sequenceSchema),
  projectItems: z.array(z.object({
    name: z.string(),
    type: z.string().optional(),
    sourcePathHint: z.string().optional()
  })).optional()
});

export const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  projectId: z.string().uuid(),
  parentSnapshotId: z.string().optional(),
  streamId: z.string().min(1),
  sequenceNumber: z.number(),
  createdAt: z.string(),
  createdBy: z.string(),
  trigger: z.enum(["manual", "automatic", "before-restore", "cloud-pull"]),
  label: z.string().optional(),
  note: z.string().optional(),
  projectFile: z.object({
    originalFileName: z.string(),
    sourceExtension: z.literal(".prproj"),
    sha256: z.string().length(64),
    byteSize: z.number()
  }),
  manifest: premiereManifestSchema,
  manifestStatus: z.enum(["verified", "best-effort", "unavailable"]),
  manifestReason: z.string().optional(),
  cloudStatus: z.enum(["local-only", "queued", "synced", "failed"])
});
