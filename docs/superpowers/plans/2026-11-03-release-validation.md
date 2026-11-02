# Local Release Validation Follow-up Plan

> **For agentic workers:** Use superpowers:executing-plans inline. Preserve the previous hardening changes and add regression evidence before implementation.

**Goal:** Close the three deferred diagnostics/persistence items and make local release validation prove the process, bytes, restore and restart behavior.
**Architecture:** Preserve the existing local-first CEP/companion workflow. Distinguish expected path errors from internal failures, deduplicate private health diagnostics, and replace the fixed-port health-only smoke test with an isolated authenticated functional run.
**Tech stack:** TypeScript, Express, Vitest, Node test runner and existing npm workspaces.
**Spec:** `docs/production-readiness.md`; user instructed “keep implementing”.

## Global constraints

- Existing checkout/branch and uncommitted work stay intact. No publish, push, cloud implementation or production UXP migration.
- Keep snapshot format and public successful-response shapes compatible.
- Never expose internal persistence details to API clients; keep actionable expected path validation errors.
- Smoke tests own only their child processes and temporary storage; never stop an existing service.
- Windows/macOS Premiere, CEP/CEF rendering and successful signed installation remain external release gates.

## Review focus

- An unexpected registry I/O failure must be a safe 500, not a leaked 400.
- Repeated concurrent health failures must log actionable private details without flooding logs; recovery permits a future failure to be logged again.
- A desktop file-origin CEP panel must pass CORS while protected endpoints still require a session; unrelated web origins stay denied.
- An already-running healthy service or a dead spawned child must never satisfy smoke readiness.
- Actual child restart must retain history, reject old tokens and preserve active/restored bytes.

### Task 1: Deferred diagnostics and persistence cleanup

- [x] Add failing HTTP tests for registration disk failure versus expected path failure, malformed payloads, deduplicated/recovered health diagnostics.
- [x] Add a typed `InvalidProjectPathError`; route only expected path failures to 400 and let unexpected I/O use sanitized 500 handling. Remove the unused unqueued public registry save method.
- [x] Log private health failure transitions once per changed failure, reset on recovery, and rerun companion regressions.

### Task 2: Desktop extension request and package contract

- [x] Reproduce null Origin rejection and test 200 health/preflight plus 401 unauthenticated protected data; retain 403 for unrelated origins.
- [x] Allow the literal opaque desktop origin without expanding named web origins; use a public-safe denied-origin response.
- [x] Check the packaged Premiere host version range against the documented 2023+ floor; correct the manifest and add package validation for a supported host range.

### Task 3: Trustworthy process smoke validation

- [x] Reproduce the old smoke script accepting an unrelated healthy process after its child exits. Add negative child-start/readiness/deadline tests.
- [x] Export an isolated smoke runner using a temporary root, available loopback port, random bootstrap sessions, bounded requests and owned-process cleanup.
- [x] Exercise registration, snapshot A/B, content deduplication, restore-as-copy and actual process restart with retained history and invalid old session.
- [x] Include runner regressions in the root test command. Run full verify, full npm audit, unsigned packaging and smoke against the shipped bundle; obtain independent final review and update readiness evidence.

Additional confirmed regressions addressed: concurrent health probe filename collisions; dead/recent and live/old PID owner detection; smoke graceful-shutdown crash/hang false positives. CI artifact retention is configured; remote CI and Windows/macOS Premiere acceptance were not executed.
