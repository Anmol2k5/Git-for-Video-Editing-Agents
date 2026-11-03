# Production readiness audit — 2026-11-02

Baseline: `9b121263621645e4662a10e7a61a58e44b75a161`.

## Implementation delivered

Further verified fixes completed on 2026-11-04:

- Process ownership is exclusive across independent processes, atomically published and checked before listening. Heartbeats/release cannot replace another owner, ambiguous records fail closed, ownership loss triggers nonzero shutdown, and shutdown awaits actual request/watcher draining.
- Snapshot reads/publication validate containment, regular files, metadata identity, object hashes/sizes and immutable IDs. Corrupt inputs stay available for recovery; warnings are bounded/deduplicated. New history is blocked when recovery is required, and failed snapshots clean temporary copies.
- Local/Git sync helpers transfer the current snapshot layout, recurse existing prefixes and exclude private registry/log data. Git errors/counts/push targets and byte preservation are validated using local bare repositories. The release sync/cloud endpoints remain explicitly unavailable.
- Panel authorization is proved against protected APIs; disconnect and obsolete pairing, diff, restore, save and supervisor responses cannot revive or overwrite newer state. Native save/metadata operations are bound to the expected project path.
- CEP frontend now targets Chromium 88 using compatible Tailwind 3/PostCSS output. Built-resource and CSS compatibility gates plus a real installed-Chromium browser boot/style/save regression are automated. Adobe CEP itself is still an external acceptance gate.
- UXP production mode is an explicitly unavailable prototype with honest connection/tracking/stream state and disabled unwired actions. Demo fixtures require an explicit flag; the client uses the actual two-step pairing/project-ID contracts.
- Functional process smoke now restores both stored A and B after restart.


The approved local-first hardening is implemented in the working tree. The findings table below records the **pre-fix baseline**, not a list of defects all still outstanding.

- Unique exclusive JSON temp files, file sync/cleanup, serialized durable registration and fail-closed corrupt-registry loading prevent the reproduced metadata races and phantom registrations.
- Safe identifier/hash schemas protect storage paths; existing UUID/proj_* identifiers and snapshot layout remain compatible.
- Actual rendered panel tests cover manual pairing start/completion/cancel/expiry, failed and stale project registration, closed-project polling, pre-save identity checks and delayed save/history responses after switching projects. Fabricated browser projects/metadata are removed.
- Host save return codes are respected; ticks-per-frame converts to numeric frame rate; stable sequence IDs survive host serialization. CEP detection requires the native bridge. Startup uses a standalone Node executable, handles child errors, verifies bootstrap authorization and bounds HTTP requests.
- Metadata confidence is preserved, path hints are sanitized and UTF-8 limits enforced. Active-sequence-only captures stay best-effort. Unavailable and partial comparisons no longer invent sequence removals; self-comparisons retain metadata confidence; duplicate sequence names use stable identity.
- Malformed/oversized JSON returns 400/413. Unexpected global API errors and public health errors omit internal details. Bind errors reject startup. Watchers drain pending changes, share concurrent startup and serialize stop/restart ownership; server close waits for owned watchers.
- Vulnerable unused simple-git is removed; patched Zod 4, Vite/Vitest and compatible transitives are locked. The root lockfile is authoritative; the obsolete nested panel lockfile is removed.
- Packaging builds/requires the companion and actual PNG, validates staged assets, aligns package version metadata and avoids shell interpolation for ZIP paths. Signing failures suppress command arguments and signer output that could contain passwords. The signer still requires argv input; protection from local process inspection is not claimed.
- README/setup instructions now describe the implemented local workflow and explicitly unavailable cloud/streams and experimental UXP functionality.

An independent whole-change review found four additional important issues (duplicate watchers, late save/history state, incomplete sequence coverage and self-comparison confidence). Each was addressed with a regression that reproduced the failure. Final validation results are recorded below.

### Latest validation evidence — 2026-11-04

Validated in this Linux cloud checkout with Node 24.19.0/npm 11.9.0:

| Check | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Passed with the root lockfile |
| `npm run editvcs:build:packages` | Passed |
| `npm run verify` | Repository verification, all TypeScript checks, all workspace builds and all tests passed |
| Workspace Vitest suites | 206 tests passed: companion 70, CEP 39, UXP 20, core 5, diff 17, adapters 2, shared types 2, storage 51 |
| `node --test scripts/packaging.test.js` (included in verify) | 3 tests passed |
| `node --test scripts/companion-smoke.test.js` (included in verify) | 6 tests passed, including unrelated-listener, dead/hung-child, graceful failure and real process lifecycle cases; all process smoke cases passed, with no skipped tests |
| `npm run test:cep-compat` (included in verify) | 2 built CSS/resource compatibility tests passed; full verify total 217/217 |
| `npm run test:cep-browser` | 1 real Chromium build/render/save test passed; 218 total automated checks including browser |
| `npm audit --json` | 0 reported vulnerabilities across production and development dependencies |
| `npm run package:cep:unsigned` | Passed; complete bundle under `release/EditVCS-CEP`, ZIP at `release/EditVCS-CEP-unsigned.zip` |
| `node scripts/companion-smoke-test.js` | Owned bundled process/session verified; snapshot A/B, deduplication, restore bytes, clean IPC shutdown/PID release, crash recovery, retained registry/history and expired old sessions passed |

The initial independent review's four important findings and the related watcher stop/start overlap are fixed. The follow-up review's graceful-shutdown false positive is also fixed. New regressions were observed failing before their fixes; a mutation check also proved the delayed-history guard is covered. Targeted reproduction runs excluded unrelated cases by name; the latest full run executed all 217 verification tests without skips, plus the separate passing browser test.

### Follow-ups completed on 2026-11-03

1. Expected project-path errors now use a dedicated typed error and safe 400 response. Unexpected persistence errors go through the sanitized 500 path, and malformed registration bodies use the standard validation response.
2. Private health failures are logged once per changed failure and logged again after recovery. Unique exclusive probe files eliminate the reproduced false 503 responses from concurrent healthy checks.
3. The unused, unqueued public registry-save method is removed. All production registrations retain serialized commit-after-persistence behavior.

The extension API now accepts the literal opaque `Origin: null` used by a file-loaded CEP panel, while project APIs still require bearer authentication and unrelated web origins receive a safe 403. Packaging validates the documented Premiere 2023+ host range `[23.0,99.9]`; this corrects the previous exact `15.0` declaration but does not prove compatibility with each embedded CEF version.

The old fixed-port health-only smoke test was reproduced falsely passing when its own companion failed with EADDRINUSE and an unrelated healthy server was listening. Its replacement uses disposable storage and a free port, checks the live owned PID plus a random authenticated session, verifies snapshot A/B and deduplication, restores A without altering active B, restarts the actual process, rejects old sessions, and verifies retained registry/history after both graceful shutdown and a forced crash. Dead PIDs are stale immediately even with fresh heartbeats; live PIDs are retained even with old heartbeats.

An independent follow-up review identified a shutdown false positive. Negative actual-bundle wrappers now prove that a shutdown crash or hang fails validation. The explicit graceful phase requires a private parent IPC shutdown, clean exit code 0 with no signal/force escalation, and PID-file removal. The finally-cleanup path can still terminate only its owned child forcibly within a deadline. No remote shutdown API was added. The CI workflow will retain the unsigned developer ZIP as an artifact after its selected job passes; no remote CI run or upload was performed here.

The former optional B-restore coverage is now included: both persisted snapshots are restored after restart and their bytes checked independently, while the active project remains B. Synthetic files still do not replace real Premiere project-opening acceptance.

## Verdict and scope

EditVCS is a pre-alpha implementation with a working automated local snapshot/restore slice. It is not ready for a public production release. The original audit baseline passed 52 tests but missed important flows/failure cases. The latest expanded validation above covers 218 automated checks including a real browser on Linux with Node 24.19.0/npm 11.9.0. No live Premiere acceptance test or Windows/macOS installer test was performed here.

The review covers all applications and shared-package subsystems, host bridge scripts, packaging, CI, dependency manifests and existing tests/documentation. Adobe's vendored CSInterface implementation and generated/vendor assets are not independently security-audited. This is a source review with targeted runtime reproductions, not a penetration-test certification.

## Confirmed findings

