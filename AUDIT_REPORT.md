# Audit Report — EditVCS

**Repository:** Anmol2k5/Git-for-Video-Editing-Agents  
**Branch/commit:** main / `d8569fcc3d83968c10c2c6ab9f8b96430d3ec5d3`  
**Audit date:** 2026-10-23  
**Method:** GitHub connector source inspection and GitHub Actions execution evidence. Local `git clone` was attempted but failed because the audit container could not resolve `github.com`. No direct local npm execution or live Adobe Premiere session occurred. These limitations matter.

## 1. Summary

**Product:** EditVCS — a Premiere Pro CEP panel and local Node/Express companion for save-point snapshots, browsing versions, diff summaries and safe restore-as-copy. Monorepo contains `apps/premiere-panel`, `apps/companion-service`, `apps/premiere-plugin`, and shared packages (`package.json:5-8`).

**Verdict:** Core automation and library code show significant implementation and the last full CI matrix passed, but full end-to-end Adobe integration and a polished public release are **not verified**. A development demonstration is plausible; production-ready is **not demonstrated**. Do not claim a percentage completion without a feature-weighted acceptance suite.

**Largest risks:** (1) an unproven CEP companion auto-launch path, (2) cloud/sync/streams intentionally return 501, (3) experimental buttons have no handlers, (4) browser/non-CEP mode can mark fabricated timeline metadata as verified, (5) absent live Premiere acceptance evidence. See exact source references below.

## 2. Build/Run/Test Results

- **Attempted direct checkout:** `git clone --depth 1 https://github.com/Anmol2k5/Git-for-Video-Editing-Agents.git` → `fatal: unable to access 'https://github.com/Anmol2k5/Git-for-Video-Editing-Agents.git/': Could not resolve host: github.com`. Consequently `npm ci`, `npm run verify`, direct lint, tests, local server, and interactive Premiere testing were **not executed in this audit**. Do not conflate this infrastructure/network failure with a project failure.
- **Verified historical CI, same commit:** GitHub Actions **CI run 31021537476**, August 5, 2026, concluded **success**. All six jobs: Ubuntu, Windows, macOS × Node 20.19.x and 22.x. Each job reports success for `npm ci`, `verify:repository`, package build, lint, full build, tests, unsigned CEP packaging, and companion smoke test. Workflow commands: `.github/workflows/ci.yml:12-46`. Run: https://github.com/Anmol2k5/Git-for-Video-Editing-Agents/actions/runs/31021537476 . Historical pass is not a fresh local rerun and is not live Premiere acceptance.
- **Last security workflow:** Gitleaks run **38107064453** on October 11, 2026 concluded success, same SHA: https://github.com/Anmol2k5/Git-for-Video-Editing-Agents/actions/runs/38107064453 . This is **not** a complete build/test run.
- **Declared commands:** root `package.json:10-25` wires workspaces, build, tests, lint, companion, panel and package scripts. `apps/companion-service/package.json:8-14` uses esbuild, TypeScript and Vitest. `apps/premiere-panel/package.json:7-13` uses Vite, TypeScript and Vitest.
- **Live Premiere launch and visual inspection:** Not verified; requires supported host runtime, signing/installation and manual test matrix. `README.md:19-26` documents CEP runtime and requirements.

## 3. Critical Issues (breaks core functionality or promised workflows)

- [ ] **HIGH — `apps/premiere-panel/src/engine.ts:244-268`**: CEP auto-start resolves `server/companion.cjs` then spawns with `process.execPath`. Whether CEP's embedded Node `process.execPath` reliably points to a usable Node executable across Premiere/OS/install packaging is **not verified**. Package/release a known Node runtime or installable companion with validated executable selection, process logs, installer/launcher tests on Windows/macOS. Reproduce inside real Premiere before treating as confirmed breakage.
- [ ] **HIGH — `apps/premiere-panel/src/App.tsx:368-374`**: Non-CEP fallback constructs a fabricated `Film.prproj` / `Main Edit` manifest and submits it with status `verified`. A browser/dev demonstration can present synthetic data as trustworthy. Mark `mock`/`unavailable`, visibly label demo output, and prevent production snapshots from containing synthetic verified manifests.
- [ ] **HIGH FOR CLOUD USERS — `apps/companion-service/src/server.ts:320-348`**: Cloud status/backup, sync/config, and streams endpoints return HTTP 501 intentionally. Implement with durable credentials, retry/recovery, and integration tests before enabling related controls or advertising them as usable. Core *local* snapshot/restore does not depend on these routes.
- [ ] **HIGH — `apps/premiere-panel/src/engine.ts:257-280`**: Auto-start reports failure when executable path is missing or service isn't reachable within 10 × 500 ms; there is no user-facing remediation on this code path. Verify deployment layout and provide actionable install/diagnostic UI. Live runtime failure remains unverified.

