EditVCS Premiere MVP Implementation Plan
For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

Goal: Build a working local-first Premiere Pro MVP for EditVCS: manual save points, local history, manifest-aware changes, automatic snapshots, safe restore-as-copy, simple version streams, and documented After Effects extension points.
Architecture: Add an EditVCS monorepo surface beside the current Vike/React app instead of moving the existing creator-pricing site during the MVP. Put reusable versioning, storage, diffing, and host contracts in packages/; put the Premiere panel and companion service in apps/; keep cloud support behind a mockable adapter. Restore always writes a new copy and never overwrites the active project file.
Tech Stack: TypeScript, npm workspaces, Vitest, React, Vite, Tailwind/shadcn conventions where UI is web-rendered, Node.js companion service, chokidar for file watching, localhost HTTP with bearer-token auth, SHA-256 content-addressed local storage.
Prior-Art Decisions
nzalexgarciagil-ctrl/rewind-sdk is useful for Premiere host bridging, .prproj gzip/XML handling, Git-backed history concepts, and UI states. Do not copy its restore behavior because it writes back to the active .prproj path.
LucasHJin/vit is useful for manifest-first timeline metadata and honest host API limitation docs. Do not copy Resolve-specific assumptions or Git/merge language into primary UI.
EditVCS primary UI language must use "save point", "version stream", "restore as copy", "changes", "cloud backup", and "latest saved version".
Phase 1 must not require Premiere in CI; tests use mock host adapters and sample project files.
Target File Structure
Create docs/architecture.md - system architecture and data flow.
Create docs/premiere-capabilities.md - capability matrix and unsupported states.
Create docs/storage-format.md - .editvcs layout and snapshot/object manifest schema.
Create docs/security-and-privacy.md - loopback auth, local-only default, path privacy.
Create docs/phase-2-after-effects.md - After Effects adapter plan and feature flag boundary.
Create docs/known-limitations.md - product limits in user language.
Modify README.md - replace Lovable default with EditVCS setup and troubleshooting.
Modify package.json - add npm workspace scripts without removing current app scripts.
Create packages/shared-types/ - host, snapshot, manifest, stream, cloud, and API contracts.
Create packages/core/ - snapshot IDs, stream ancestry, restore naming, project IDs, product language helpers.
Create packages/storage/ - local .editvcs repository, object store, deduplication, privacy-safe path helpers.
Create packages/diff-engine/ - manifest comparison and editor-friendly change summaries.
Create packages/host-adapters/ - Premiere and After Effects adapter contracts plus mocks.
Create apps/companion-service/ - authenticated loopback API, file watcher, stable-write detector, snapshot orchestration, restore-copy creation, cloud queue.
Create apps/premiere-plugin/ - Premiere panel UI, capability-aware states, save-point modal, history, compare view, restore flow, companion connection state.
Create tests/fixtures/ - sample project files and manifests shared by integration tests.
Implementation Tasks
Task 1: Repository Preparation and Architecture Record
Files:
Modify: package.json

Create: docs/architecture.md

Create: docs/premiere-capabilities.md

Create: docs/storage-format.md

Create: docs/security-and-privacy.md

Create: docs/phase-2-after-effects.md

Create: docs/known-limitations.md


Step 1: Add npm workspace declarations while preserving existing scripts

Edit package.json so the top-level object includes:
{
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "vike dev",
    "build": "vike build",
    "build:dev": "vike build --mode development",
    "lint": "eslint .",
    "preview": "vike preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "editvcs:test": "npm run test --workspaces --if-present",
    "editvcs:build": "npm run build --workspaces --if-present",
    "editvcs:companion": "npm --workspace apps/companion-service run dev",
    "editvcs:premiere": "npm --workspace apps/premiere-plugin run dev"
  }
}
Keep all current dependencies and devDependencies unless a later task has a tested reason to move them.

Step 2: Write the architecture document
Create docs/architecture.md with these sections:
# EditVCS Architecture

EditVCS is a local-first version history tool for professional video editors. Phase 1 supports Adobe Premiere Pro through a panel UI and a local companion service. The product versions project files and privacy-safe structured metadata; it does not upload source media by default.

## Components

- Premiere panel: shows project state, save points, changes, restore-as-copy, version streams, cloud backup state, and unsupported capability states.
- Companion service: owns filesystem access, hashing, stable-write detection, local storage, restore-copy creation, and optional cloud queueing.
- Shared packages: define host contracts, snapshot data, manifest types, storage adapters, diff summaries, and stream ancestry.
- Local storage: stores content-addressed project objects and manifests in `.editvcs` beside the project when writable, otherwise in the user application-data fallback.

