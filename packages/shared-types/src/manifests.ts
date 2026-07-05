export interface PremiereProjectManifest {
  projectName: string;
  projectPathHint: string;
  capturedAt: string;
  appVersion?: string;
  sequences: Array<{
    id?: string;
    name: string;
    durationTicks?: string;
    videoTrackCount?: number;
    audioTrackCount?: number;
    clips?: Array<{
      stableFingerprint: string;
      name: string;
      trackType: "video" | "audio";
      trackIndex: number;
      startTicks?: string;
      endTicks?: string;
      inTicks?: string;
      outTicks?: string;
      sourcePathHint?: string;
    }>;
  }>;
  projectItems?: Array<{
    name: string;
    type?: string;
    sourcePathHint?: string;
  }>;
}

export interface AfterEffectsProjectManifest {
  projectName: string;
  projectPathHint: string;
  capturedAt: string;
  compositions: Array<{
    id?: string;
    name: string;
    width?: number;
    height?: number;
    duration?: number;
    frameRate?: number;
    layers: Array<{
      id?: string;
      name: string;
      index: number;
      type?: string;
      inPoint?: number;
      outPoint?: number;
      startTime?: number;
      enabled?: boolean;
      locked?: boolean;
      parentName?: string;
      sourceName?: string;
      effects?: Array<{ name: string; enabled?: boolean }>;
      expressions?: Array<{ property: string; expression: string }>;
      keyframeSummary?: Array<{
        property: string;
        keyframeCount: number;
      }>;
    }>;
  }>;
  footage?: Array<{
    name: string;
    pathHint?: string;
    proxyEnabled?: boolean;
  }>;
}
