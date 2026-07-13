# EditVCS Phase-1 Implementation Plan

**Repository:** `Anmol2k5/Git-for-Video-Editing-Agents`  
**Target branch:** `main`  
**Current state:** Pre-alpha  
**Primary runtime:** Adobe Premiere Pro CEP panel

## Primary Goal

Deliver one reliable workflow:

```text
Start companion
→ Open CEP panel
→ Pair securely
→ Register active .prproj
→ Create save point
→ Show version history
→ Compare snapshots
→ Restore an older version as a new copy
→ Restart companion and retain registry/history
```

Do not expand cloud backup, GitHub sync, streams, AI-agent workflows, or production UXP support until this vertical slice is verified.

---

# 1. Completion Definition

Phase 1 is complete only when all of the following are true:

```text
[ ] Clean npm install succeeds
[ ] Repository verification succeeds
[ ] TypeScript lint/typecheck succeeds
[ ] All workspace builds succeed
[ ] All tests succeed
[ ] Built companion starts successfully
[ ] /health returns 200
[ ] CEP panel loads inside Premiere Pro
[ ] Pairing code is never returned over HTTP
[ ] Session expiry returns the panel to pairing
[ ] Active Premiere project is detected
[ ] Project registration returns a persistent UUID
[ ] Manual save point captures the latest saved .prproj
[ ] Save point appears in history
[ ] Duplicate object bytes are deduplicated
[ ] A → B → A still creates a new historical save point
[ ] Snapshot version numbers remain stable
[ ] Two snapshots can be compared honestly
[ ] Restore creates a separate verified copy
[ ] Existing files are never overwritten
[ ] Active project remains untouched
[ ] Companion restart preserves project/history
[ ] CEP package contains valid production assets
[ ] README matches verified behavior
[ ] Required GitHub Actions checks pass on main
```

---

# 2. Locked Architecture Decisions

## 2.1 Canonical Premiere runtime

Use `apps/premiere-panel/` as the supported Phase-1 runtime.

Treat `apps/premiere-plugin/` as an experimental UXP prototype. It must not be launched by default commands or silently display mock data in production builds.

## 2.2 Companion service

Bundle the companion into:

```text
apps/companion-service/dist/companion.cjs
```

Supported runtime:

```text
Node.js 20.19+ or Node.js 22.12+
```

Do not advertise Node 18 support.

## 2.3 Centralized storage

```text
Windows: %APPDATA%/EditVCS/
macOS:   ~/Library/Application Support/EditVCS/
Linux:   ~/.local/share/EditVCS/
```

```text
EditVCS/
├── config.json
├── registry.json
├── projects/
│   └── <project-id>/
│       ├── state.json
│       └── snapshots/
│           └── <snapshot-id>.json
├── objects/
│   ├── .tmp/
│   │   └── <uuid>.tmp
│   └── ab/
│       └── <sha256>
├── logs/
├── recovery/
└── temp/
```

Snapshot manifests must never store absolute object paths.

---

# 3. Critical Phase — Build and Type Safety

## 3.1 Fix the shared Snapshot type

### Files

```text
packages/shared-types/src/snapshots.ts
apps/companion-service/src/snapshot-service.ts
apps/companion-service/src/server.ts
apps/premiere-panel/src/engine.ts
```

The shared type still requires `projectFile.objectPath`, while the current storage design derives paths from SHA-256. The implementation also uses `manifestStatus` and `manifestReason` without declaring them.

Use:

```ts
export type ManifestStatus =
  | "verified"
  | "best-effort"
  | "unavailable";

export interface Snapshot {
  schemaVersion: 1;
  id: string;
  projectId: string;
  parentSnapshotId?: string;
  streamId: string;
  sequenceNumber: number;
  createdAt: string;
  createdBy: string;
  trigger: SnapshotTrigger;
  label?: string;
  note?: string;

  projectFile: {
    originalFileName: string;
    sourceExtension: ".prproj";
    sha256: string;
    byteSize: number;
  };

  manifest: PremiereProjectManifest;
  manifestStatus: ManifestStatus;
  manifestReason?: string;
  cloudStatus: CloudStatus;
}
```

