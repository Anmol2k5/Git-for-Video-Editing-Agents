import { DomainFile } from "../../core/types.js";

export function normalizePremiereTimeline(exportData: any): DomainFile[] {
  const domains: DomainFile[] = [
    { domain: "cuts", data: {} },
    { domain: "audio", data: {} },
    { domain: "effects", data: {} },
    { domain: "captions", data: {} },
    { domain: "color", data: {} },
    { domain: "markers", data: {} },
    { domain: "metadata", data: {} }
  ];

  if (!exportData || exportData.error) {
    return domains;
  }

  // Metadata Domain
  domains.find(d => d.domain === "metadata")!.data = {
    projectName: exportData.projectName,
    timelineName: exportData.sequenceName,
    frameRate: exportData.framerate
  };

  // Timeline Markers
  if (exportData.markers) {
    const markerDomain = domains.find(d => d.domain === "markers")!.data;
    exportData.markers.forEach((m: any) => {
      markerDomain[m.id] = m;
    });
  }

  // Iterate over video tracks
  if (exportData.videoTracks) {
    exportData.videoTracks.forEach((track: any) => {
      track.clips.forEach((item: any) => {
        domains.find(d => d.domain === "cuts")!.data[item.id] = {
          id: item.id,
          name: item.name,
          trackName: track.name,
          recordFrameStart: item.start,
          recordFrameEnd: item.end,
          sourceFrameStart: item.inPoint,
          sourceFrameEnd: item.outPoint,
        };
      });
    });
  }

  // Iterate over audio tracks
  if (exportData.audioTracks) {
    exportData.audioTracks.forEach((track: any) => {
      track.clips.forEach((item: any) => {
        domains.find(d => d.domain === "audio")!.data[item.id] = {
          id: item.id,
          name: item.name,
          trackName: track.name,
          recordFrameStart: item.start,
          recordFrameEnd: item.end,
          sourceFrameStart: item.inPoint,
          sourceFrameEnd: item.outPoint,
        };
      });
    });
  }

  return domains;
}

export function denormalizeToPremiereTimeline(domains: DomainFile[]): any {
  const metadata = domains.find(d => d.domain === "metadata")?.data || {};
  return {
    success: true,
    source: "editvcs-premiere-mock-denormalize",
    sequenceName: metadata.timelineName
  };
}