## 4. Broken / Non-Working Features

- [ ] **CONFIRMED — `apps/premiere-panel/src/App.tsx:560-568`**: Experimental **New Version** and **Push** buttons have no `onClick` or other action; remove/disable with `Coming soon` or implement and integration-test.
- [ ] **CONFIRMED — `apps/companion-service/src/server.ts:321-348`**: Cloud and version-stream APIs are deliberate 501 stubs (specific endpoints described above).
- [ ] **UNVERIFIED — `apps/premiere-plugin/src/App.tsx:19-51`**: Separate plugin UI consumes a passed-in `host` object, has explicit mock mode and merely toggles a save-point dialog. Validate the runtime entry point and native host callbacks before presenting this alternative plugin as production-integrated.
- [ ] **UNVERIFIED — `apps/premiere-panel/src/App.tsx:338-367`**: Actual Premiere `evalScript` save + timeline extraction cannot be accepted solely on CI; exercise nested sequences, linked media, unsaved projects, and host API errors in Premiere.

## 5. Hardcoded Values & Mock Data

- [ ] `apps/companion-service/src/config.ts:29-34` — companion port 8731 and dev port 5173 are **configurable defaults**, not unconditionally hardcoded bugs; document supported overrides.
- [ ] `apps/premiere-panel/src/engine.ts:71` — loopback URL is expected for local companion; use a centrally defined validated service endpoint if supporting alternate ports.
- [ ] `apps/premiere-panel/src/hooks/usePairing.ts:78-80` — revoke URL constructs loopback service address from `COMPANION_PORT`; centralize requests in the companion client for consistency.
- [ ] `apps/companion-service/src/server.ts:41-63` — dev CORS origins are built from configured dev port and loopback. This is an intentional local boundary, not proof of insecure internet exposure. Confirm CEP origin behavior in release builds.
- [ ] `apps/premiere-panel/src/App.tsx:369-373` — fabricated film/sequence data is passed as verified; restrict to explicit demo mode.
- [ ] `apps/companion-service/src/cloud/mock-provider.ts:3-17` — in-memory test-style provider with `downloadSnapshot()` returning `Buffer.from("mock-project")`; not a real cloud implementation, should remain test-only.
- [ ] `apps/premiere-plugin/src/App.tsx:8-25` — `isMock` and `DEMO DATA (MOCK MODE)`; demo-state indicator exists, but production path must never silently depend on mock host.
- [ ] `apps/companion-service/src/cloud/upload-queue.ts:7-31` — queued uploads only exist in process memory; persist durable job state, retries and backoff for real cloud backup.
- [ ] `apps/premiere-panel/src/hooks/usePairing.ts:5-24` — session token stored in `sessionStorage`; review host threat model and avoid injecting remote web content into privileged CEP panel.

## 6. TODO/FIXME Inventory

- [ ] `apps/companion-service/src/server.ts:320` — `// 501 Unfinished fallback endpoints`, followed by eight incomplete route handlers in lines 321-348.
- [ ] **Coverage limitation:** Whole-tree TODO/FIXME/HACK/XXX matches were **not exhaustively enumerated**, because repository checkout was unavailable. Avoid interpreting this as a zero-hit claim. Re-run `git grep -nEi 'TODO|FIXME|HACK|XXX|placeholder|mock|localhost|127\\.0\\.0\\.1'` on a local checkout, excluding vendored assets and reviewing each result.

## 7. Security & Config Issues

- [ ] `apps/companion-service/src/server.ts:41-66` — accepts requests without an Origin header and binds loopback at `server.ts:364`; validate that all privileged routes enforce bearer authorization against cross-origin or non-browser local clients. CORS is **not** authentication. Confirm specifically with negative integration tests, not speculation.
- [ ] `apps/companion-service/src/server.ts:353-360` — error middleware returns raw exception messages as 500 responses. Normalize public errors and log detailed traces locally so filesystem paths and internal state cannot leak.
- [ ] `apps/premiere-panel/src/engine.ts:263-268` — auto-pair token passed in child process environment. Review process-inspection exposure and whether a restricted short-lived bootstrap channel is preferable.
- [ ] `apps/companion-service/src/cloud/upload-queue.ts:25-31` — all cloud errors are swallowed and queue retries are not durable; classify errors, bound retries, expose failure state, log sanitized diagnostics.
- [ ] `.gitignore:1-16` — excludes `.env`, `.env.*`, key/cert files and outputs, but also explicitly ignores `AUDIT_REPORT.md`. Remove that ignore rule if the audit is intended to be version controlled. Existing `.env.example` is a tracked template and not automatically a secret.
- [x] **Historical secret scan:** Gitleaks run 38107064453 passed on the evaluated SHA. This does **not** certify all possible secret patterns or external secrets.
- [ ] **Coverage limitation:** No full repository historical secret search or standalone credential-leak exploit test occurred.

