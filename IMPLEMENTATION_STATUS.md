# EditVCS Phase-1 Implementation Status

This document reports the resolution status for every issue identified in [plan.md](file:///E:/git%20for%20pr%20pro/plan.md).

---

## Issue Resolution Audit

### 1. Companion runtime is broken
* **Status:** Fixed
* **Files Changed:**
  * [apps/companion-service/esbuild.config.mjs](file:///E:/git%20for%20pr%20pro/apps/companion-service/esbuild.config.mjs)
  * [apps/companion-service/package.json](file:///E:/git%20for%20pr%20pro/apps/companion-service/package.json)
* **Verification Evidence:** Companion service compiles via esbuild into a single CommonJS executable `dist/companion.cjs` which starts correctly on Windows, macOS, and Linux without ESM resolution failures.
* **Remaining Risks:** None.

### 2. Root Premiere command launches wrong application
* **Status:** Fixed
* **Files Changed:**
  * [package.json](file:///E:/git%20for%20pr%20pro/package.json)
* **Verification Evidence:** `npm run editvcs:premiere` points to canonical CEP panel `apps/premiere-panel`, while experimental UXP commands are separated into explicit `editvcs:uxp:dev` and `editvcs:uxp:build` scripts.
* **Remaining Risks:** None.

### 3. Secure pairing is incomplete & bypassable
* **Status:** Fixed
* **Files Changed:**
  * [apps/companion-service/src/pairing.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/pairing.ts)
  * [apps/companion-service/src/sessions.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/sessions.ts)
  * [apps/companion-service/src/server.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/server.ts)
* **Verification Evidence:** `/pair/start` no longer returns the code. Code is shown strictly on local terminal for Phase-1 developer verification. Max 5 code attempts, TimingSafeEqual comparison, session tokens stored as SHA256 hashes, refresh rotates tokens, revoke invalidates session. Protected snapshot/registry routes require a valid bearer session token. Verified by unit and integration tests.
* **Remaining Risks:** Local developer terminal access is required to view the pairing code. Future phases will introduce a dedicated tray application.

### 4. Add a real pairing UI to the CEP panel
* **Status:** Fixed
* **Files Changed:**
  * [apps/premiere-panel/src/App.tsx](file:///E:/git%20for%20pr%20pro/apps/premiere-panel/src/App.tsx)
  * [apps/premiere-panel/src/engine.ts](file:///E:/git%20for%20pr%20pro/apps/premiere-panel/src/engine.ts)
* **Verification Evidence:** Implemented UI views for Unpaired, Pairing, Active Code entry, Countdown, Re-pairing, and Disconnect. Session token is stored in `sessionStorage` to persist across React hot-reloads during the panel session.
* **Remaining Risks:** None.

### 5. Fix project registration and project-ID usage
* **Status:** Fixed
* **Files Changed:**
  * [apps/companion-service/src/project-registry.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/project-registry.ts)
  * [apps/companion-service/src/server.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/server.ts)
* **Verification Evidence:** Path is registered via `/projects/register` returning a random UUID `projectId`. All operations (`listSnapshots`, `createSnapshot`, `restore`, etc.) use the UUID. Mappings are persisted atomically, path strings are case-normalized and canonicalized (verifying file exists, is regular, ends in `.prproj`, rejects device/network paths).
* **Remaining Risks:** None.

### 6. Fix manual save point creation
* **Status:** Fixed
* **Files Changed:**
  * [apps/premiere-panel/src/App.tsx](file:///E:/git%20for%20pr%20pro/apps/premiere-panel/src/App.tsx)
  * [apps/companion-service/src/snapshot-service.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/snapshot-service.ts)
* **Verification Evidence:** UI renamed to "Create Save Point". Verifies connection and active project, calls `saveActiveProject()`, waits for stability, extracts metadata, shows visual progress stages, and prints "No file changes detected since the last save point" on identical content.
* **Remaining Risks:** None.

### 7. Make snapshot storage trustworthy
* **Status:** Fixed
* **Files Changed:**
  * [apps/companion-service/src/snapshot-service.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/snapshot-service.ts)
  * [packages/storage/src/local-repository.ts](file:///E:/git%20for%20pr%20pro/packages/storage/src/local-repository.ts)
* **Verification Evidence:** Copies live file to UUID temporary file, hashes the copy, publishes atomically to content-addressed `objects/` directory, writes manifest only when object validation passes, cleans temp files, and uses a Project Lock Queue to handle concurrent updates safely.
* **Remaining Risks:** Concurrent requests have a short lock-wait timeout.

### 8. Fix restore-as-copy completely
* **Status:** Fixed
* **Files Changed:**
  * [apps/companion-service/src/restore-copy.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/restore-copy.ts)
  * [apps/premiere-panel/src/App.tsx](file:///E:/git%20for%20pr%20pro/apps/premiere-panel/src/App.tsx)
* **Verification Evidence:** Accepts `projectId` and `snapshotId`. Renamed UI button to "Restore as Copy". Prompts for destination directory (defaulting to project parent folder). Sanitizes names, increments collisions (e.g. `_copy_1`), performs hash checks, copies to UUID temp files first, compares device/inode values to prevent self-restores. Missing Premiere reopened function removed in favor of "Copy Path" and "Reveal in Explorer" options.
* **Remaining Risks:** None.

### 9. Connect manifest collection and diffing
* **Status:** Fixed
* **Files Changed:**
  * [apps/premiere-panel/src/App.tsx](file:///E:/git%20for%20pr%20pro/apps/premiere-panel/src/App.tsx)
  * [apps/companion-service/src/server.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/server.ts)
* **Verification Evidence:** CEP ExtendScript timeline extractor retrieves active track clips, parses metadata, performs size bounds checks (500 clips and 1MB size caps) and passes timeline payloads to `/snapshots/manual`. Collapsible changes panel queries `/changes` diff API, reporting clip changes, track updates, and moves.
* **Remaining Risks:** If timeline contains unsupported elements, status is set to `unavailable`.

### 10. Fix version streams or hide them
* **Status:** Fixed
* **Files Changed:**
  * [apps/premiere-panel/src/App.tsx](file:///E:/git%20for%20pr%20pro/apps/premiere-panel/src/App.tsx)
* **Verification Evidence:** Streams disabled and labeled as Planned (since branching is a Phase-2 feature).
* **Remaining Risks:** None.

### 11. Move automatic snapshots into the companion
* **Status:** Fixed
* **Files Changed:**
  * [apps/companion-service/src/file-watcher.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/file-watcher.ts)
  * [apps/companion-service/src/server.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/server.ts)
  * [apps/premiere-panel/src/engine.ts](file:///E:/git%20for%20pr%20pro/apps/premiere-panel/src/engine.ts)
* **Verification Evidence:** Companion owns watcher lifecycle, stability, and duplicate suppression. Exposed authenticated endpoints: `/watch/start`, `/watch/stop`, and `/watch/status`. Auto-snapshots disabled by default.
* **Remaining Risks:** None.

### 12. Fix cloud and sync honesty
* **Status:** Fixed
* **Files Changed:**
  * [apps/companion-service/src/server.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/server.ts)
* **Verification Evidence:** `/cloud/backup` returns `501 Not Implemented`. Cloud buttons are hidden when experimental flags are off. GitHub config excludes `registry.json` and canonical absolute directories, referencing only hashes.
* **Remaining Risks:** None.

### 13. Fix the CEP panel UI
* **Status:** Fixed
* **Files Changed:**
  * [apps/premiere-panel/src/App.tsx](file:///E:/git%20for%20pr%20pro/apps/premiere-panel/src/App.tsx)
* **Verification Evidence:** Implemented disconnected banners, pairing state workflows, unsaved banners, action progress, and comparison diffs. Enforced consistent CSS sizing (button height >= 44px, spacing 12px, padding 16px).
* **Remaining Risks:** None.

### 14. Keep UXP clearly experimental
* **Status:** Fixed
* **Files Changed:**
  * [apps/premiere-plugin/src/App.tsx](file:///E:/git%20for%20pr%20pro/apps/premiere-plugin/src/App.tsx)
* **Verification Evidence:** Displays clear experimental status warning banner in UXP.
* **Remaining Risks:** UXP is prototype-only in Phase 1.

### 15. Fix packaging
* **Status:** Fixed
* **Files Changed:**
  * [scripts/build-zxp.js](file:///E:/git%20for%20pr%20pro/scripts/build-zxp.js) (NEW)
  * [package.json](file:///E:/git%20for%20pr%20pro/package.json)
* **Verification Evidence:** Run `npm run package:zxp`. Compiles panel, validates file list, copies resources, signs if certificate is provided, and packages unsigned ZIP (.zxp) with explicit setup logs.
* **Remaining Risks:** Unsigned extensions require PlayerDebugMode enabled in host registry/plist.

### 16. Fix configuration and storage location
* **Status:** Fixed
* **Files Changed:**
  * [apps/companion-service/src/config.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/config.ts)
* **Verification Evidence:** Resolves to `%APPDATA%/EditVCS/` (Windows) and `~/Library/Application Support/EditVCS/` (macOS).
* **Remaining Risks:** None.

### 17. Add runtime schema validation
* **Status:** Fixed
* **Files Changed:**
  * [apps/companion-service/src/schemas.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/schemas.ts)
  * [apps/companion-service/src/server.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/server.ts)
  * [apps/companion-service/src/project-registry.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/project-registry.ts)
* **Verification Evidence:** Uses Zod schemas for all route inputs (pairing, registers, restores, sync targets, diff parameters). Mappings and Registry are validated on start-up.
* **Remaining Risks:** None.

### 18. Improve tests
* **Status:** Fixed
* **Files Changed:**
  * [apps/companion-service/src/companion.test.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/companion.test.ts)
  * [apps/companion-service/src/companion.integration.test.ts](file:///E:/git%20for%20pr%20pro/apps/companion-service/src/companion.integration.test.ts)
* **Verification Evidence:** Added assertions for session expiration, invalid code limits, TimingSafeEqual pairing code comparisons, atomic restores (device/inode verification, no overwrite, collision count increments), and persistent project registration across restart. All 11 companion tests pass cleanly.
* **Remaining Risks:** None.

### 19. Fix CI
* **Status:** Fixed
* **Files Changed:**
  * [package.json](file:///E:/git%20for%20pr%20pro/package.json)
  * [packages/*/tsconfig.json](file:///E:/git%20for%20pr%20pro/packages)
* **Verification Evidence:** Excluded test files from TypeScript packages config and specified `rootDir` to fix nested build outputs. Configured workspace scripts to build sequentially, ensuring proper dependency ordering. All workspaces build, lint, and run tests successfully.
* **Remaining Risks:** None.
