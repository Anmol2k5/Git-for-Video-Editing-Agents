export interface MockPanelHostOptions {
  project?: any;
  tracked?: boolean;
  companionConnected?: boolean;
  capabilities?: {
    projectPath?: boolean;
    trackClipRead?: boolean;
  };
}

export function createMockPanelHost(opts: MockPanelHostOptions = {}) {
  return {
    project: opts.project === null ? null : (opts.project || { name: 'Film.prproj' }),
    tracked: opts.tracked ?? true,
    companionConnected: opts.companionConnected ?? true,
    capabilities: {
      projectPath: opts.capabilities?.projectPath ?? true,
      trackClipRead: opts.capabilities?.trackClipRead ?? true
    },
    snapshots: [
      {
        id: "snap_before_client",
        label: "Before client review",
        createdAt: "2026-07-05T12:00:00.000Z",
        streamName: "Main edit",
        cloudStatus: "local-only"
      },
      {
        id: "snap_latest",
        label: "Color pass complete",
        createdAt: "2026-07-05T13:00:00.000Z",
        streamName: "Main edit",
        cloudStatus: "local-only"
      }
    ],
    changes: {
      summary: ["Added 1 clip to Sequence: Main Edit"],
      unsupported: opts.capabilities?.trackClipRead === false
        ? ["Could not inspect clip-level changes in this Premiere version"]
        : []
    },
    streams: ["Main edit", "Client feedback", "Alternate intro", "Director's cut"]
  };
}
