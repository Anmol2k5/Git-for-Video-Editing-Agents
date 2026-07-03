import { TimelineChange, EntityType, TimelineOperation } from "../../core/types.js";
import * as crypto from "crypto";

function framesToTimecode(frames: number, fps: number = 24): string {
  const f = Math.floor(frames % fps);
  const s = Math.floor((frames / fps) % 60);
  const m = Math.floor((frames / (fps * 60)) % 60);
  const h = Math.floor(frames / (fps * 3600));
  
  const pad = (num: number) => num.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

export function resolveDiffer(domain: string, oldData: Record<string, any>, newData: Record<string, any>): TimelineChange[] {
  const changes: TimelineChange[] = [];
  const fps = 24; 

  const oldKeys = new Set(Object.keys(oldData));
  const newKeys = new Set(Object.keys(newData));

  // Additions
  for (const id of newKeys) {
    if (!oldKeys.has(id)) {
      const item = newData[id];
      const type = getEntityType(domain, item);
      changes.push({
        id: crypto.randomUUID(),
        domain,
        operation: "add",
        entityType: type,
        entityId: id,
        before: null,
        after: item,
        humanReadableSummary: generateAddSummary(domain, type, item, fps),
        timecodeStart: item.recordFrameStart !== undefined ? framesToTimecode(item.recordFrameStart, fps) : undefined,
        timecodeEnd: item.recordFrameEnd !== undefined ? framesToTimecode(item.recordFrameEnd, fps) : undefined,
        affectedTrack: item.trackName
      });
    }
  }

  // Deletions
  for (const id of oldKeys) {
    if (!newKeys.has(id)) {
      const item = oldData[id];
      const type = getEntityType(domain, item);
      changes.push({
        id: crypto.randomUUID(),
        domain,
        operation: "remove",
        entityType: type,
        entityId: id,
        before: item,
        after: null,
        humanReadableSummary: generateRemoveSummary(domain, type, item, fps),
        timecodeStart: item.recordFrameStart !== undefined ? framesToTimecode(item.recordFrameStart, fps) : undefined,
        timecodeEnd: item.recordFrameEnd !== undefined ? framesToTimecode(item.recordFrameEnd, fps) : undefined,
        affectedTrack: item.trackName
      });
    }
  }

  // Modifications
  for (const id of newKeys) {
    if (oldKeys.has(id)) {
      const oldItem = oldData[id];
      const newItem = newData[id];
      const type = getEntityType(domain, newItem);

      if (JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
        const summary = generateUpdateSummary(domain, type, oldItem, newItem, fps);
        
        let operation: TimelineOperation = "update";
        if (type === "clip" || type === "audio_clip") {
            if (oldItem.name !== newItem.name) operation = "replace";
            else if (oldItem.recordFrameStart !== newItem.recordFrameStart && 
                     (oldItem.recordFrameEnd - oldItem.recordFrameStart) === (newItem.recordFrameEnd - newItem.recordFrameStart)) {
                operation = "move";
            }
        }

        changes.push({
          id: crypto.randomUUID(),
          domain,
          operation,
          entityType: type,
          entityId: id,
          before: oldItem,
          after: newItem,
          humanReadableSummary: summary,
          timecodeStart: newItem.recordFrameStart !== undefined ? framesToTimecode(newItem.recordFrameStart, fps) : undefined,
          timecodeEnd: newItem.recordFrameEnd !== undefined ? framesToTimecode(newItem.recordFrameEnd, fps) : undefined,
          affectedTrack: newItem.trackName
        });
      }
    }
  }

  return changes;
}

function getEntityType(domain: string, item: any): EntityType {
  if (domain === "cuts") return "clip";
  if (domain === "audio") return "audio_clip";
  if (domain === "effects") return "effect";
  if (domain === "captions") return "caption";
  if (domain === "color") return "color_grade";
  if (domain === "markers") return "marker";
  return "metadata";
}

function generateAddSummary(domain: string, type: EntityType, item: any, fps: number): string {
  if (type === "marker") {
      return `Added marker at ${item.frameId}: '${item.note || item.name}'`;
  }
  if (type === "caption") return `Added caption: '${item.textConfig?.content || item.name}'.`;
  if (type === "effect") return `Added effect '${item.effectType || item.name}' to ${item.trackName || "timeline"}.`;
  if (type === "color_grade") return `Added color grade to '${item.clipName || item.name || item.id}'.`;
  return `Added ${type.replace("_", " ")} '${item.name || item.id}' to ${item.trackName || "timeline"}.`;
}

function generateRemoveSummary(domain: string, type: EntityType, item: any, fps: number): string {
  if (type === "marker") {
      return `Removed marker at ${item.frameId}: '${item.note || item.name}'`;
  }
  if (type === "caption") return `Removed caption: '${item.textConfig?.content || item.name}'.`;
  if (type === "effect") return `Removed effect '${item.effectType || item.name}' from ${item.trackName || "timeline"}.`;
  if (type === "color_grade") return `Removed color grade from '${item.clipName || item.name || item.id}'.`;
  return `Removed ${type.replace("_", " ")} '${item.name || item.id}' from ${item.trackName || "timeline"}.`;
}

function generateUpdateSummary(domain: string, type: EntityType, oldItem: any, newItem: any, fps: number): string {
  if (type === "marker") {
      return `Updated marker at ${newItem.frameId}: '${newItem.note || newItem.name}'`;
  }

  if (type === "clip" || type === "audio_clip") {
    // Enabled/disabled
    if (oldItem.enabled !== newItem.enabled) {
      return `${newItem.enabled ? 'Enabled' : 'Disabled'} '${newItem.name}'.`;
    }

    // Replacement
    if (oldItem.name !== newItem.name) {
      return `Replaced '${oldItem.name}' with '${newItem.name}'.`;
    }
    
    // Trim
    if ((oldItem.recordFrameEnd - oldItem.recordFrameStart) !== (newItem.recordFrameEnd - newItem.recordFrameStart)) {
      const oldDur = oldItem.recordFrameEnd - oldItem.recordFrameStart;
      const newDur = newItem.recordFrameEnd - newItem.recordFrameStart;
      const diffFrames = Math.abs(oldDur - newDur);
      const action = newDur < oldDur ? "Trimmed" : "Extended";
      // "Trimmed Interview_A_03 by 42 frames at the end." (simplified)
      return `${action} '${newItem.name}' by ${diffFrames} frames.`;
    }
    
    // Move
    if (oldItem.recordFrameStart !== newItem.recordFrameStart) {
      const diffFrames = newItem.recordFrameStart - oldItem.recordFrameStart;
      const direction = diffFrames > 0 ? "later" : "earlier";
      return `Moved '${newItem.name}' ${Math.abs(diffFrames)} frames ${direction} on ${newItem.trackName || 'track'}.`;
    }
  }

  if (type === "audio_clip" && oldItem.audioConfig && newItem.audioConfig) {
    if (oldItem.audioConfig.volumeDb !== newItem.audioConfig.volumeDb) {
      return `Changed audio gain from ${oldItem.audioConfig.volumeDb} dB to ${newItem.audioConfig.volumeDb} dB for '${newItem.name}'.`;
    }
  }

  if (type === "caption") {
    if (oldItem.textConfig?.content !== newItem.textConfig?.content) {
      return `Updated caption text to '${newItem.textConfig?.content || newItem.name}'.`;
    }
  }

  if (type === "effect") {
    if (oldItem.effectType !== newItem.effectType) {
      return `Changed effect from '${oldItem.effectType}' to '${newItem.effectType}' for '${newItem.name || newItem.id}'.`;
    }
    return `Updated effect parameters for '${newItem.effectType || newItem.name || newItem.id}'.`;
  }

  if (type === "color_grade") {
    return `Adjusted color grade for '${newItem.clipName || newItem.name || newItem.id}'.`;
  }

  return `Updated ${type.replace("_", " ")} properties for '${newItem.name || newItem.id}'.`;
}
