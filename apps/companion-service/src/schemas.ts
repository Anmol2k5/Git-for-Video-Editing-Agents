import { z } from "zod";
import {
  clipSchema,
  sequenceSchema,
  premiereManifestSchema,
  storageIdentifierSchema,
} from "@editvcs/storage";

export { clipSchema, sequenceSchema, premiereManifestSchema };

export const registerProjectSchema = z.object({
  projectPath: z.string().min(1).max(4096),
});

export const createSnapshotSchema = z.object({
  projectId: storageIdentifierSchema,
  label: z.string().trim().min(1).max(200),
  trigger: z.enum(["manual", "automatic"]).default("manual"),
  manifest: premiereManifestSchema.nullable().optional(),
  manifestStatus: z
    .enum(["verified", "best-effort", "unavailable"])
    .default("unavailable"),
  manifestReason: z.string().optional()
});

export const restoreCopySchema = z.object({
  projectId: storageIdentifierSchema,
  snapshotId: storageIdentifierSchema,
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