## Safety Rules

- Restore creates a new project copy and never overwrites the active project file.
- Deletion requires explicit user confirmation.
- Cloud backup is opt-in and never uploads footage by default.
- Unsupported host capabilities render honest unavailable states.
- Premiere and After Effects project files are not automatically merged.

## Data Flow

1. The panel asks the host adapter for the current project and capabilities.
2. The panel pairs with the companion service over localhost using a bearer token.
3. Manual or automatic save points send a snapshot request to the companion.
4. The companion waits for a stable project file, hashes it, deduplicates content, stores an object and manifest, and returns a snapshot record.
5. Compare requests read two manifests and return editor-friendly change groups.
6. Restore requests create a new `.prproj` copy at a user-selected destination.

Step 3: Write capability and limitation docs
Create docs/premiere-capabilities.md with the exact PremiereCapabilities keys from the product brief and a table explaining each UI fallback. Create docs/known-limitations.md with these user-facing limits:
# Known Limitations

- EditVCS does not back up media files, proxies, renders, or caches by default.
- Restore creates a separate project copy; replacing the active project is intentionally unsupported.
- Automatic merge is not supported for Premiere Pro or After Effects project files.
- Change details depend on what the Adobe host API can read safely.
- Effect-level and some timeline-level details may be unavailable in some Premiere versions.
- Cloud backup is optional and only syncs project snapshots and manifests unless the user explicitly chooses otherwise.

Step 4: Run baseline checks
Run:
npm test
npm run lint
Expected: existing tests and lint either pass, or failures are recorded before EditVCS implementation begins.

Step 5: Commit
git add package.json docs/architecture.md docs/premiere-capabilities.md docs/storage-format.md docs/security-and-privacy.md docs/phase-2-after-effects.md docs/known-limitations.md
git commit -m "docs: add EditVCS architecture plan"
Task 2: Shared Type Contracts
Files:
Create: packages/shared-types/package.json

Create: packages/shared-types/tsconfig.json

Create: packages/shared-types/src/index.ts

Create: packages/shared-types/src/hosts.ts

Create: packages/shared-types/src/manifests.ts

Create: packages/shared-types/src/snapshots.ts

Create: packages/shared-types/src/streams.ts

Create: packages/shared-types/src/cloud.ts

Test: packages/shared-types/src/contracts.test.ts


Step 1: Create the package manifest

Create packages/shared-types/package.json:
{
  "name": "@editvcs/shared-types",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}

Step 2: Define host contracts
Create packages/shared-types/src/hosts.ts:
import type { AfterEffectsProjectManifest, PremiereProjectManifest } from "./manifests";

export type HostName = "premiere" | "after-effects";

export interface HostCapabilities {
  projectPath: boolean;
  activeSequenceRead?: boolean;
  sequenceInventoryRead?: boolean;
  trackClipRead?: boolean;
  mediaReferenceRead?: boolean;
  saveEventHooks?: boolean;
  compositionInventoryRead?: boolean;
  layerRead?: boolean;
  effectRead?: boolean;
  expressionRead?: boolean;
}

export interface PremiereCapabilities extends HostCapabilities {
  projectPath: boolean;
  activeSequenceRead: boolean;
  sequenceInventoryRead: boolean;
  trackClipRead: boolean;
  mediaReferenceRead: boolean;
  saveEventHooks: boolean;
}

export interface ProjectIdentity {
  host: HostName;
  projectId: string;
  name: string;
  path?: string;
  pathHint: string;
  extension: ".prproj" | ".aep" | ".aepx";
}

export interface SnapshotContext {
  project: ProjectIdentity;
  fullProjectPath?: string;
  manifest: ProjectManifest;
}

export interface HostAdapter {
  host: HostName;
  getCapabilities(): Promise<HostCapabilities>;
  getCurrentProject(): Promise<ProjectIdentity | null>;
  collectManifest(): Promise<ProjectManifest>;
  createSnapshotContext(): Promise<SnapshotContext>;
  revealProjectLocation(): Promise<void>;
}

export type ProjectManifest = PremiereProjectManifest | AfterEffectsProjectManifest;

Step 3: Define manifest types
Create packages/shared-types/src/manifests.ts:
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

Step 4: Define snapshot, stream, and cloud contracts
Create packages/shared-types/src/snapshots.ts with the brief's Snapshot shape, plus:
import type { PremiereProjectManifest } from "./manifests";

