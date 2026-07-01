import { LiveResolveExport, LiveResolveTrack, LiveResolveClip, LiveResolveMarker } from "./resolve-schema.js";
import { DomainFile } from "../../core/types.js";

/**
 * Splits a monolithic live DaVinci Resolve JSON export into first-class domain files.
 */
export function normalizeResolveTimeline(exportData: LiveResolveExport): DomainFile[] {
  const domains: DomainFile[] = [
    { domain: "cuts", data: {} },
    { domain: "audio", data: {} },
    { domain: "effects", data: {} },
    { domain: "captions", data: {} },
    { domain: "color", data: {} },
    { domain: "markers", data: {} },
    { domain: "metadata", data: {} }
  ];

  if (!exportData.timeline) return domains;

  const tl = exportData.timeline;

  // Metadata Domain
  domains.find(d => d.domain === "metadata")!.data = {
    projectId: exportData.project?.id,
    projectName: exportData.project?.name,
    timelineId: tl.id,
    timelineName: tl.name,
    frameRate: tl.frameRate,
    startFrame: tl.startFrame,
    startTimecode: tl.startTimecode,
    durationFrames: tl.durationFrames,
    resolveVersion: exportData.resolveVersion
  };

  // Timeline Markers
  if (tl.markers) {
    const markerDomain = domains.find(d => d.domain === "markers")!.data;
    tl.markers.forEach(m => {
      markerDomain[m.id || `marker_${m.frameId}`] = m;
    });
  }

  // Iterate over tracks and items
  if (tl.tracks) {
    tl.tracks.forEach(track => {
      track.items.forEach(item => {
        
        // Map to domains based on track type
        if (track.type === "video") {
          domains.find(d => d.domain === "cuts")!.data[item.id] = {
            id: item.id,
            name: item.name,
            trackName: track.name,
            trackIndex: track.trackIndex,
            recordFrameStart: item.recordFrameStart,
            recordFrameEnd: item.recordFrameEnd,
            sourceFrameStart: item.sourceFrameStart,
            sourceFrameEnd: item.sourceFrameEnd,
            enabled: item.enabled
          };

          if (item.properties && item.properties.color) {
             domains.find(d => d.domain === "color")!.data[item.id] = {
                clipId: item.id,
                clipName: item.name,
                color: item.properties.color
             };
          }

        } else if (track.type === "audio") {
          domains.find(d => d.domain === "audio")!.data[item.id] = {
            id: item.id,
            name: item.name,
            trackName: track.name,
            trackIndex: track.trackIndex,
            recordFrameStart: item.recordFrameStart,
            recordFrameEnd: item.recordFrameEnd,
            sourceFrameStart: item.sourceFrameStart,
            sourceFrameEnd: item.sourceFrameEnd,
            enabled: item.enabled,
            audioConfig: item.properties || {}
          };
        } else if (track.type === "subtitle") {
          domains.find(d => d.domain === "captions")!.data[item.id] = {
            id: item.id,
            name: item.name,
            trackName: track.name,
            trackIndex: track.trackIndex,
            recordFrameStart: item.recordFrameStart,
            recordFrameEnd: item.recordFrameEnd,
            enabled: item.enabled
          };
        }

        // Clip-level Markers (mapped globally but bound to frameId/clip)
        if (item.markers && item.markers.length > 0) {
          const markerDomain = domains.find(d => d.domain === "markers")!.data;
          item.markers.forEach(m => {
             const mId = m.id || `${item.id}_m_${m.frameId}`;
             markerDomain[mId] = {
               ...m,
               clipId: item.id,
               clipName: item.name
             };
          });
        }
      });
    });
  }

  return domains;
}

/**
 * For Phase 1 (Read-Only), denormalization is not fully implemented for write-back.
 * This function exists for mock compatibility but will not generate a full live JSON 
 * capable of round-tripping into Resolve until Phase 2.
 */
export function denormalizeToResolveTimeline(domains: DomainFile[]): any {
  const metadata = domains.find(d => d.domain === "metadata")?.data || {};
  return {
    success: true,
    source: "editvcs-mock-denormalize",
    timeline: {
       id: metadata.timelineId,
       name: metadata.timelineName
       // (Partial reconstruction)
    }
  };
}
