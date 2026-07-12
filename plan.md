You are a senior staff engineer responsible for repairing and completing the following repository:

**Repository:** https://github.com/Anmol2k5/Git-for-Video-Editing-Agents
**Project:** EditVCS — Git-like local version control for Adobe Premiere Pro projects
**Canonical Phase-1 runtime:** `apps/premiere-panel/` using Adobe CEP
**Experimental runtime:** `apps/premiere-plugin/` using UXP; do not treat it as production-ready

Your job is not to redesign the project from scratch or only write another audit. Your job is to inspect the current repository, verify every issue below against the source, implement the required fixes, add tests, and leave the repository with one working end-to-end vertical slice.

Do not assume existing features work because a file, route, button, or test exists. Trace every workflow from the Premiere panel through the companion API to storage and back.

# Primary goal

Make this workflow actually work:

1. User starts the EditVCS companion service.
2. User opens the EditVCS CEP panel inside Premiere Pro.
3. Panel checks whether the companion is reachable.
4. User securely pairs the panel with the companion.
5. Panel detects the active `.prproj` file.
6. Project is registered and receives a persistent `projectId`.
7. User creates a manual save point.
8. EditVCS safely captures and stores the project file.
9. Save point appears in version history.
10. User modifies and saves the Premiere project.
11. User creates a second save point.
12. EditVCS compares the two manifests where trustworthy metadata exists.
13. User restores the older save point as a new `.prproj` copy.
14. The active project file is never overwritten.
15. After restarting the companion, project registration and version history still exist.

Until this exact workflow works, do not spend time implementing advanced cloud collaboration, AI agents, automatic merging, or visual polish.

# Current verified problems

The current repository has the following verified issues. Re-check them against the latest branch before modifying code.

## 1. Companion runtime is broken

The companion package uses:

* `"type": "module"`
* TypeScript `module: "ESNext"`
* `moduleResolution: "bundler"`
* Extensionless relative imports such as `./server`

Node ESM does not reliably resolve the compiled extensionless imports.

Current command:

```bash
npm run editvcs:companion
```

may compile successfully but then fail with `ERR_MODULE_NOT_FOUND`.

Fix this properly.

Preferred approach:

* Bundle the companion service with `tsup`, `esbuild`, or another reliable Node bundler.
* Produce one executable Node entry file.
* Add a smoke test that starts the built server and calls `/health`.

Alternatively, use NodeNext correctly with `.js` extensions in every emitted relative import.

Do not claim this is fixed until the built companion starts successfully with Node on Windows, macOS, and Linux CI.

## 2. The root Premiere command launches the wrong application

The README says the canonical Phase-1 panel is:

```text
apps/premiere-panel/
```

But the root script currently starts:

```text
apps/premiere-plugin/
```

which is the experimental UXP/Vite prototype.

Fix root scripts so that:

```bash
npm run editvcs:premiere
```

runs or watches the canonical CEP panel.

Add separate explicit commands for the experimental UXP project, such as:

```bash
npm run editvcs:uxp:dev
npm run editvcs:uxp:build
```

Do not allow documentation or scripts to present the UXP prototype as the working production panel.

## 3. Secure pairing is incomplete and currently bypassable

The companion currently returns the six-digit pairing code from `/pair/start`.

This defeats the purpose of pairing because any local caller can request the code and immediately authenticate.

Implement a proper flow:

```http
POST /pair/start
POST /pair/complete
POST /sessions/refresh
POST /sessions/revoke
```

`POST /pair/start` must return only:

```json
{
  "pairingId": "...",
  "expiresAt": 123456789
}
```

It must not return the six-digit code.

The code should be shown outside the HTTP response through one of these:

* A small companion desktop window
* A system tray interface
* A temporary secure local UI

For development only, it may be printed to the terminal, but production must not depend on terminal access.

Pairing requirements:

* Six-digit code
* Expires after approximately 60 seconds
* Single use
* Maximum five attempts
* Timing-safe comparison
* Pairing records removed after success or expiry
* Rate limiting
* Tokens stored as hashes
* Session expiration
* Session refresh rotates tokens
* Session revoke invalidates tokens
* Codes and bearer tokens must not appear in normal logs