export type SnapshotTrigger = "manual" | "automatic" | "before-restore" | "cloud-pull";
export type CloudStatus = "local-only" | "queued" | "synced" | "failed";

export interface Snapshot {
  id: string;
  projectId: string;
  parentSnapshotId?: string;
  streamId: string;
  createdAt: string;
  createdBy: "local-user" | string;
  trigger: SnapshotTrigger;
  label?: string;
  note?: string;
  projectFile: {
    originalFileName: string;
    sourceExtension: ".prproj";
    sha256: string;
    byteSize: number;
    objectPath: string;
  };
  manifest: PremiereProjectManifest;
  cloudStatus: CloudStatus;
}
Create packages/shared-types/src/streams.ts:
export interface VersionStream {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  baseSnapshotId?: string;
  currentSnapshotId?: string;
}
Create packages/shared-types/src/cloud.ts:
import type { Snapshot } from "./snapshots";

export interface RemoteStorageProvider {
  uploadSnapshot(snapshot: Snapshot): Promise<void>;
  listSnapshots(projectId: string): Promise<Snapshot[]>;
  downloadSnapshot(snapshotId: string): Promise<Buffer>;
}
Create packages/shared-types/src/index.ts:
export * from "./cloud";
export * from "./hosts";
export * from "./manifests";
export * from "./snapshots";
export * from "./streams";

Step 5: Test public exports
Create packages/shared-types/src/contracts.test.ts:
import { describe, expect, it } from "vitest";
import type { PremiereCapabilities, RemoteStorageProvider, Snapshot } from "./index";

describe("shared contracts", () => {
  it("represents Premiere capability detection explicitly", () => {
    const capabilities: PremiereCapabilities = {
      projectPath: true,
      activeSequenceRead: true,
      sequenceInventoryRead: true,
      trackClipRead: false,
      mediaReferenceRead: false,
      saveEventHooks: false
    };

    expect(capabilities.trackClipRead).toBe(false);
  });

  it("keeps cloud backup behind a provider interface", async () => {
    const uploaded: string[] = [];
    const provider: RemoteStorageProvider = {
      async uploadSnapshot(snapshot: Snapshot) {
        uploaded.push(snapshot.id);
      },
      async listSnapshots() {
        return [];
      },
      async downloadSnapshot() {
        return Buffer.from("project");
      }
    };

    await provider.uploadSnapshot({ id: "snap_1" } as Snapshot);
    expect(uploaded).toEqual(["snap_1"]);
  });
});

Step 6: Run and commit
Run:
npm --workspace packages/shared-types test
npm --workspace packages/shared-types run build
Commit:
git add packages/shared-types
git commit -m "feat: add EditVCS shared contracts"
Task 3: Core Snapshot and Stream Utilities
Files:
Create: packages/core/package.json

Create: packages/core/tsconfig.json

Create: packages/core/src/index.ts

Create: packages/core/src/ids.ts

Create: packages/core/src/restore-names.ts

Create: packages/core/src/streams.ts

Create: packages/core/src/product-language.ts

Test: packages/core/src/core.test.ts


Step 1: Write failing tests

Create packages/core/src/core.test.ts:
import { describe, expect, it } from "vitest";
import { createProjectId, createSnapshotId, createRestoreFileName, createStream, canShowMergeLanguage } from "./index";

describe("core utilities", () => {
  it("creates stable project IDs from host and path hint", () => {
    expect(createProjectId("premiere", "D:/work/Film.prproj")).toMatch(/^proj_[a-f0-9]{16}$/);
    expect(createProjectId("premiere", "D:/work/Film.prproj")).toBe(createProjectId("premiere", "D:/work/Film.prproj"));
  });

  it("creates snapshot IDs with time and hash material", () => {
    expect(createSnapshotId("proj_abc", "2026-07-05T12:00:00.000Z", "a".repeat(64))).toBe("snap_20260705T120000_aaaaaaaaaaaa");
  });

  it("creates restore-as-copy file names", () => {
    expect(createRestoreFileName("YouTube Video Final.prproj", "Client feedback applied", "2026-07-05T18:41:00.000Z")).toBe("YouTube Video Final_restored_Client_feedback_applied_2026-07-05.prproj");
  });

  it("creates user-facing version streams", () => {
    expect(createStream("proj_1", "Client feedback", "snap_1")).toMatchObject({
      projectId: "proj_1",
      name: "Client feedback",
      baseSnapshotId: "snap_1"
    });
  });

  it("never allows merge language in Phase 1 UI", () => {
    expect(canShowMergeLanguage()).toBe(false);
  });
});

