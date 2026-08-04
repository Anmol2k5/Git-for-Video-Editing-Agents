import type { PremiereProjectManifest } from "@editvcs/shared-types";
import { ticksToTimecode, type DiffResult, type DetailedClipChange, type ChangeGroup } from "./change-groups";

export function comparePremiereManifests(before: PremiereProjectManifest, after: PremiereProjectManifest): DiffResult {
  let hasClipMetadata = false;
  let missingClipMetadata = false;

  for (const seq of after.sequences) {
    if (seq.clips) {
      hasClipMetadata = true;
    } else {
      missingClipMetadata = true;
    }
  }

  const confidence = hasClipMetadata && !missingClipMetadata
    ? "exact"
    : hasClipMetadata
    ? "high"
    : "best-effort";

  const result: DiffResult = {
    confidence,
    summary: [],
    groups: [],
    unsupported: []
  };

  const seqGroup: ChangeGroup = { title: "Sequences", items: [] };
  const vidGroup: ChangeGroup = { title: "Video timeline", items: [], clipChanges: [] };
  const audGroup: ChangeGroup = { title: "Audio timeline", items: [], clipChanges: [] };

  // 1. Check for removed sequences
  for (const oldSeq of before.sequences) {
    const newSeq = after.sequences.find(s => (oldSeq.id && s.id === oldSeq.id) || s.name === oldSeq.name);
    if (!newSeq) {
      seqGroup.items.push(`Removed sequence: ${oldSeq.name}`);
    }
  }

  // 2. Compare added and existing sequences
  for (const newSeq of after.sequences) {
    const oldSeq = before.sequences.find(s => (newSeq.id && s.id === newSeq.id) || s.name === newSeq.name);

    if (!oldSeq) {
      seqGroup.items.push(`Added sequence: ${newSeq.name}`);
      continue;
    }

    if (oldSeq.name !== newSeq.name) {
      seqGroup.items.push(`Renamed sequence from ${oldSeq.name} to ${newSeq.name}`);
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

    let addedVideoClips = 0;
    let addedAudioClips = 0;
    let removedVideoClips = 0;
    let removedAudioClips = 0;

    for (const newClip of newSeq.clips) {
      const oldClip = oldSeq.clips.find(c => c.stableFingerprint === newClip.stableFingerprint);
      const isVideo = newClip.trackType === "video";
      const group = isVideo ? vidGroup : audGroup;
      const clipTypeStr = isVideo ? "clip" : "audio clip";
      const trackPrefix = isVideo ? "V" : "A";

      if (!oldClip) {
        if (isVideo) addedVideoClips++; else addedAudioClips++;
        group.items.push(`Added ${clipTypeStr}: ${newClip.name}`);
        group.clipChanges?.push({
          type: "added",
          clipName: newClip.name,
          trackType: newClip.trackType,
          trackIndex: newClip.trackIndex,
          detail: `Added to ${trackPrefix}${newClip.trackIndex}`
        });
      } else {
        if (oldClip.trackIndex !== newClip.trackIndex || oldClip.trackType !== newClip.trackType) {
          const trackMsg = `Track changed for ${clipTypeStr}: ${newClip.name} (from track ${oldClip.trackIndex} to ${newClip.trackIndex})`;
          group.items.push(trackMsg);
          result.summary.push(`Track changed for ${clipTypeStr}: ${newClip.name}`);
          group.clipChanges?.push({
            type: "track-changed",
            clipName: newClip.name,
            trackType: newClip.trackType,
            trackIndex: newClip.trackIndex,
            oldTrackIndex: oldClip.trackIndex,
            detail: `Moved from ${trackPrefix}${oldClip.trackIndex} to ${trackPrefix}${newClip.trackIndex}`
          });
        } else if (oldClip.inTicks !== newClip.inTicks || oldClip.outTicks !== newClip.outTicks) {
          const msg = `Trimmed ${clipTypeStr}: ${newClip.name}`;
          group.items.push(msg);
          result.summary.push(msg);
          group.clipChanges?.push({
            type: "trimmed",
            clipName: newClip.name,
            trackType: newClip.trackType,
            trackIndex: newClip.trackIndex,
            detail: `Trimmed (In: ${ticksToTimecode(newClip.inTicks)}, Out: ${ticksToTimecode(newClip.outTicks)})`,
            oldTimecode: ticksToTimecode(oldClip.inTicks),
            newTimecode: ticksToTimecode(newClip.inTicks)
          });
        } else if (oldClip.startTicks !== newClip.startTicks || oldClip.endTicks !== newClip.endTicks) {
          const msg = `Moved ${clipTypeStr}: ${newClip.name}`;
          group.items.push(msg);
          result.summary.push(msg);
          group.clipChanges?.push({
            type: "moved",
            clipName: newClip.name,
            trackType: newClip.trackType,
            trackIndex: newClip.trackIndex,
            detail: `Moved on timeline (Start: ${ticksToTimecode(newClip.startTicks)})`,
            oldTimecode: ticksToTimecode(oldClip.startTicks),
            newTimecode: ticksToTimecode(newClip.startTicks)
          });
        }
      }
    }

    for (const oldClip of oldSeq.clips) {
      const newClip = newSeq.clips.find(c => c.stableFingerprint === oldClip.stableFingerprint);
      if (!newClip) {
        const isVideo = oldClip.trackType === "video";
        const group = isVideo ? vidGroup : audGroup;
        const clipTypeStr = isVideo ? "clip" : "audio clip";
        const trackPrefix = isVideo ? "V" : "A";
        if (isVideo) removedVideoClips++; else removedAudioClips++;
        group.items.push(`Removed ${clipTypeStr}: ${oldClip.name}`);
        group.clipChanges?.push({
          type: "removed",
          clipName: oldClip.name,
          trackType: oldClip.trackType,
          trackIndex: oldClip.trackIndex,
          detail: `Removed from ${trackPrefix}${oldClip.trackIndex}`
        });
      }
    }

    if (addedVideoClips > 0) {
      result.summary.push(`Added ${addedVideoClips} ${addedVideoClips === 1 ? "clip" : "clips"} to Sequence: ${newSeq.name}`);
    }
    if (addedAudioClips > 0) {
      result.summary.push(`Added ${addedAudioClips} audio ${addedAudioClips === 1 ? "clip" : "clips"} to Sequence: ${newSeq.name}`);
    }
    if (removedVideoClips > 0) {
      result.summary.push(`Removed ${removedVideoClips} ${removedVideoClips === 1 ? "clip" : "clips"} from Sequence: ${newSeq.name}`);
    }
    if (removedAudioClips > 0) {
      result.summary.push(`Removed ${removedAudioClips} audio ${removedAudioClips === 1 ? "clip" : "clips"} from Sequence: ${newSeq.name}`);
    }
  }

  if (seqGroup.items.length > 0) result.groups.push(seqGroup);
  if (vidGroup.items.length > 0) result.groups.push(vidGroup);
  if (audGroup.items.length > 0) result.groups.push(audGroup);

  return result;
}
