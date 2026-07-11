import type {
  HostAdapter,
  PremiereCapabilities,
  PremiereProjectManifest,
  ProjectIdentity,
  SnapshotContext
} from "@editvcs/shared-types";

type RequireModule = (name: string) => any;

interface PremiereUxpAdapterOptions {
  requireModule?: RequireModule;
}

interface PremiereProjectLike {
  guid?: string;
  name?: string;
  path?: string;
  getActiveSequence?: () => Promise<PremiereSequenceLike | null> | PremiereSequenceLike | null;
  getSequences?: () => Promise<PremiereSequenceLike[]> | PremiereSequenceLike[];
}

interface PremiereSequenceLike {
  guid?: string;
  id?: string;
  name?: string;
  duration?: { ticks?: string } | string;
  videoTracks?: PremiereTrackLike[];
  audioTracks?: PremiereTrackLike[];
}

interface PremiereTrackLike {
  clips?: PremiereClipLike[];
}

interface PremiereClipLike {
  guid?: string;
  id?: string;
  name?: string;
  start?: { ticks?: string } | string;
  end?: { ticks?: string } | string;
  inPoint?: { ticks?: string } | string;
  outPoint?: { ticks?: string } | string;
  projectItem?: {
    name?: string;
    getMediaFilePath?: () => string;
  };
}

const unavailableCapabilities: PremiereCapabilities = {
  projectPath: false,
  activeSequenceRead: false,
  sequenceInventoryRead: false,
  trackClipRead: false,
  mediaReferenceRead: false,
  saveEventHooks: false
};

export function createPremiereUxpAdapter(options: PremiereUxpAdapterOptions = {}): HostAdapter {
  const requireModule = options.requireModule ?? getGlobalRequire();

  function getPremiereApp() {
    try {
      return requireModule("premierepro");
    } catch {
      return null;
    }
  }

  async function getActiveProject(): Promise<PremiereProjectLike | null> {
    const app = getPremiereApp();
    if (!app?.Project?.getActiveProject) {
      return null;
    }

    return await app.Project.getActiveProject();
  }

  return {
    host: "premiere",

    async getCapabilities(): Promise<PremiereCapabilities> {
      const project = await getActiveProject();
      if (!project) {
        return unavailableCapabilities;
      }

      return {
        projectPath: Boolean(project.path),
        activeSequenceRead: typeof project.getActiveSequence === "function",
        sequenceInventoryRead: typeof project.getSequences === "function",
        trackClipRead: true,
        mediaReferenceRead: true,
        saveEventHooks: false
      };
    },

    async getCurrentProject(): Promise<ProjectIdentity | null> {
      const project = await getActiveProject();
      if (!project) {
        return null;
      }

      const pathHint = project.path ?? project.name ?? "Unsaved Premiere project";
      return {
        host: "premiere",
        projectId: project.guid ?? createFallbackProjectId(pathHint),
        name: project.name ?? basename(pathHint),
        path: project.path,
        pathHint,
        extension: ".prproj"
      };
    },

    async collectManifest(): Promise<PremiereProjectManifest> {
      const app = getPremiereApp();
      const project = await getActiveProject();
      if (!project) {
        return {
          projectName: "No Premiere project",
          projectPathHint: "No active project",
          capturedAt: new Date().toISOString(),
          sequences: []
        };
      }

      const sequences = await readSequences(project);
      return {
        projectName: project.name ?? basename(project.path ?? "Premiere project"),
        projectPathHint: project.path ?? project.name ?? "Unsaved Premiere project",
        capturedAt: new Date().toISOString(),
        appVersion: app?.appVersion ?? app?.version,
        sequences: sequences.map(toManifestSequence)
      };
    },

    async createSnapshotContext(): Promise<SnapshotContext> {
      const project = await this.getCurrentProject();
      if (!project) {
        throw new Error("Open a Premiere project to create a save point.");
      }

      return {
        project,
        fullProjectPath: project.path,
        manifest: await this.collectManifest()
      };
    },

    async revealProjectLocation(): Promise<void> {
      const project = await this.getCurrentProject();
      if (!project?.path) {
        throw new Error("Project file location is unavailable in this Premiere version.");
      }
    }
  };
}

export async function createPremierePanelHost(options: PremiereUxpAdapterOptions = {}) {
  const adapter = createPremiereUxpAdapter(options);
  const [project, capabilities, projectManifest] = await Promise.all([
    adapter.getCurrentProject(),
    adapter.getCapabilities(),
    adapter.collectManifest()
  ]);
  const manifest = projectManifest as PremiereProjectManifest;

  return {
    project,
    tracked: Boolean(project?.path),
    companionConnected: true,
    capabilities,
    snapshots: [],
    changes: {
      summary: manifest.sequences.length > 0
        ? [`Read ${manifest.sequences.length} sequence${manifest.sequences.length === 1 ? "" : "s"} from Premiere`]
        : [],
      unsupported: capabilities.trackClipRead
        ? []
        : ["Could not inspect clip-level changes in this Premiere version"]
    },
    streams: ["Main edit", "Client feedback", "Alternate intro", "Director's cut"]
  };
}

async function readSequences(project: PremiereProjectLike): Promise<PremiereSequenceLike[]> {
  if (typeof project.getSequences === "function") {
    return await project.getSequences();
  }

  if (typeof project.getActiveSequence === "function") {
    const activeSequence = await project.getActiveSequence();
    return activeSequence ? [activeSequence] : [];
  }

  return [];
}

function toManifestSequence(sequence: PremiereSequenceLike) {
  const videoTracks = sequence.videoTracks ?? [];
  const audioTracks = sequence.audioTracks ?? [];

  return {
    id: sequence.guid ?? sequence.id,
    name: sequence.name ?? "Untitled sequence",
    durationTicks: ticksOf(sequence.duration),
    videoTrackCount: videoTracks.length,
    audioTrackCount: audioTracks.length,
    clips: [
      ...clipsForTracks(videoTracks, "video" as const),
      ...clipsForTracks(audioTracks, "audio" as const)
    ]
  };
}

function clipsForTracks(tracks: PremiereTrackLike[], trackType: "video" | "audio") {
  return tracks.flatMap((track, trackIndex) => {
    const clips = track.clips ?? [];
    return clips.map((clip, clipIndex) => {
      const sourcePath = clip.projectItem?.getMediaFilePath?.();
      const name = clip.name ?? clip.projectItem?.name ?? `Clip ${clipIndex + 1}`;

      return {
        stableFingerprint: clip.guid ?? clip.id ?? `${trackType}_${trackIndex}_${clipIndex}_${name}`,
        name,
        trackType,
        trackIndex,
        startTicks: ticksOf(clip.start),
        endTicks: ticksOf(clip.end),
        inTicks: ticksOf(clip.inPoint),
        outTicks: ticksOf(clip.outPoint),
        sourcePathHint: sourcePath ? basename(sourcePath) : undefined
      };
    });
  });
}

function ticksOf(value: { ticks?: string } | string | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return value?.ticks;
}

function basename(input: string): string {
  return input.split(/[\\/]/).filter(Boolean).at(-1) ?? input;
}

function createFallbackProjectId(pathHint: string): string {
  let hash = 0;
  for (const char of pathHint) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }

  return `proj_${Math.abs(hash).toString(16).padStart(8, "0")}`;
}

function getGlobalRequire(): RequireModule {
  const maybeRequire = (globalThis as unknown as { require?: RequireModule }).require;
  if (!maybeRequire) {
    return () => {
      throw new Error("Premiere UXP require() is unavailable.");
    };
  }

  return maybeRequire;
}