Step 2: Implement core functions
Create packages/core/src/ids.ts:
import { createHash } from "node:crypto";
import type { HostName } from "@editvcs/shared-types";

export function createProjectId(host: HostName, pathHint: string): string {
  const digest = createHash("sha256").update(`${host}:${pathHint}`).digest("hex").slice(0, 16);
  return `proj_${digest}`;
}

export function createSnapshotId(projectId: string, createdAt: string, sha256: string): string {
  const compactDate = createdAt.replace(/[-:]/g, "").replace(".000Z", "").replace("Z", "");
  return `snap_${compactDate}_${sha256.slice(0, 12)}`;
}
Create packages/core/src/restore-names.ts:
import path from "node:path";

export function createRestoreFileName(originalFileName: string, label: string, createdAt: string): string {
  const parsed = path.parse(originalFileName);
  const safeLabel = label.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "Save_point";
  const date = createdAt.slice(0, 10);
  return `${parsed.name}_restored_${safeLabel}_${date}${parsed.ext}`;
}
Create packages/core/src/streams.ts:
import type { VersionStream } from "@editvcs/shared-types";

export function createStream(projectId: string, name: string, baseSnapshotId?: string): VersionStream {
  return {
    id: `stream_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "untitled"}_${Date.now()}`,
    projectId,
    name,
    baseSnapshotId,
    createdAt: new Date().toISOString(),
    currentSnapshotId: baseSnapshotId
  };
}

export function describeStreamRelationship(input: { sameStream: boolean }) {
  if (input.sameStream) {
    return {
      title: "Same version stream",
      body: "These save points are part of the same edit history."
    };
  }

  return {
    title: "These edits were made separately.",
    body: "You can restore either version as a copy and manually combine the changes in Premiere."
  };
}
Create packages/core/src/product-language.ts:
export function canShowMergeLanguage(): false {
  return false;
}

export const productTerms = {
  savePoint: "Save point",
  versionStream: "Version stream",
  restoreAsCopy: "Restore as Copy",
  changes: "Changes",
  cloudBackup: "Cloud Backup",
  latestSavedVersion: "Latest saved version"
} as const;
Create packages/core/src/index.ts:
export * from "./ids";
export * from "./product-language";
export * from "./restore-names";
export * from "./streams";

Step 3: Run and commit
Run:
npm --workspace packages/core test
npm --workspace packages/core run build
Commit:
git add packages/core
git commit -m "feat: add EditVCS core utilities"
Task 4: Local Storage and Deduplication
Files:
Create: packages/storage/package.json

Create: packages/storage/tsconfig.json

Create: packages/storage/src/index.ts

Create: packages/storage/src/hash-file.ts

Create: packages/storage/src/path-privacy.ts

Create: packages/storage/src/local-repository.ts

Create: packages/storage/src/write-json.ts

Test: packages/storage/src/storage.test.ts


Step 1: Write storage tests

Create tests that prove:
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashFileSha256, LocalSnapshotRepository, sanitizePathHint } from "./index";

describe("local storage", () => {
  it("hashes file contents with SHA-256", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-"));
    const file = path.join(dir, "sample.prproj");
    await writeFile(file, "project-v1");
    expect(await hashFileSha256(file)).toHaveLength(64);
  });

  it("deduplicates identical project objects", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-"));
    const project = path.join(dir, "sample.prproj");
    await writeFile(project, "same-content");
    const repo = new LocalSnapshotRepository(path.join(dir, ".editvcs"));

    const first = await repo.storeProjectObject(project);
    const second = await repo.storeProjectObject(project);

    expect(first.sha256).toBe(second.sha256);
    expect(first.objectPath).toBe(second.objectPath);
    await expect(readFile(first.objectPath, "utf8")).resolves.toBe("same-content");
  });

  it("removes private drive and user folder details from path hints", () => {
    expect(sanitizePathHint("C:/Users/Mayur/Client/Film.prproj")).toBe(".../Client/Film.prproj");
  });
});

Step 2: Implement local repository
Implement LocalSnapshotRepository so it creates:
.editvcs/
  config.json
  versions/
  objects/
  manifests/
  previews/
  logs/
Use content-addressed object paths:
const objectPath = path.join(root, "objects", sha256.slice(0, 2), sha256);
Write files atomically by writing filename.tmp-${process.pid} and renaming into place.