Remove stale `objectPath` fields from panel-side types and mappings.

## 3.2 Add runtime Snapshot validation

### Files

```text
apps/companion-service/src/schemas.ts
packages/storage/src/local-repository.ts
```

Create a Zod schema matching the canonical Snapshot type. Validate every snapshot loaded from disk.

When validation fails:

1. Do not crash.
2. Move the invalid file to `recovery/`.
3. Report a repository-health warning.
4. Log details locally.
5. Never use `JSON.parse(...) as Snapshot` without validation.

## 3.3 Define the missing manifest limit

### File

```text
apps/premiere-panel/src/App.tsx
```

Add:

```ts
const MAX_MANIFEST_SIZE_BYTES = 1024 * 1024;
const MAX_MANIFEST_CLIPS = 500;
```

Use UTF-8 bytes:

```ts
const bytes = new TextEncoder()
  .encode(JSON.stringify(manifest))
  .byteLength;
```

## 3.4 Make root scripts truthful

### File

```text
package.json
```

Remove stale CLI metadata unless a real CLI is restored:

```json
"main": "dist/cli/index.js",
"bin": { "editvcs": "./dist/cli/index.js" },
"start": "node dist/cli/index.js",
"build": "tsc && vite build"
```

Use:

```json
{
  "scripts": {
    "build": "npm run editvcs:build",
    "test": "npm run editvcs:test",
    "lint": "npm run editvcs:lint",
    "verify": "npm run verify:repository && npm run lint && npm run build && npm run test",

    "editvcs:companion": "npm --workspace apps/companion-service run dev",
    "editvcs:premiere": "npm --workspace apps/premiere-panel run dev",
    "editvcs:uxp:dev": "npm --workspace apps/premiere-plugin run dev",
    "editvcs:uxp:build": "npm --workspace apps/premiere-plugin run build",

    "package:cep:unsigned": "node scripts/build-zxp.js --unsigned",
    "package:cep:signed": "node scripts/build-zxp.js --signed"
  },
  "engines": {
    "node": "^20.19.0 || >=22.12.0"
  }
}
```

## 3.5 Declare workspace dependencies correctly

### File

```text
apps/companion-service/package.json
```

The companion directly uses `chokidar` and is built with `esbuild`. Declare them in the companion workspace instead of relying on root hoisting.

---

# 4. Pairing and Sessions

## 4.1 Remove test plaintext code from production records

### File

```text
apps/companion-service/src/pairing.ts
```

Remove:

```ts
codeForTest?: string;
getPairingCodeForTest(...)
```

Use dependency injection with a test presenter:

```ts
export class TestPairingPresenter
  implements PairingCodePresenter {
  public latestCode: string | null = null;

  async showCode(code: string): Promise<void> {
    this.latestCode = code;
  }

  async clearCode(): Promise<void> {
    this.latestCode = null;
  }
}
```

## 4.2 Add a production pairing UI

Console output is acceptable for development only. Before external alpha, add a tray app or small companion window that shows:

```text
EditVCS Companion
Status: Waiting for Premiere panel
Pairing code: 428193
Expires in: 42 seconds
```

Rules:

- Never write the code to a plain-text file.
- Clear it after success/expiry.
- Do not include it in normal logs.

## 4.3 Handle expired sessions in the CEP panel

### Files

```text
apps/premiere-panel/src/engine.ts
apps/premiere-panel/src/App.tsx
```

The API client must return structured errors instead of returning `null` for every failure.

On HTTP `401`:

1. Clear the client token.
2. Clear `sessionStorage`.
3. Clear project/history state.
4. Return the user to the pairing screen.
5. Show: `Session expired or companion restarted. Pair again.`

---

# 5. Manual Save Point Workflow

## 5.1 Abort when Premiere save fails

### File

```text
apps/premiere-panel/src/App.tsx
```

Do not continue snapshotting after `saveActiveProject()` returns anything other than `SUCCESS`.

```ts
if (result !== "SUCCESS") {
  setIsSyncing(false);
  addActivity(
    "Premiere could not save the project. Save point was not created."
  );
  return;
}
```