Every sensitive endpoint must require a valid session:

* Project registration
* Snapshot creation
* Snapshot listing
* Restore
* Streams
* Sync
* Changes
* Cloud/agent endpoints if retained

## 4. Add a real pairing UI to the CEP panel

The CEP panel currently attempts to register the project without first pairing.

Add explicit UI states:

* Companion unavailable
* Companion available but unpaired
* Pairing in progress
* Enter pairing code
* Pairing failed
* Paired successfully
* Session expired
* Reconnect/re-pair

Do not silently swallow authentication failures.

Persist the session securely for the current application session. Do not store long-lived plaintext credentials in insecure browser local storage.

## 5. Fix project registration and project-ID usage

The panel currently mixes up:

* Project filesystem path
* Registered `projectId`

Correct flow:

1. CEP host script obtains the active Premiere project path.
2. Authenticated panel sends it once to `/projects/register`.
3. Companion canonicalizes and validates the path.
4. Companion returns a random UUID `projectId`.
5. Panel stores the `projectId`.
6. All later operations use `projectId`, not the raw project path.

Fix all places where `projectPath` is passed to:

* `createSnapshot`
* `listSnapshots`
* `restore`
* Streams
* Changes

Project registry requirements:

* Instance per server; no global state shared across tests
* Await registry loading before server begins accepting requests
* Persist mappings atomically
* Validate loaded data using schemas
* Confirm file exists
* Confirm it is a regular file
* Confirm extension is `.prproj`
* Reject device paths
* Reject unsupported network paths for Phase 1
* Revalidate the path before sensitive operations
* Use random opaque IDs, never path-derived IDs

## 6. Fix manual save point creation

Current CEP “Save Cut” workflow sends the wrong identifier and ignores several failures.

Rename the UI action to:

```text
Create Save Point
```

Correct workflow:

1. Confirm companion is connected and paired.
2. Confirm active project exists and has a registered `projectId`.
3. Ask Premiere to save the active project.
4. Check the result of `saveActiveProject()`.
5. Wait until the `.prproj` file is stable.
6. Create snapshot through the companion using `projectId`.
7. Show clear operation stages:

   * Saving Premiere project
   * Waiting for file to stabilize
   * Copying project
   * Verifying snapshot
   * Writing metadata
   * Save point created
8. Refresh history.
9. Display actionable errors instead of only “companion unreachable.”

Do not claim success if snapshot creation returns `created: false` due to identical content. Show:

```text
No file changes detected since the last save point.
```

## 7. Make snapshot storage trustworthy

The current object-store flow hashes the live project and copies it afterward. Premiere may modify the project between hashing and copying.

Replace the workflow with a stable, verified flow:

1. Wait for file stability.
2. Copy the source to a UUID-named temporary file.
3. Hash the temporary copy.
4. Optionally compare source metadata again.
5. Use the temporary-copy hash as the canonical object hash.
6. Publish the object atomically or exclusively.
7. Verify any existing object before reusing it.
8. Write the snapshot manifest only after the object exists and passes validation.
9. Remove temporary files after success or failure.
10. Lock snapshot operations per project to prevent concurrent races.

Avoid PID-only temporary names.

Use `randomUUID()`.

Do not save a manifest that references a missing or incomplete object.

## 8. Fix restore-as-copy completely

The active `.prproj` must never be overwritten.

Current UI passes the project file path as `destinationDirectory`. Fix it.

Restore API should receive:

* `projectId`
* `snapshotId`
* Valid destination directory

Default destination may be the parent directory of the active project, but the user should be able to choose another directory.

Restore requirements:

* Verify the stored object hash before copying
* Generate a sanitized filename
* Limit filename length
* Reject path separators in labels
* Use an exclusive destination
* Never overwrite existing files
* Copy to a UUID-named temporary file
* Verify temporary file hash
* Publish atomically where supported
* Clean temporary files on failure
* Reject restoring to the source object
* Reject path aliases, symlinks, junctions, and case-insensitive same-path variants
* Return the final restored path

Rename the UI button:

```text
Restore as Copy
```

The current panel calls:

```text
$._editvcs.reopenProject(...)
```

but that host function does not exist.

