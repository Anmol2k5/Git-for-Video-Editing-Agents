# Local-first Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Correct the confirmed local-first release defects without claiming untested Premiere or cloud readiness.

**Architecture:** Keep the CEP panel and loopback companion architecture. Preserve the snapshot layout, content-addressed objects and exclusive restore-as-copy. Harden persistence and trust boundaries, then prove the panel and packaging contracts with regressions.

**Tech Stack:** TypeScript, React, Express, npm workspaces, Vitest, Node.js.

**Spec:** `docs/production-readiness.md` (approved local-first scope).

## Global Constraints

- Work in the existing isolated cloud checkout on branch `work`; preserve user changes.
- No cloud provider, production UXP migration, automatic-snapshot UI, or installer/signing credential provisioning.
- Keep UUID and legacy `proj_*` project IDs compatible; reject path separators and traversal.
- Never overwrite active projects or log signing secrets. Keep TLS and package integrity verification enabled.
- Live Premiere and Windows/macOS installation remain explicit external release gates.
- Implement inline, use a fresh independent final reviewer, and leave changes uncommitted for user review.

## Review Focus

- Out-of-order project registration must never associate one project's metadata with another's bytes.
- Concurrent and failed persistence must preserve previous valid JSON and avoid phantom registered mappings.
- Metadata-unavailable snapshots must not produce fabricated sequence removals or verified claims.
- Failed companion startup and watcher shutdown must not hang or leak owned resources.
- Packaging failure, including signer stderr, must not disclose certificate passwords.

### Task 1: Persistence and storage boundaries

**Files:** `packages/storage/src/{write-json,local-repository,schemas}.ts`, `apps/companion-service/src/project-registry.ts`, corresponding new regression tests.
**Interfaces:** Preserve `writeJsonAtomic(filePath,data): Promise<void>`, `ProjectRegistry.validateAndRegisterPath(inputPath): Promise<string>`, repository snapshot APIs.
- [x] Write/run failing tests for unequal concurrent JSON writes, concurrent duplicate/different registrations, corrupt registry preservation and traversal/hash rejection.
- [x] Use unique exclusive temp files, cleanup and file sync; serialize registrations, commit memory after successful disk persistence; validate registry wholly and reject corruption.
- [x] Validate safe ID segments and SHA-256 hex before deriving filesystem paths; rerun storage and registry regressions.

### Task 2: Metadata trust and comparison

**Files:** `apps/companion-service/src/snapshot-service.ts`, `packages/diff-engine/src/premiere-diff.ts`, new metadata/diff tests.
**Interfaces:** Preserve snapshot statuses `verified | best-effort | unavailable` and API output shape.
- [x] Write/run failing tests for best-effort preservation, absent/unavailable metadata, private path hints, UTF-8 byte limit and duplicate sequence names with distinct IDs.
- [x] Sanitize manifest hints, preserve weaker trust, use byte limits and schema validation; prefer stable sequence IDs with one-to-one name fallback and assess both sides' coverage.
- [x] Rerun metadata and diff regression suites.

### Task 3: API and watcher lifecycle

**Files:** companion `server.ts`, `file-watcher.ts`, `server-start.ts` as needed and regression tests.
**Interfaces:** Keep `createServer({port,storageRoot})` returning an HTTP server; extend its close lifecycle to drain owned watchers.
- [x] Write/run failing tests for malformed/oversized JSON, sanitized internal/health errors, invalid project query IDs, unavailable comparisons, bind failure, pending watcher changes and shutdown cleanup.
- [x] Classify public errors; suppress unsafe details; skip structural comparison when metadata is unavailable; reject listener errors; drain changes and close owned watchers.
- [x] Rerun companion regression tests and the existing integration suite.

### Task 4: Panel, host bridge and safe startup

**Files:** CEP `App.tsx`, `engine.ts`, pairing hook/components, schemas, JSX, diff component; new rendered UI, engine and JSX tests.
**Interfaces:** Companion client keeps its existing public methods; panel recognizes a real `window.__adobe_cep__` bridge rather than SDK presence alone.
- [x] Write/run failing rendered-flow tests for manual pairing/cancel, failed and stale project switches, closed projects and save identity checks. Add JSX VM tests for tick-string frame rate and failed save return codes; engine tests for timeout/startup errors.
- [x] Wire manual pairing; clear stale IDs/history during registration; guard asynchronous results and confirm host path before capture. Remove fabricated browser metadata. Align confidence labels and disable unsupported controls.
- [x] Correct dev bundle path; choose an explicit external supported Node executable (configured path or PATH `node`), handle child errors and request timeouts, and show truthful startup remediation.
- [x] Rerun panel and companion integration tests.

### Task 5: Dependencies, packaging, docs and integration

**Files:** npm manifests/lockfiles, `scripts/build-zxp.js`, packaging helper/tests, CEP PNG/icon references, README/setup/architecture/readiness docs.
**Interfaces:** Preserve `npm ci`, `npm run verify`, `npm run package:cep:unsigned` and optional signed entry points.
- [x] Remove unused simple-git; update patched Zod/Vite/Vitest and compatible transitives; keep workspace resolution consistent and remove unsafe Zod cast.
- [x] Write/run failing packaging tests for missing backend and credential-safe signer failure. Build the companion, require package assets, use actual PNG bytes, safe process arguments and sanitized signer failure output.
- [x] Run frozen install, build packages then `npm run verify`, npm audits, unsigned packaging and smoke test. Inspect package contents.
- [x] Independent whole-diff review; resolve important findings with regression tests; update audit with applied fixes and remaining real-host release work.