## 5.2 Add timeouts for every ExtendScript call

Create a reusable helper for:

- Active project path
- Save project
- Timeline extraction
- Future host operations

A host callback must never leave the UI permanently stuck.

## 5.3 Separate object deduplication from history

### File

```text
apps/companion-service/src/snapshot-service.ts
```

Current logic rejects a hash found anywhere in history. This breaks `A → B → A`.

Correct behavior:

- Reuse object bytes by hash.
- Skip only when the latest snapshot has the same hash.
- A manual labeled milestone may create a snapshot even if the object existed earlier.

```ts
const latest = existing[0];
const sameAsLatest =
  latest?.projectFile.sha256 === sha256;

if (sameAsLatest) {
  return {
    created: false,
    reason: "No file changes detected since the last save point."
  };
}
```

## 5.4 Add stable version numbers

Persist `sequenceNumber` in each snapshot.

```ts
const nextSequenceNumber =
  existing.length === 0
    ? 1
    : Math.max(...existing.map(
        item => item.sequenceNumber
      )) + 1;
```

The panel must display this stored value instead of assigning `index + 1` after sorting.

## 5.5 Store byte size from the verified object

Use the final content-addressed object size, not the live project size after publishing.

---

# 6. Timeline Manifest and Diffing

## 6.1 Preserve stable clip identities

### Files

```text
apps/premiere-panel/jsx/hostscript.jsx
apps/premiere-panel/src/App.tsx
```

Use `clip.nodeId`/`clip.id` as the first-choice fingerprint.

Do not use start position as primary identity, because moved clips change start position.

Capture:

- Sequence ID
- Sequence name
- Sequence duration
- Video/audio track counts
- Clip ID
- Clip start/end
- Clip in/out
- Track type/index

## 6.2 Expand the diff engine

### File

```text
packages/diff-engine/src/premiere-diff.ts
```

Implement and test:

```text
Added sequence
Removed sequence
Renamed sequence using stable ID
Sequence duration changed
Added clip
Removed clip
Trimmed clip
Moved clip
Track changed
Audio clip changes
```

## 6.3 Handle unavailable metadata honestly

### File

```text
apps/companion-service/src/server.ts
```

If either snapshot has `manifestStatus: "unavailable"`, do not compare fallback empty manifests. Return:

```json
{
  "confidence": "metadata-unavailable",
  "summary": [],
  "groups": [],
  "unsupported": [
    "Timeline metadata was unavailable for one or both save points."
  ]
}
```

---

# 7. Restore Completion

Preserve current backend protections:

- Stored object hash verification
- Canonical destination directory
- Sanitized names
- Windows reserved-name handling
- UUID temporary file
- Exclusive no-overwrite publication
- Active-file same-path rejection
- Object-store same-path rejection
- Final identity verification

## 7.1 Add folder picker and success actions

### File

```text
apps/premiere-panel/src/App.tsx
```

After restore, show a persistent result:

```text
Restored copy created successfully
[Copy Path] [Reveal in Explorer/Finder] [Close]
```

Prefer a CEP folder picker over requiring users to type an absolute path.

---

# 8. Automatic Snapshot Policy

Automatic snapshots remain:

```text
Experimental
Disabled by default
Not part of Phase-1 acceptance
```

Before enabling them, implement:

- Persisted watcher-enabled state
- Watcher restoration after restart
- Pending-event queue while processing
- Watcher cleanup during shutdown
- Project missing/moved handling
- Error/status reporting

Do not drop events received while a snapshot is processing.

---

# 9. CEP Packaging

## 9.1 Add a genuine PNG icon

### Files

```text
apps/premiere-panel/public/icon.png
apps/premiere-panel/CSXS/manifest.xml
scripts/build-zxp.js
```

Never rename SVG bytes to `.png` and never write plain text as an icon placeholder.

Validate the PNG signature during packaging.

## 9.2 Separate unsigned and signed builds

```bash
npm run package:cep:unsigned
npm run package:cep:signed
```

Unsigned output:

```text
release/EditVCS-CEP/
release/EditVCS-CEP-unsigned.zip
```

Signed output:

```text
release/EditVCS-<version>.zxp
```