Either:

* Implement and test a supported Premiere project-opening method, or
* Remove automatic reopening and instead offer:

  * Reveal in Explorer/Finder
  * Copy restored file path

Do not call missing host functions.

## 9. Connect manifest collection and diffing

A diff library exists, but the working snapshot flow currently stores empty sequence metadata and `/changes` returns an empty object.

Connect the existing CEP host script timeline extraction to snapshot creation.

Flow:

1. Before creating a save point, call the CEP ExtendScript function that reads timeline state.
2. Parse the returned JSON.
3. Validate it with a schema.
4. Send the manifest with the snapshot request.
5. Store it in snapshot metadata.
6. Implement:

```http
GET /changes?from=<snapshotId>&to=<snapshotId>
```

7. Use the existing diff engine.
8. Return structured groups plus a human-readable summary.

Minimum supported changes:

* Added sequence
* Removed sequence
* Sequence duration changed
* Added clip
* Removed clip
* Trimmed clip
* Moved clip
* Track changed
* Renamed sequence where identity is trustworthy

Match sequences by stable ID first and by name only as fallback.

Match clips by stable fingerprint. Clearly label results as:

* Verified metadata
* Best-effort inference
* Metadata unavailable

Do not fabricate clip-level changes when Premiere metadata is insufficient.

## 10. Fix version streams or hide them

Current version streams are persisted records, not functional branching.

A real version stream must include:

* Stream ID
* Project ID
* Name
* Base snapshot ID
* Head snapshot ID
* Created timestamp
* Updated timestamp
* Active status or project-level active stream pointer

Required behavior:

* Create stream from an existing snapshot
* Set active stream
* New snapshots attach to active stream
* Parent snapshot points to current stream head
* Stream head updates after save point
* Switching stream changes future save-point ancestry
* Stream data uses the same configured storage root as snapshots
* All route bodies are schema-validated

If this cannot be completed in the current pass, disable “New Version” and “Switch” buttons and label version streams as planned.

Do not leave clickable controls without handlers.

## 11. Move automatic snapshots into the companion

Do not watch the project from the CEP panel.

The companion should own:

* File watcher lifecycle
* Stable-write detection
* Debouncing
* Duplicate suppression
* Per-project locking
* Start/stop watcher state
* Companion restart recovery

Add authenticated endpoints such as:

```http
POST /projects/:projectId/watch/start
POST /projects/:projectId/watch/stop
GET /projects/:projectId/watch/status
```

Automatic snapshot behavior must be disabled by default until tested.

Tests should cover:

* Rapid consecutive saves
* Temporary zero-byte states
* File rename/replace behavior
* Project moved or deleted
* Companion restart
* Duplicate changes
* File still changing after timeout
* Watcher cleanup

## 12. Fix cloud and sync honesty

Current cloud backup endpoints return statuses without performing work.

Until implemented:

```http
POST /cloud/backup
```

must return:

```http
501 Not Implemented
```

Do not return `queued` if nothing is queued.

For GitHub/local sync:

* Treat as experimental
* Validate target paths and URLs
* Persist sync configuration safely
* Do not upload `registry.json`
* Do not upload full canonical project paths
* Do not store absolute `objectPath` values in portable manifests
* Store object hash only
* Resolve object paths from the current local repository root
* Prevent secrets or credentials from entering the synced repository
* Add a generated `.gitignore` for local-only metadata
* Explain that raw footage is never uploaded
* Add explicit user confirmation before first GitHub push

For Phase 1, it is acceptable to disable GitHub sync until privacy and portability are fixed.

## 13. Fix the CEP panel UI

Canonical production UI is:

```text
apps/premiere-panel/
```

Required UI states:

* Companion disconnected
* Companion unpaired
* Pairing
* No Premiere project open
* Unsaved Premiere project
* Project registration in progress
* Registration failed
* No save points
* Snapshot in progress
* Snapshot created
* No file changes detected
* Restore in progress
* Restore complete
* Restore failed
* Session expired
* Diff metadata unavailable

Specific UI changes:

