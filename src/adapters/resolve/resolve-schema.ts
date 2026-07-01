/**
 * DaVinci Resolve Mock JSON Schema
 * 
 * Defines the structure of the mocked DaVinci Resolve timeline export.
 * In a production environment, this would map directly to the DaVinci Resolve
 * Scripting API (GetTimelineItemList, GetMarkers, etc.) or FCPXML.
 */

export interface ResolveTimeline {
  id: string;
  name: string;
  framerate: number;
  resolution: { width: number; height: number };
  tracks: ResolveTrack[];
  markers: ResolveMarker[];
}

export interface ResolveTrack {
  id: string;
  index: number;
  type: "video" | "audio" | "subtitle";
  name: string;
  clips: ResolveClip[];
}

export interface ResolveClip {
  id: string;
  name: string;
  type: "video" | "audio" | "generator" | "title";
  startFrame: number;
  endFrame: number;
  recordIn: number; // Timecode in on the timeline
  recordOut: number; // Timecode out on the timeline
  duration: number;
  
  // Domain specific properties
  audioConfig?: {
    volumeDb: number;
    pan: number;
    effects?: any[];
  };
  
  colorGrade?: {
    preset?: string;
    nodes: any[];
  };
  
  textConfig?: {
    content: string;
    font: string;
    size: number;
  };
  
  effects?: {
    id: string;
    name: string;
    parameters: Record<string, any>;
  }[];
}

export interface ResolveMarker {
  id: string;
  frameId: number;
  color: string;
  name: string;
  note: string;
}
