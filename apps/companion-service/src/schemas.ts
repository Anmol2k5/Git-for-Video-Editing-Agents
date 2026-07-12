import { z } from "zod";

export const registerProjectSchema = z.object({
  projectPath: z.string().min(1).max(4096),
});

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

export const createSnapshotSchema = z.object({
  projectId: z.string().uuid(),
  label: z.string().trim().min(1).max(200),
  trigger: z.enum(["manual", "automatic"]).default("manual"),
  manifest: premiereManifestSchema.nullable().optional(),
  manifestStatus: z
    .enum(["verified", "best-effort", "unavailable"])
    .default("unavailable"),
  manifestReason: z.string().optional()
});

export const restoreCopySchema = z.object({
  projectId: z.string().uuid(),
  snapshotId: z.string().min(1),
  destinationDirectory: z.string().min(1).max(4096),
});

export const pairCompleteSchema = z.object({
  pairingId: z.string().uuid(),
  code: z.string().length(6).regex(/^\d{6}$/),
});

export const refreshSessionSchema = z.object({
  sessionToken: z.string().min(1),
});

export const changesQuerySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1)
});