| Priority | Finding and evidence | Required correction |
| --- | --- | --- |
| P0 | `packages/storage/src/write-json.ts` shares one temporary path per process. Concurrent writes reproduced both ENOENT failures and malformed final JSON. Twenty concurrent project registrations produced nineteen failed requests. | Unique, exclusively created temporary files with cleanup; serialize registry persistence and publish in-memory mappings only after persistence succeeds. |
| P0 | `apps/companion-service/src/project-registry.ts` logs malformed registry JSON and proceeds with empty/partial mappings. Subsequent registration can overwrite the only copy of existing mappings. | Fail startup on corruption; validate the whole file before adopting records; preserve the original bytes. |
| P0 | `apps/premiere-panel/src/App.tsx` changes the displayed path before registration succeeds and retains the old project ID/history on failure. An actual TSX/jsdom harness reproduced B displayed with a save request for A's ID and B's metadata. Closing a project is ignored by polling. | Clear stale identity/history before registration, guard asynchronous results, and recheck the active host project before saving. |
| P1 | `apps/premiere-panel/src/App.tsx` never calls `handleStartPairing`; `ensureRunning()` returns false for an externally running, unpaired companion. Users cannot reach code entry through the rendered UI. Cancel is a no-op. | Wire start, complete, cancel and expiry; test the actual rendered manual-pairing flow. |
| P1 | `apps/companion-service/src/snapshot-service.ts` promotes every accepted manifest to `verified`, even when requested as best-effort/unavailable. Reproduction stored best-effort as verified. Full private path hints also survive unchanged. | Preserve caller confidence, downgrade missing/invalid metadata, enforce UTF-8 byte limits, sanitize project/media hints before persistence. |
| P1 | CEP browser fallback in `App.tsx` registers a fabricated Windows path and constructs synthetic verified metadata. Checking `window.CSInterface` alone also mistakes the loaded SDK for an active CEP bridge. | Detect a real CEP bridge; browser mode must not register fictional projects or publish fabricated trusted metadata. |
| P1 | `apps/premiere-panel/jsx/hostscript.jsx` emits `seq.timebase` as `framerate`; Premiere supplies a ticks-per-frame string, while `src/schemas.ts` requires a number. Actual JSX output with a representative string failed schema validation in a VM reproduction. Save bridge ignores nonzero failure return codes. | Convert ticks-per-frame to frames-per-second, catch host errors, and honor save failures. |
| P1 | `apps/companion-service/src/server.ts` compares fallback empty manifests as real structural changes. A verified snapshot versus an automatic metadata-unavailable snapshot can falsely report removed sequences. UI confidence badge values also disagree with API values. | Do not infer changes when either manifest is unavailable; show an explicit unavailable state and align badge labels. |
| P1 | Unexpected exceptions return their raw messages in HTTP 500 responses; unauthenticated `/health` can expose filesystem errors. Malformed JSON reproduced HTTP 500 instead of 400. | Public-safe error messages; classify JSON parse/size errors; keep internal diagnostics server-side. |
| P1 | Server startup waits only for `listening`, not `error`; bind failures are not cleanly propagated. Watchers are not closed with the server. Changes arriving during snapshot processing are discarded by the watcher. | Reject startup errors, close owned watchers on shutdown, and drain pending stable changes. |
| P1 | `scripts/build-zxp.js` builds only the frontend and merely warns when backend output is missing. It writes SVG bytes into a file named `icon.png`. | Build/require the companion before packaging; validate required package contents and use a real PNG. |
| P1 | Signed packaging passes the certificate password as an argument, then logs `err.message` on failure. Node includes the full failed command/arguments in that message; a harmless sentinel reproduction confirmed disclosure. | Never log the failed command, arguments, error message or signing subprocess output containing credentials; report a fixed public-safe failure. Prefer a protected input channel if supported by the signing tool. |
| P1 | `engine.ts` uses the CEP process executable as if it were a supported Node executable; dev companion relative path is wrong; child `error` events are unhandled and output is discarded. | Correct dev resolution, handle process errors, provide actionable manual Node startup guidance. Bundled-runtime installation still needs real host validation. |
| P1 | npm audit reports 6 affected production package entries (3 critical, 2 high, 1 moderate), 11 including development tooling. Affected names include simple-git/argv-parser, proxy-addr, body-parser, qs, zod, Vite and Vitest. simple-git is unused by source code. Advisory severity is not proof each exploit is reachable in this loopback application. | Remove unused vulnerable simple-git, update compatible transitive dependencies/tooling, migrate Zod to a patched supported version with regression coverage. Recheck audits after updates. |
| P2 | Project IDs passed into storage paths are not constrained; snapshot hashes validate length rather than hex characters. | Validate safe path segments and content hashes at boundaries without breaking existing UUID/proj_* IDs. |
| P2 | `packages/diff-engine/src/premiere-diff.ts` matches sequences by ID OR name. Two distinct sequences with the same name produce added/removed clips when compared to themselves; confidence checks only the after-state. | Prefer stable IDs with one-to-one matching; use name fallback only when identity is unavailable; evaluate metadata coverage on both sides. |
| P2 | Experimental buttons in CEP have no handlers; UXP declares a connected/tracked state without consulting the companion and is mostly a UI scaffold. | Disable unsupported CEP controls with clear labels; keep UXP explicitly experimental and outside release claims. |
| P2 | README advertises automatic save points, but neither panel starts the watch API. | Correct release claims; a user-facing automatic-snapshot lifecycle needs explicit implementation/acceptance before being advertised. |
| P2 | Local/NAS sync copies obsolete `manifests/` rather than current `projects/<id>/snapshots/`, and skips new child files inside a hash-prefix directory already present at the destination. GitHub sync stages the whole root, including private registry paths. Cloud queue is in-memory only. | Keep sync/cloud unavailable until a separate durable, privacy-reviewed design and end-to-end tests are implemented. |