Step 3: Run and commit
Run:
npm --workspace packages/storage test
npm --workspace packages/storage run build
Commit:
git add packages/storage
git commit -m "feat: add local snapshot storage"
Task 5: Manifest Diff Engine
Files:
Create: packages/diff-engine/package.json

Create: packages/diff-engine/tsconfig.json

Create: packages/diff-engine/src/index.ts

Create: packages/diff-engine/src/premiere-diff.ts

Create: packages/diff-engine/src/change-groups.ts

Test: packages/diff-engine/src/premiere-diff.test.ts

Create: tests/fixtures/manifests/premiere-before-client.json

Create: tests/fixtures/manifests/premiere-after-client.json


Step 1: Add fixture manifests

Create before/after Premiere manifests where the newer manifest has one added clip, one trimmed clip, and a longer sequence duration.

Step 2: Write diff tests
import before from "../../../tests/fixtures/manifests/premiere-before-client.json";
import after from "../../../tests/fixtures/manifests/premiere-after-client.json";
import { describe, expect, it } from "vitest";
import { comparePremiereManifests } from "./index";

describe("Premiere manifest diff", () => {
  it("summarizes trustworthy sequence and clip changes", () => {
    const result = comparePremiereManifests(before, after);

    expect(result.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Sequences" }),
        expect.objectContaining({ title: "Video timeline" })
      ])
    );
    expect(result.summary).toContain("Added 1 clip to Sequence: Main Edit");
    expect(result.summary).toContain("Changed sequence duration from 08:42 to 09:17");
  });

  it("reports unsupported clip-level changes honestly", () => {
    const result = comparePremiereManifests({ ...before, sequences: [{ name: "Main Edit" }] }, after);
    expect(result.unsupported).toContain("Could not inspect clip-level changes in this Premiere version");
  });
});

Step 3: Implement comparison
Implement deterministic matching by sequence.name and clip.stableFingerprint. Only emit clip movement or trim messages when both old and new clips include the relevant tick fields. Add unsupported messages when data is missing.

Step 4: Run and commit
Run:
npm --workspace packages/diff-engine test
npm --workspace packages/diff-engine run build
Commit:
git add packages/diff-engine tests/fixtures/manifests
git commit -m "feat: add manifest diff engine"
Task 6: Mock Host Adapters and Phase 2 Boundary
Files:
Create: packages/host-adapters/package.json

Create: packages/host-adapters/tsconfig.json

Create: packages/host-adapters/src/index.ts

Create: packages/host-adapters/src/mock-premiere-adapter.ts

Create: packages/host-adapters/src/mock-after-effects-adapter.ts

Create: packages/host-adapters/src/premiere-capabilities.ts

Test: packages/host-adapters/src/host-adapters.test.ts


Step 1: Write adapter tests

import { describe, expect, it } from "vitest";
import { createMockAfterEffectsAdapter, createMockPremiereAdapter } from "./index";

describe("host adapters", () => {
  it("detects mock Premiere project and capabilities", async () => {
    const adapter = createMockPremiereAdapter({ projectPath: "D:/work/Film.prproj" });
    await expect(adapter.getCurrentProject()).resolves.toMatchObject({
      host: "premiere",
      extension: ".prproj",
      name: "Film.prproj"
    });
    await expect(adapter.getCapabilities()).resolves.toMatchObject({ projectPath: true });
  });

  it("keeps After Effects behind a mock extension point", async () => {
    const adapter = createMockAfterEffectsAdapter({ enabled: false });
    await expect(adapter.getCurrentProject()).resolves.toBeNull();
  });
});

Step 2: Implement adapters
The mock Premiere adapter returns a manifest with one sequence and optional clips. The mock After Effects adapter implements HostAdapter but returns null when disabled. Document in docs/phase-2-after-effects.md that production AE support requires a fresh runtime/API audit before choosing UXP or ExtendScript bridge.

Step 3: Run and commit
Run:
npm --workspace packages/host-adapters test
npm --workspace packages/host-adapters run build
Commit:
git add packages/host-adapters docs/phase-2-after-effects.md
git commit -m "feat: add host adapter boundary"
Task 7: Companion Service API and Snapshot Orchestration
Files:
Create: apps/companion-service/package.json

Create: apps/companion-service/tsconfig.json

Create: apps/companion-service/src/index.ts

Create: apps/companion-service/src/server.ts

Create: apps/companion-service/src/auth.ts

Create: apps/companion-service/src/snapshot-service.ts

Create: apps/companion-service/src/stable-write.ts

Create: apps/companion-service/src/restore-copy.ts

