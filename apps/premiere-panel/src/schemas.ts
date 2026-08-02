import { z } from "zod";

export const clipSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  start: z.number(),
  end: z.number(),
  inPoint: z.number(),
  outPoint: z.number(),
  duration: z.number().optional(),
});

export const trackSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  clips: z.array(clipSchema).optional(),
});

export const timelineStateSchema = z.object({
  projectName: z.string().optional(),
  sequenceName: z.string().optional(),
  framerate: z.number().optional(),
  videoTracks: z.array(trackSchema).optional(),
  audioTracks: z.array(trackSchema).optional(),
  error: z.string().optional(),
  reason: z.string().optional(),
});

export type TimelineState = z.infer<typeof timelineStateSchema>;
