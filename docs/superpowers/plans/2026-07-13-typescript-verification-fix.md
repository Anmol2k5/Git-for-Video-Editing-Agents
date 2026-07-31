# TypeScript Verification Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore TypeScript verification for the companion-service integration test.

**Architecture:** Keep the test coupled to the asynchronous `createServer` factory while unwrapping its promise type at the variable declaration. Make no runtime or production-code changes.

**Tech Stack:** TypeScript, npm workspaces, Vitest

## Global Constraints

- Modify only `apps/companion-service/src/companion.integration.test.ts` production/test source.
- Preserve all existing uncommitted work.
- Do not change runtime behavior, APIs, packaging, dependencies, or documentation beyond this plan.

---

### Task 1: Correct the integration-test server type

**Files:**
- Modify: `apps/companion-service/src/companion.integration.test.ts:10`
- Test: `apps/companion-service/src/companion.integration.test.ts`

**Interfaces:**
- Consumes: `createServer(options): Promise<Server>` from `apps/companion-service/src/server.ts`.
- Produces: A `server` variable typed as the resolved `Server` returned after awaiting `createServer`.

- [x] **Step 1: Verify the existing typecheck failure**

Run: `npm --workspace @editvcs/companion-service run lint`

Expected: FAIL with TS2739 and TS2339 errors showing that `server` is typed as `Promise<Server>`.

- [x] **Step 2: Apply the minimal type correction**

Replace:

```ts
let server: ReturnType<typeof createServer>;
```

with:

```ts
let server: Awaited<ReturnType<typeof createServer>>;
```

- [x] **Step 3: Verify the targeted typecheck**

Run: `npm --workspace @editvcs/companion-service run lint`

Expected: PASS with exit code 0.

- [x] **Step 4: Verify companion-service behavior**

Run: `npm --workspace @editvcs/companion-service run test`

Expected: All companion-service tests pass.

- [x] **Step 5: Verify the repository pipeline**

Run: `npm run verify`

Expected: Repository validation, lint, build, and all tests pass with exit code 0.