* “Save Cut” → “Create Save Point”
* “Restore” → “Restore as Copy”
* Disable unimplemented New Version/Switch controls
* Minimum major button height: `44px`
* Outer panel padding: `16px`
* Section spacing: `12px`
* Control spacing: `8px`
* Visible keyboard focus
* Do not encode state only with color
* Use `120–180ms` state transitions
* Avoid destructive red styling for restore-as-copy
* Show operation-specific errors with Retry and Open Logs actions
* Show that source footage is not copied
* Allow restore destination selection
* Clean up watchers and timers during component unmount

Never show mock snapshots or hardcoded streams in the canonical production panel.

## 14. Keep UXP clearly experimental

`apps/premiere-plugin/` must not silently fall back to fake data in a production build.

Do one of the following:

* Move mock fallback behind an explicit development flag, or
* Show a clear “UXP prototype — not connected” screen

Add a real UXP manifest only when the UXP plugin is ready to be installed.

Do not spend Phase-1 time completing UXP while the CEP path is broken.

## 15. Fix packaging

The root script references a missing:

```text
scripts/build-zxp.js
```

Create a reproducible CEP packaging workflow:

1. Build the canonical CEP panel.
2. Validate required files:

   * `CSXS/manifest.xml`
   * `dist/index.html`
   * `jsx/hostscript.jsx`
   * `CSInterface.js`
   * Icons/assets
3. Package only required production files.
4. Sign using a certificate supplied through secure CI secrets.
5. Generate a versioned `.zxp`.
6. Never commit `.p12` or `.zxp` files.
7. Add unsigned developer installation instructions separately.

## 16. Fix configuration and storage location

`.env.example` currently implies `.editvcs` is beside the project, but the companion resolves it relative to its working directory.

Decide and implement a clear storage model.

Recommended:

```text
<project-directory>/.editvcs/
```

or a centralized user data directory:

```text
Windows: %APPDATA%/EditVCS/
macOS: ~/Library/Application Support/EditVCS/
```

Do not depend on process working directory.

Document:

* Storage location
* Backup behavior
* Cleanup behavior
* Log location
* Registry location
* Object location
* What syncs and what stays local

## 17. Add runtime schema validation

Use Zod or equivalent for:

* HTTP request bodies
* Query parameters
* Registry JSON
* Stream JSON
* Snapshot manifests
* Config JSON
* Timeline manifests
* Sync configuration

Do not cast parsed JSON directly to TypeScript interfaces.

Add schema versions and migration support.

If metadata is corrupt or newer than supported, fail with an actionable read-only recovery message instead of crashing.

## 18. Improve tests

Existing tests currently provide false confidence in some places.

Required changes:

### Pairing tests

Prove:

* `/pair/start` does not return the code
* Wrong code reduces attempts
* Sixth invalid attempt is rejected
* Expired code fails
* Used code cannot be reused
* Session expiry works
* Refresh invalidates the old token
* Revoke works
* Protected routes reject missing/invalid tokens

### Restore tests

Add assertions for:

* Active project unchanged
* Restored copy content correct
* Existing destination not overwritten
* Hash mismatch rejected
* Temporary files cleaned
* Same-path/symlink/junction rejected
* Permission error handled
* Invalid destination handled

### Snapshot tests

Test:

* Stable source copied correctly
* Source changes during snapshot
* Duplicate content
* Concurrent snapshot calls
* Corrupt existing object
* Interrupted metadata write
* Restart persistence

### CEP integration tests

Mock `CSInterface` and test:

* Pairing flow
* Registration
* Correct `projectId` usage
* Create save point
* Duplicate save point result
* Restore destination
* Error states
* Project switching
* Timer/watcher cleanup
* Session expiry

Do not limit the test to checking whether “EditVCS” renders.

### End-to-end API test

Build and start the actual compiled companion, then:

1. Check health.
2. Pair through a controlled test-only pairing provider.
3. Register dummy `.prproj`.
4. Create snapshot.
5. Modify file.
6. Create second snapshot.
7. Compare.
8. Restore as copy.
9. Restart companion.
10. Confirm history persists.

## 19. Fix CI

CI must run on:

* Ubuntu
* Windows
* macOS

At minimum:

```bash
npm ci
npm run editvcs:lint
npm run editvcs:build
npm run editvcs:test
```

