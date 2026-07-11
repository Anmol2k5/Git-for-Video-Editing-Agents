import { z } from "zod";

export const registerProjectSchema = z.object({
  projectPath: z.string().min(1).max(4096),
});

export const createSnapshotSchema = z.object({
  projectId: z.string().uuid(),
  label: z.string().max(200).optional(),
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
