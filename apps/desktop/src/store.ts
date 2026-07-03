import { create } from 'zustand';

export type ProjectVersion = {
  id: string;
  projectId: string;
  versionNumber: number;
  filename: string;
  contentHash: string;
  createdAt: string;
  checkpointType: "auto" | "manual" | "restore_backup";
  note?: string;
  isStable: boolean;
  syncStatus: "pending" | "uploading" | "synced" | "failed";
};

export type Project = {
  id: string;
  name: string;
  localProjectPath: string;
  latestVersionNumber: number;
  lastSyncedAt?: string;
};

interface AppState {
  projects: Project[];
  versions: Record<string, ProjectVersion[]>;
  currentProject: Project | null;
  setCurrentProject: (p: Project | null) => void;
  addProject: (p: Project) => void;
  addVersion: (projectId: string, v: ProjectVersion) => void;
  updateVersionStatus: (projectId: string, versionId: string, status: ProjectVersion["syncStatus"]) => void;
}

export const useStore = create<AppState>((set) => ({
  projects: [],
  versions: {},
  currentProject: null,
  setCurrentProject: (p) => set({ currentProject: p }),
  addProject: (p) => set((state) => ({ projects: [...state.projects, p] })),
  addVersion: (projectId, v) => set((state) => ({
    versions: {
      ...state.versions,
      [projectId]: [v, ...(state.versions[projectId] || [])]
    }
  })),
  updateVersionStatus: (projectId, versionId, status) => set((state) => {
    const projectVersions = state.versions[projectId] || [];
    return {
      versions: {
        ...state.versions,
        [projectId]: projectVersions.map(v => v.id === versionId ? { ...v, syncStatus: status } : v)
      }
    };
  })
}));
