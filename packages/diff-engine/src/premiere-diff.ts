import type { PremiereProjectManifest } from "@editvcs/shared-types";
import { ticksToTimecode, type DiffResult } from "./change-groups";

export function comparePremiereManifests(before: PremiereProjectManifest, after: PremiereProjectManifest): DiffResult {
  const result: DiffResult = {
    summary: [],
    groups: [],
    unsupported: []
  };

  const seqGroup = { title: "Sequences", items: [] as string[] };
  const vidGroup = { title: "Video timeline", items: [] as string[] };
  
  for (const newSeq of after.sequences) {
    const oldSeq = before.sequences.find(s => s.name === newSeq.name);
    if (!oldSeq) {
      seqGroup.items.push(`Added sequence: ${newSeq.name}`);
      continue;
    }

    if (oldSeq.durationTicks && newSeq.durationTicks && oldSeq.durationTicks !== newSeq.durationTicks) {
      const msg = `Changed sequence duration from ${ticksToTimecode(oldSeq.durationTicks)} to ${ticksToTimecode(newSeq.durationTicks)}`;
      result.summary.push(msg);
      seqGroup.items.push(msg);
    }

    if (!oldSeq.clips || !newSeq.clips) {
      result.unsupported.push("Could not inspect clip-level changes in this Premiere version");
      continue;
    }

    let addedClips = 0;
    for (const newClip of newSeq.clips) {
      const oldClip = oldSeq.clips.find(c => c.stableFingerprint === newClip.stableFingerprint);
      if (!oldClip) {
        addedClips++;
        vidGroup.items.push(`Added clip: ${newClip.name}`);
      } else {
        if (oldClip.inTicks !== newClip.inTicks || oldClip.outTicks !== newClip.outTicks) {
          vidGroup.items.push(`Trimmed clip: ${newClip.name}`);
        }
      }
    }
    
    if (addedClips > 0) {
      result.summary.push(`Added ${addedClips} clip to Sequence: ${newSeq.name}`);
    }
  }

  if (seqGroup.items.length > 0) result.groups.push(seqGroup);
  if (vidGroup.items.length > 0) result.groups.push(vidGroup);

  return result;
}