Create: apps/companion-service/src/cloud/mock-provider.ts

Create: apps/companion-service/src/cloud/upload-queue.ts

Test: apps/companion-service/src/companion.test.ts


Step 1: Write integration tests

Test the vertical slice without Premiere:
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSnapshotService, createRestoreCopy } from "./index";

describe("companion service", () => {
  it("creates a manual snapshot and ignores duplicate content", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-companion-"));
    const project = path.join(dir, "Film.prproj");
    await writeFile(project, "project-v1");
    const service = createSnapshotService({ storageRoot: path.join(dir, ".editvcs") });

    const first = await service.createManualSnapshot({ projectPath: project, label: "Before export" });
    const second = await service.createManualSnapshot({ projectPath: project, label: "Before export again" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
  });

  it("restores as a separate copy and leaves current project unchanged", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-restore-"));
    const active = path.join(dir, "Film.prproj");
    const object = path.join(dir, "object.prproj");
    await writeFile(active, "current");
    await writeFile(object, "old");

    const restoredPath = await createRestoreCopy({
      originalProjectPath: active,
      objectPath: object,
      destinationDirectory: dir,
      label: "Client feedback",
      createdAt: "2026-07-05T18:41:00.000Z"
    });

    await expect(readFile(active, "utf8")).resolves.toBe("current");
    await expect(readFile(restoredPath, "utf8")).resolves.toBe("old");
  });
});

Step 2: Implement localhost server
Expose:
GET /health
POST /pair
GET /projects/current
POST /snapshots/manual
GET /snapshots?projectId=...
POST /snapshots/restore-copy
GET /changes?olderSnapshotId=...&newerSnapshotId=...
GET /cloud/status
POST /cloud/backup
Bind to 127.0.0.1 only. Require Authorization: Bearer <local-secret> for every endpoint except /health and /pair. Store the generated secret in the user data fallback, not in the project snapshot manifest.

Step 3: Implement stable-write detection
Implement waitForStableFile(filePath, { intervalMs: 250, stableChecks: 3, timeoutMs: 10000 }). It must compare size and modified time for three consecutive checks before hashing. If the file never stabilizes, return an actionable error: Project file is still changing. Try again after Premiere finishes saving.

Step 4: Run and commit
Run:
npm --workspace apps/companion-service test
npm --workspace apps/companion-service run build
Commit:
git add apps/companion-service
git commit -m "feat: add EditVCS companion service"
Task 8: Automatic Snapshots Through File Watching
Files:
Modify: apps/companion-service/package.json

Create: apps/companion-service/src/file-watcher.ts

Modify: apps/companion-service/src/snapshot-service.ts

Test: apps/companion-service/src/file-watcher.test.ts


Step 1: Add watcher dependency

Install:
npm install chokidar --workspace apps/companion-service

Step 2: Test stable automatic snapshots
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { watchProjectFileForSnapshots } from "./file-watcher";

describe("file watcher", () => {
  it("creates one automatic save point after stable writes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-watch-"));
    const project = path.join(dir, "Film.prproj");
    await writeFile(project, "v1");
    const events: string[] = [];

    const watcher = await watchProjectFileForSnapshots({
      projectPath: project,
      debounceMs: 100,
      onStableChange: async () => events.push("snapshot")
    });

    await writeFile(project, "v2");
    await new Promise((resolve) => setTimeout(resolve, 600));
    await watcher.close();

    expect(events).toEqual(["snapshot"]);
  });
});

Step 3: Implement watcher
Debounce file changes and call the same snapshot path used by manual snapshots. If SHA-256 matches the latest object, record no new snapshot.

Step 4: Run and commit
Run:
npm --workspace apps/companion-service test
Commit:
git add apps/companion-service package-lock.json
git commit -m "feat: add automatic save points"
Task 9: Premiere Panel UI
Files:
Create: apps/premiere-plugin/package.json

Create: apps/premiere-plugin/vite.config.ts

Create: apps/premiere-plugin/tsconfig.json

Create: apps/premiere-plugin/src/main.tsx

Create: apps/premiere-plugin/src/App.tsx

Create: apps/premiere-plugin/src/api/companion-client.ts

Create: apps/premiere-plugin/src/host/premiere-uxp-adapter.ts

Create: apps/premiere-plugin/src/host/mock-panel-host.ts

Create: apps/premiere-plugin/src/components/NoProjectState.tsx

Create: apps/premiere-plugin/src/components/FirstRunState.tsx

Create: apps/premiere-plugin/src/components/TrackedProjectState.tsx