A signed command must fail when signing fails. It must not silently fall back to unsigned output.

## 9.3 Invoke the signer safely

Use `execFileSync` with an argument array. Do not interpolate the certificate password into a shell command and do not log it.

## 9.4 Make CEP development commands honest

The manifest loads `dist/index.html`, so a Vite dev server alone does not load the panel in Premiere.

Use `vite build --watch` or a separate development manifest.

Document the real flow:

1. Start companion.
2. Build/watch CEP assets.
3. Symlink/copy extension folder.
4. Enable PlayerDebugMode.
5. Restart Premiere.
6. Open `Window > Extensions > EditVCS`.

---

# 10. UXP Isolation

### Files

```text
apps/premiere-plugin/src/main.tsx
apps/premiere-plugin/src/App.tsx
```

Do not silently replace a missing Premiere host with mock project data.

Production UI should show:

```text
UXP Prototype — Not Supported in Phase 1
```

Mock hosts should only be used in explicit development/test mode.

---

# 11. Documentation Updates

## README.md

Use honest statuses:

| Feature | Status |
|---|---|
| Companion bundle | Implemented, pending CI evidence |
| Manual save points | Pre-alpha |
| Restore as copy | Alpha backend |
| Pairing | Developer-only |
| Timeline diff | Experimental |
| Automatic snapshots | Experimental, disabled |
| Version streams | Planned |
| Sync | Planned |
| Cloud backup | Planned |
| UXP panel | Prototype only |

## .env.example

```env
EDITVCS_COMPANION_PORT=8731

# Optional override. Blank uses the OS application-data directory.
EDITVCS_STORAGE_ROOT=

EDITVCS_LOG_LEVEL=info
EDITVCS_DEV_PANEL_PORT=5173
VITE_EDITVCS_ENABLE_EXPERIMENTAL_FEATURES=false
```

## docs/setup.md

Document:

- Node 20.19+ or 22.12+
- Central storage locations
- Companion startup
- CEP build/watch
- Extension installation
- PlayerDebugMode
- Pairing code location
- Logs and recovery location
- Manual Premiere verification

## IMPLEMENTATION_STATUS.md

- Replace all `file:///E:/...` links with repository-relative links.
- Do not mark something fixed without automated or manual evidence.

---

# 12. Test Plan

## Commands

```bash
npm ci
npm run verify:repository
npm run editvcs:lint
npm run editvcs:build
npm run editvcs:test
```

## Companion smoke test

```bash
node apps/companion-service/dist/companion.cjs
curl --fail http://127.0.0.1:8731/health
```

## Pairing tests

```text
[ ] /pair/start omits code
[ ] Max active pairings enforced
[ ] Start rate limit enforced
[ ] Wrong code decrements attempts
[ ] Final invalid attempt deletes session
[ ] Expired code fails
[ ] Used code cannot be reused
[ ] Refresh rotates token
[ ] Old token fails after refresh
[ ] Revoke invalidates token
[ ] Restart invalidates sessions
[ ] Protected routes reject missing/expired tokens
```

## Snapshot tests

```text
[ ] First manual snapshot succeeds
[ ] Same content as latest is skipped
[ ] A → B → A creates three snapshots
[ ] A → B → A stores two objects
[ ] Concurrent requests serialize per project
[ ] Source changes during copy are handled
[ ] Temp files are cleaned
[ ] Existing object is verified/reused
[ ] Manifest size/clip limits work
[ ] Metadata failure does not block backup
[ ] Version numbers remain stable
```

## Restore tests

```text
[ ] Active project remains unchanged
[ ] Restored content matches object
[ ] Existing destination is never overwritten
[ ] Collision creates incremented name
[ ] Hash mismatch aborts
[ ] Temp files are cleaned
[ ] Original project may be missing
[ ] Object-store destination is rejected
[ ] Same active-project destination is rejected
[ ] Invalid names are sanitized
```

## Diff tests

```text
[ ] Added/removed/renamed sequence
[ ] Duration changed
[ ] Added/removed clip
[ ] Trimmed clip
[ ] Moved clip
[ ] Track changed
[ ] Audio clip change
[ ] Identical manifests
[ ] Metadata unavailable
[ ] Cross-project comparison rejected
```

