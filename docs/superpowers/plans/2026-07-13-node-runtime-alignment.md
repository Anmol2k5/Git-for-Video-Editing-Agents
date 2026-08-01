# Node Runtime Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align EditVCS documentation and CI with the Node.js engine range `^20.19.0 || >=22.12.0`.

**Architecture:** Treat the root `package.json` engine declaration as the source of truth. Update only human-facing requirements and the GitHub Actions matrix; application behavior and dependencies remain unchanged.

**Tech Stack:** Markdown, GitHub Actions YAML, Node.js, npm workspaces

## Global Constraints

- Preserve the root engine range `^20.19.0 || >=22.12.0`.
- Support the minimum Node.js releases `20.19.x` and `22.12.x` in CI.
- Do not change dependencies, application code, builds, or packaging.
- Preserve all unrelated uncommitted work.

---

### Task 1: Align documented and tested Node.js versions

**Files:**
- Modify: `README.md:21`
- Modify: `docs/setup.md:7`
- Modify: `.github/workflows/ci.yml:15`

**Interfaces:**
- Consumes: Root `package.json` engine range `^20.19.0 || >=22.12.0`.
- Produces: Matching requirements in documentation and minimum-version CI coverage.

- [ ] **Step 1: Verify the existing consistency failure**

Run a PowerShell assertion that checks `README.md` and `docs/setup.md` for Node.js 18 references and checks the CI matrix for `20.19.x` and `22.12.x`.

Expected: FAIL because the documentation advertises Node.js 18 and CI uses `18.x` and `20.x`.

- [ ] **Step 2: Update the README requirement**

Replace:

```markdown
- Node.js 18 or higher
```

with:

```markdown
- Node.js 20.19+ or 22.12+
```

- [ ] **Step 3: Update the setup guide requirement**

Replace:

```markdown
- **Node.js**: v18 or v20
```

with:

```markdown
- **Node.js**: v20.19+ or v22.12+
```

- [ ] **Step 4: Update the CI matrix**

Replace:

```yaml
node-version: [18.x, 20.x]
```

with:

```yaml
node-version: [20.19.x, 22.12.x]
```

- [ ] **Step 5: Verify Node.js requirement consistency**

Run the Step 1 PowerShell assertion again.

Expected: PASS with no Node.js 18 references and both minimum CI versions present.

- [ ] **Step 6: Verify the complete repository**

Run: `npm run verify`

Expected: Repository validation, all workspace typechecks, builds, and tests pass.