Create: apps/premiere-plugin/src/components/SavePointDialog.tsx

Create: apps/premiere-plugin/src/components/VersionHistory.tsx

Create: apps/premiere-plugin/src/components/CompareView.tsx

Create: apps/premiere-plugin/src/components/RestoreDialog.tsx

Create: apps/premiere-plugin/src/styles.css

Test: apps/premiere-plugin/src/App.test.tsx


Step 1: Test main UI states

Use React Testing Library to verify:
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { createMockPanelHost } from "./host/mock-panel-host";

describe("Premiere panel", () => {
  it("shows no-project state", async () => {
    render(<App host={createMockPanelHost({ project: null })} />);
    expect(await screen.findByText("Open a Premiere project to start protecting your edits.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Save Point" })).toBeDisabled();
  });

  it("shows first-run state for an untracked project", async () => {
    render(<App host={createMockPanelHost({ tracked: false })} />);
    expect(await screen.findByRole("button", { name: "Start version history" })).toBeInTheDocument();
    expect(screen.getByText("EditVCS saves project versions, not your footage.")).toBeInTheDocument();
  });

  it("opens save-point dialog for tracked projects", async () => {
    const user = userEvent.setup();
    render(<App host={createMockPanelHost({ tracked: true })} />);
    await user.click(await screen.findByRole("button", { name: "Create Save Point" }));
    expect(screen.getByLabelText("Save point name")).toBeInTheDocument();
  });
});

Step 2: Implement panel states
Implement the states from the brief:
No project open
First time with an untracked project
Tracked project
Companion service disconnected
Unsupported project path
Unsupported clip-level changes
Restore warning and destination choice
Use compact dark styling, 8px-or-less card radius, icon buttons with lucide-react, and no Git terms in primary UI.

Step 3: Implement companion client
The panel must call the companion API with bearer auth and show reconnection states when /health or authenticated calls fail. The UI should say Companion service not running and offer Retry.

Step 4: Run and commit
Run:
npm --workspace apps/premiere-plugin test
npm --workspace apps/premiere-plugin run build
Commit:
git add apps/premiere-plugin
git commit -m "feat: add Premiere panel MVP"
Task 10: Version Streams
Files:
Modify: packages/core/src/streams.ts

Modify: apps/companion-service/src/snapshot-service.ts

Create: apps/companion-service/src/streams-service.ts

Modify: apps/premiere-plugin/src/components/VersionHistory.tsx

Test: packages/core/src/streams.test.ts

Test: apps/companion-service/src/streams-service.test.ts


Step 1: Test stream ancestry

import { describe, expect, it } from "vitest";
import { describeStreamRelationship } from "./streams";

describe("stream ancestry", () => {
  it("explains divergent streams without merge promises", () => {
    expect(describeStreamRelationship({ sameStream: false })).toEqual({
      title: "These edits were made separately.",
      body: "You can restore either version as a copy and manually combine the changes in Premiere."
    });
  });
});

Step 2: Implement stream service
Support:
POST /streams
GET /streams?projectId=...
POST /streams/switch
Switching streams changes the selected history view only. It must not overwrite the active .prproj.

Step 3: Add UI control
Add a stream selector with default names:
Main edit
Client feedback
Alternate intro
Director's cut
When streams differ, show the exact divergent-stream message from the brief.

Step 4: Run and commit
Run:
npm --workspace packages/core test
npm --workspace apps/companion-service test
npm --workspace apps/premiere-plugin test
Commit:
git add packages/core apps/companion-service apps/premiere-plugin
git commit -m "feat: add version streams"
Task 11: Cloud Backup Adapter and Queue
Files:
Modify: packages/shared-types/src/cloud.ts

Modify: apps/companion-service/src/cloud/mock-provider.ts

Modify: apps/companion-service/src/cloud/upload-queue.ts

Modify: apps/premiere-plugin/src/components/TrackedProjectState.tsx

Test: apps/companion-service/src/cloud/upload-queue.test.ts


Step 1: Test offline queue behavior

import { describe, expect, it } from "vitest";
import { createUploadQueue } from "./upload-queue";

describe("cloud upload queue", () => {
  it("queues snapshots while offline and retries when online", async () => {
    const uploaded: string[] = [];
    const queue = createUploadQueue({
      provider: {
        async uploadSnapshot(snapshot) {
          uploaded.push(snapshot.id);
        },
        async listSnapshots() {
          return [];
        },
        async downloadSnapshot() {
          return Buffer.from("project");
        }
      },
      isOnline: () => false
    });

    await queue.enqueue({ id: "snap_1", cloudStatus: "queued" } as any);
    expect(uploaded).toEqual([]);

    queue.setOnlineCheck(() => true);
    await queue.flush();
    expect(uploaded).toEqual(["snap_1"]);
  });
});