Then start the actual built companion and call `/health`.

Also:

* Add Gitleaks
* Add dependency auditing with an explicit severity threshold
* Verify no `.p12`, `.zxp`, `.env`, `node_modules`, or `dist` files are tracked
* Verify CEP packaging contents
* Make CI required before merging to `main`

Do not claim “verified” or “stable” in the README until these checks pass.

# Required implementation order

Follow this exact order.

## Phase 0 — Make the repository executable

1. Fix companion build/runtime.
2. Add companion smoke test.
3. Correct root Premiere command.
4. Fix canonical CEP build/watch scripts.
5. Add packaging script.

## Phase 1 — Complete CEP-to-companion vertical slice

1. Secure pairing endpoint.
2. Add pairing UI.
3. Register active project.
4. Store project ID.
5. Create manual save point.
6. List save points.
7. Restore as copy.
8. Persist across restart.

## Phase 2 — Make storage trustworthy

1. Stable-write handling.
2. Verified temporary copy.
3. Correct hashing.
4. Atomic publication.
5. Per-project locking.
6. Schema validation.
7. Recovery tests.

## Phase 3 — Connect Premiere metadata and diffing

1. Collect timeline manifest.
2. Store manifest.
3. Implement `/changes`.
4. Show truthful Compare UI.

## Phase 4 — Streams and automatic snapshots

Only begin after the manual save/restore workflow passes.

## Phase 5 — Sync, packaging, release docs

Treat cloud and GitHub sync as experimental unless fully verified.

# Working rules

* Do not only produce a plan.
* Inspect the repository and implement the fixes.
* Work in small, reviewable commits.
* Do not rewrite working modules unnecessarily.
* Do not implement CEP and UXP simultaneously.
* Do not leave fake buttons or fake success responses.
* Do not silently catch errors.
* Do not expose raw stack traces to the panel.
* Do not upload absolute paths or secrets.
* Do not claim a feature works without a test or manual verification step.
* When unsure whether a Premiere API exists, verify against Adobe documentation instead of inventing a method.
* Preserve local-first behavior.
* Never store or upload source footage in Phase 1.
* Never overwrite the active `.prproj`.

# Deliverables

Produce these deliverables while working:

1. `IMPLEMENTATION_STATUS.md`

   * Every issue
   * Fixed/not fixed
   * Files changed
   * Verification evidence
   * Remaining risks

2. `docs/architecture.md`

   * Canonical CEP architecture
   * Companion service
   * Pairing
   * Project registry
   * Snapshot lifecycle
   * Storage format
   * Restore lifecycle
   * Manifest/diff flow

3. Updated `README.md`

   * Honest maturity labels
   * Exact setup commands
   * Known limitations
   * Compatibility matrix

4. Automated tests

5. CI workflow

6. Working CEP build/package process

# Final acceptance criteria

Do not say the task is complete until all of these pass:

```text
[ ] npm ci succeeds on a clean checkout
[ ] npm run editvcs:lint succeeds
[ ] npm run editvcs:build succeeds
[ ] npm run editvcs:test succeeds
[ ] Built companion starts without runtime import errors
[ ] /health returns 200
[ ] Pairing code is not returned over HTTP
[ ] CEP panel can pair
[ ] CEP panel detects active Premiere project
[ ] Project registration returns a persistent UUID
[ ] Manual save point is created
[ ] Save point appears in history
[ ] Duplicate project content is handled honestly
[ ] Second changed save point is created
[ ] Diff endpoint returns truthful results or unsupported state
[ ] Restore produces a separate verified copy
[ ] Existing files are never overwritten
[ ] Active project remains untouched
[ ] Restart retains registration and snapshots
[ ] Unimplemented buttons are removed or disabled
[ ] UXP prototype is clearly marked experimental
[ ] CEP package can be produced reproducibly
[ ] README matches actual functionality
```

At the end, provide:

* Exact commands run
* Test results
* Build results
* Manual checks still required inside Premiere
* Remaining known limitations
* A clear recommendation: not ready, alpha-ready, or production-ready

Start by inspecting the latest `main` branch and creating a short implementation checklist. Then immediately begin Phase 0. Do not stop after the checklist.
