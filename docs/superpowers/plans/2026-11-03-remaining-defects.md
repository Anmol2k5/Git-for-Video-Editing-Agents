# Remaining verified defects

User requested “fix everything” after the first two hardening passes. Preserve existing work and the canonical CEP/local companion architecture. Implement independent fixes in disjoint files with regression-first evidence, then integrate and obtain a fresh whole-change review. Do not silently activate cloud providers or claim actual Adobe/macOS/Windows acceptance from Linux checks.

- [x] Process ownership: exclusive claim, owner-checked release/heartbeat, fail-closed corrupt state, ownership before listening, truthful awaited shutdown and nonzero failure.
- [x] Storage/sync helpers: current snapshot layout, recursion and integrity, containment/symlink defenses, private-file exclusion from Git sync, honest success/failure reporting; leave release API support explicit.
- [x] Panel lifecycle: prove authentication, invalidate obsolete auth/diff/restore/supervisor work, bound disconnect, bind host operations to the expected project path.
- [x] CEP build: target the documented CEP 11 Chromium 88 runtime, replace incompatible Tailwind 4 CSS output with a compatible build, retain existing styling and explicit browser tests. Adobe's official CEP 11.1 cookbook identifies Chromium 88; no assumption of Chromium 74.
- [x] Integration: include release artifact/browser checks, restore both stored smoke snapshots, run frozen install/type checks/build/all tests/package/audit, review fixes and update readiness with measured limits. Keep any remaining genuinely external gates explicit.

Owned implementation areas: process agent (PID/server-start), storage agent (storage/diff packages), panel agent (panel src/JSX except CSS), parent (CSS/build/manifests/dependencies, release scripts/docs/integration). No concurrent edits to those boundaries. Work in the existing isolated cloud checkout; do not create worktrees or discard user changes.