## Approved implementation boundary

Recommended default: correct the existing Phase-1 local-first workflow defined in `IMPLEMENTATION.md`, add regressions for the confirmed failures, harden dependencies and release packaging, and update user-facing readiness claims. Preserve snapshot compatibility and restore-as-copy semantics. Do not implement a cloud provider, production UXP migration, installer distribution or signing credentials as incidental fixes.

Alternatives:

1. **Local-first hardening (recommended):** shortest route to a trustworthy Premiere beta; cloud and version streams remain explicitly unavailable.
2. **Local plus production cloud:** additionally requires provider/authentication decisions, durable upload state, integrity/conflict handling, privacy controls and recovery tests. This is another project, not a flag that enables the existing stubs.
3. **All runtimes at once:** includes wiring and validating the UXP application and broadens host compatibility/testing considerably. Not recommended before the canonical CEP workflow is proven.

## Initial release planning estimate

These are planning ranges for one experienced developer with access to Premiere on both operating systems, not measured completion percentages or delivery promises:

- Automated code hardening and regression coverage: approximately 5–10 working days, depending on dependency migration and failures uncovered.
- Companion runtime distribution, signed packaging, clean-machine Windows/macOS installation and real Premiere acceptance/fixes: approximately 5–10 more working days.
- Production cloud backup, if required: approximately 4–8 additional weeks, depending on provider, account model, security requirements and conflict/recovery policy.

A reasonable initial local-first release budget is **2–4 working weeks**, subject to live host findings. Passing Linux tests does not remove the host/distribution work. No percentage is claimed because there is no weighted production acceptance suite.

## Release acceptance

- Frozen-lockfile install; repository verification, type checks, all builds/tests and unsigned package inspection pass.
- New regressions reproduce the original defects and pass after fixes.
- Pairing, expired sessions, registry corruption, concurrent registration, honest metadata and unavailable comparisons are covered.
- Restore verifies bytes, avoids overwrites, survives missing originals, and leaves active projects unchanged.
- On actual Windows/macOS Premiere installations: extension loads, runtime starts, pairing succeeds, project switches/unsaved projects/save failures are handled, snapshot captures current bytes, history survives restart, diff limitations are truthful, and restore opens a valid independent project.
- Signed package/install/update/uninstall and companion lifecycle are validated on clean supported machines.
- Cloud, streams, After Effects and UXP are not advertised as production functionality until separately implemented and accepted.

## Current release gates

The automated local-first hardening is implemented. Production release remains blocked on actual supported Windows/macOS Premiere installations, actual native CEP/CEF rendering and host compatibility, standalone Node discovery/runtime distribution, signed install/update/uninstall and real project acceptance. No Windows/macOS, Premiere or successful certificate signing run occurred here. Changes are maintained on the feature branch; no successful remote CI result is asserted for this latest pass. Cloud, streams, After Effects and production UXP remain unsupported rather than silently enabled.

Final independent review reproduced a Git privacy bypass through merge-commit trees. Both history checks now inspect every distinct reachable tree, including merges/all parents, with replacement objects disabled. A local bare Git regression confirms refusal before any ref/private blob transfer. No other Critical/Important findings were established in this review.