Step 2: Implement mock cloud provider
Keep provider local and development-only. Before enabling backup, show upload size calculated from snapshot project object byte sizes. Store cloud status as local-only, queued, synced, or failed.

Step 3: Add UI state
Show:
Cloud: Not connected
Cloud: Sync waiting
Cloud: Synced
Cloud: Sync failed
Do not show account-required states for local history.

Step 4: Run and commit
Run:
npm --workspace apps/companion-service test
npm --workspace apps/premiere-plugin test
Commit:
git add packages/shared-types apps/companion-service apps/premiere-plugin
git commit -m "feat: add cloud backup abstraction"
Task 12: Documentation, README, and Final Verification
Files:
Modify: README.md

Modify: docs/storage-format.md

Modify: docs/security-and-privacy.md

Modify: docs/premiere-capabilities.md

Modify: docs/phase-2-after-effects.md

Modify: docs/known-limitations.md


Step 1: Replace README with EditVCS instructions

Include:
# EditVCS

EditVCS gives video editors GitHub-style version history without asking them to understand Git. Phase 1 supports Adobe Premiere Pro with local save points, version history, safe restore-as-copy, and optional cloud backup.

## What EditVCS Does

- Creates manual and automatic save points for Premiere project files.
- Stores project versions locally by default.
- Shows editor-friendly changes when the host API exposes trustworthy metadata.
- Restores old versions as new project copies.
- Keeps cloud backup optional and opt-in.

## What EditVCS Does Not Do

- It does not upload raw footage, proxies, renders, caches, or source media by default.
- It does not overwrite your active project during restore.
- It does not automatically merge Premiere or After Effects project files.
- It does not claim clip-level changes when Premiere does not expose enough data.
Add local setup commands:
npm install
npm run editvcs:build
npm run editvcs:companion
npm run editvcs:premiere
npm run editvcs:test

Step 2: Document storage and privacy
In docs/storage-format.md, document:
<Project Folder>/.editvcs/
  config.json
  versions/
  objects/
  manifests/
  previews/
  logs/
In docs/security-and-privacy.md, state that loopback binds only to 127.0.0.1, requires a local token, and cloud backup excludes footage by default.

Step 3: Run full verification
Run:
npm run editvcs:test
npm run editvcs:build
npm run lint
Expected: all EditVCS workspace tests and builds pass. Any unrelated current-site lint failures must be documented with file paths and exact messages.

Step 4: Commit
git add README.md docs package.json package-lock.json apps packages tests
git commit -m "docs: document EditVCS MVP"
Completion Checklist

Manual save point works through the companion service.

Duplicate project contents do not create duplicate object files.

History list renders friendly labels and never exposes hashes in normal UI.

Restore creates a separate copy and leaves the active project unchanged.

Compare view uses manifest changes and reports unsupported detail honestly.

Automatic save points wait for stable writes.

Version streams are present without merge claims.

Cloud backup is optional and uses the mock provider first.

After Effects is represented by contracts and mock adapter only.

README and docs state limitations clearly.

Automated tests do not require Premiere.

rewind-sdk restore behavior has not been copied into EditVCS.
Suggested Commit Order
docs: add EditVCS architecture plan
feat: add EditVCS shared contracts
feat: add EditVCS core utilities
feat: add local snapshot storage
feat: add manifest diff engine
feat: add host adapter boundary
feat: add EditVCS companion service
feat: add automatic save points
feat: add Premiere panel MVP
feat: add version streams
feat: add cloud backup abstraction
docs: document EditVCS MVP
Self-Review Notes
Spec coverage: The plan covers local storage, manual snapshots, automatic snapshots, safe restore-as-copy, structured manifests, changes, streams, cloud adapter, tests, docs, and After Effects Phase 2 boundaries.
Intentional deferral: Production cloud provider, production After Effects integration, and real Premiere UXP API calls are bounded behind interfaces because the brief prioritizes a reliable local Premiere MVP and honest unsupported states.
Safety check: Restore-as-copy is tested in the companion integration task and must never call an overwrite path for the active project.
Language check: User-facing UI tasks use save point, version stream, restore as copy, changes, cloud backup, and latest saved version. Git terms are allowed only inside implementation notes and commit messages.