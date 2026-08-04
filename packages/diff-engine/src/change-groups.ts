export type ClipChangeType = "added" | "removed" | "moved" | "trimmed" | "track-changed";

export interface DetailedClipChange {
  type: ClipChangeType;
  clipName: string;
  trackType: "video" | "audio";
  trackIndex: number;
  oldTrackIndex?: number;
  detail: string;
  oldTimecode?: string;
  newTimecode?: string;
}

export interface ChangeGroup {
  title: string;
  items: string[];
  clipChanges?: DetailedClipChange[];
}

export interface DiffResult {
  confidence: "exact" | "high" | "best-effort" | "low";
  summary: string[];
  groups: ChangeGroup[];
  unsupported: string[];
}

// Premiere stores time in ticks; there are 254,016,000,000 ticks per second.
const TICKS_PER_SECOND = 254_016_000_000;

/** Convert a Premiere `durationTicks` value into a compact timecode (MM:SS or HH:MM:SS). */
export function ticksToTimecode(ticks: string | undefined): string {
  if (!ticks) return "unknown";
  const seconds = Math.round(Number(ticks) / TICKS_PER_SECOND);
  if (!Number.isFinite(seconds)) return "unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