## 8. UI/UX Issues & Fixes

- [ ] `apps/premiere-panel/src/App.tsx:560-568` — remove dead buttons in release builds, or explicitly disable them with tooltip `Not available in Phase 1`, muted styling and correct `aria-disabled` semantics.
- [ ] `apps/premiere-panel/src/components/PairingScreen.tsx:39-49` — input visually indicates six digits but lacks `inputMode="numeric"` and clear accessibility naming. Add `aria-label="Six-digit pairing code"`, `autoComplete="one-time-code"`, `inputMode="numeric"` where CEP supports them.
- [ ] `apps/premiere-panel/src/components/PairingScreen.tsx:26-31,39-57` — multiple 10–11 px text sizes are hard to read in docked panels. Use minimum 12 px secondary text, 14 px input labels, 36–40 px button targets, 12–16 px internal gaps; verify at panel widths 280/360/480 px and 125%/150% OS scaling.
- [ ] `apps/premiere-panel/src/App.tsx:546-557` — activity log height capped at 100 px and font 10 px. Raise to 160–220 px and minimum 12 px font; announce new errors with a visually distinct role/status region.
- [ ] `apps/premiere-panel/src/App.tsx:576-612` — restore asks users to paste an absolute folder path; add a native directory-picker affordance where CEP can provide it, and maintain existing progress/error handling. Test path validation in all supported OSes.
- [ ] **Visual inspection limitation:** Layout, animations and rendering in an actual CEP dock were not observed. The spacing suggestions above are accessibility/UI recommendations, not measured screenshots of defects.

## 9. Prioritized Fix Plan

| Priority | Item | Effort | Evidence / acceptance |
|---|---|---|---|
| Critical to release | Prove launch, pairing, snapshot and restore on signed/installed CEP build | Rework or moderate | `engine.ts:228-285`; real Premiere Windows/macOS acceptance |
| High | Stop submitting synthetic metadata as `verified` | Quick | `App.tsx:368-374`; unit assertion + demo-mode UI |
| High | Remove/disable experimental inert controls | Quick | `App.tsx:560-568` |
| High | Make companion process startup reliable and diagnosable | Moderate/rework | `engine.ts:244-280`; clean machine install, restart and crash tests |
| High | State cloud/sync/streams are unsupported, or build real providers | Rework | `server.ts:320-348`; durable end-to-end transfer tests |
| High | Audit authorization, error disclosure and CEP privileged environment | Moderate | `server.ts:41-66,353-364`; security integration tests |
| Medium | Persist cloud queue with bounded retries | Moderate | `upload-queue.ts:7-31`; restart/retry tests |
| Medium | Simplify restore destination picker and improve text accessibility | Quick/moderate | `App.tsx:576-612`; `PairingScreen.tsx:26-69` |
| Medium | Remove audit report from ignore list | Quick | `.gitignore:14` (verify exact index on next checkout) |
| Low | Establish screenshot regression tests and desktop display scaling matrix | Moderate | `App.tsx`, `index.css`, CEP installation |

## 10. Nice-to-haves

- Signed installer with a managed companion lifecycle rather than implicit Node paths (`apps/premiere-panel/src/engine.ts:244-280`).
- Release gate that exercises Premiere host scripts with real fixture projects (`apps/premiere-panel/src/App.tsx:338-367`).
- UI accessibility and narrow-panel visual baselines (`apps/premiere-panel/src/components/PairingScreen.tsx:26-69`).
- Durable, inspectable upload job ledger before attempting cloud backup (`apps/companion-service/src/cloud/upload-queue.ts:7-31`).

### Evidence integrity

This report distinguishes **confirmed source behavior**, **historical CI successes**, and **unverified live behavior**. It is not a claim that all source files were read or that a live Premiere integration test ran. Further direct testing requires a network-capable checkout and installed Premiere host.