## CEP tests

Mock `CSInterface` and test:

```text
[ ] Companion offline
[ ] Pairing start/completion/failure/expiry
[ ] Session expiry
[ ] Project registration/switching
[ ] Premiere save failure aborts
[ ] EvalScript timeout
[ ] Save point creation
[ ] Duplicate save-point state
[ ] Stable version numbers
[ ] Diff request
[ ] Restore error/success
[ ] Timer cleanup
```

## Restart persistence test

```text
Start server
→ pair
→ register project
→ snapshot A
→ modify
→ snapshot B
→ stop server
→ restart with same storage
→ old token fails
→ pair again
→ history contains A and B
→ restore A and verify bytes
```

---

# 13. CI Plan

### File

```text
.github/workflows/ci.yml
```

Use:

```yaml
strategy:
  matrix:
    os:
      - ubuntu-latest
      - windows-latest
      - macos-latest
    node-version:
      - 20.19.x
      - 22.x
```

Required steps:

```yaml
- run: npm ci
- run: npm run verify:repository
- run: npm run editvcs:lint
- run: npm run editvcs:build
- run: npm run editvcs:test
- run: npm run package:cep:unsigned
- run: node scripts/companion-smoke-test.js
```

Make CI and Gitleaks required checks before merging to `main`.

---

# 14. Manual Premiere Verification

Test at minimum:

```text
Windows 11 + Premiere Pro 2023/2024/2025
macOS + at least one supported Premiere version
```

Checklist:

```text
[ ] CEP panel appears in Window > Extensions
[ ] Icon renders correctly
[ ] Companion offline state is accurate
[ ] Pairing works
[ ] Active project path is detected
[ ] Unsaved/save-failure state is handled
[ ] Save point captures latest disk state
[ ] Timeline metadata collection works
[ ] Large timeline falls back safely
[ ] Version history reloads
[ ] Diff reflects real changes
[ ] Restore creates a separate file
[ ] Active project is untouched
[ ] Restart preserves history
[ ] Panel returns to pairing after restart
```

Record OS, Premiere version, CSXS version, results, screenshots/video, and limitations.

---

# 15. Required Execution Order

## Phase 0 — Trustworthy builds

1. Fix Snapshot types.
2. Add runtime schemas.
3. Define manifest limit constants.
4. Fix root scripts and Node requirements.
5. Add lint and smoke tests to CI.
6. Obtain a successful CI run.

## Phase 1 — Manual save/restore vertical slice

1. Handle session expiry.
2. Abort on Premiere save failure.
3. Fix A → B → A history.
4. Add stable version numbers.
5. Verify save point history.
6. Verify restore-as-copy.
7. Verify restart persistence.

## Phase 2 — Diffing

1. Preserve host IDs.
2. Capture sequence identity/duration.
3. Add removed/moved/track detection.
4. Add metadata-unavailable behavior.
5. Add diff tests.

## Phase 3 — Packaging

1. Add valid PNG icon.
2. Separate signed/unsigned packaging.
3. Secure signing invocation.
4. Add CEP build-watch flow.
5. Produce CI artifact.
6. Perform real Premiere install test.

## Phase 4 — Alpha polish

1. Add pairing tray/window.
2. Add folder picker.
3. Add restore success actions.
4. Improve accessibility.
5. Correct docs/status files.
6. Isolate UXP mock mode.

## Phase 5 — Later only

- Automatic snapshots
- Version streams
- Local/NAS sync
- GitHub sync
- Cloud backup
- AI-agent workflows
- Production UXP migration

---

# 16. Final Delivery Requirements

At completion provide:

```text
1. Files changed
2. Commits created
3. Commands executed
4. Typecheck results
5. Build results
6. Test results
7. CI run/status
8. CEP package output
9. Manual Premiere verification results
10. Remaining limitations
11. Release recommendation:
    Not ready / Pre-alpha / Alpha-ready / Beta-ready / Production-ready
```

Do not mark Phase 1 complete until the complete workflow has been tested inside Adobe Premiere Pro.
