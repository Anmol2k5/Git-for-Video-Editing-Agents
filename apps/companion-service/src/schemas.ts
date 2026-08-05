import { z } from "zod";
import {
  clipSchema,
  sequenceSchema,
  premiereManifestSchema as _premiereManifestSchema,
} from "@editvcs/storage";

export { clipSchema, sequenceSchema, _premiereManifestSchema as premiereManifestSchema };

// Cast to z.ZodTypeAny to avoid cross-package Zod type instance incompatibility
const premiereManifestSchema = _premiereManifestSchema as unknown as z.ZodTypeAny;

export const registerProjectSchema = z.object({
  projectPath: z.string().min(1).max(4096),
});

export const createSnapshotSchema = z.object({
  projectId: z.string().min(1),
  label: z.string().trim().min(1).max(200),
  trigger: z.enum(["manual", "automatic"]).default("manual"),
  manifest: premiereManifestSchema.nullable().optional(),
  manifestStatus: z
    .enum(["verified", "best-effort", "unavailable"])
    .default("unavailable"),
  manifestReason: z.string().optional()
});

export const restoreCopySchema = z.object({
  projectId: z.string().min(1),
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
