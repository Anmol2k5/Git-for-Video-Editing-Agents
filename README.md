# EditVCS

EditVCS gives video editors GitHub-style version history without asking them to understand Git. Phase 1 supports Adobe Premiere Pro with local save points, version history, safe restore-as-copy, and a local companion service. Cloud backup is not available in this release.

## What EditVCS Does

- Creates manual save points for Premiere project files. An automatic-snapshot API exists for development but is not enabled by the panel.
- Stores project versions locally by default.
- Shows editor-friendly changes when the host API exposes trustworthy metadata.
- Restores old versions as new project copies.
- Keeps project snapshots local. Cloud backup and version streams are not implemented in the release API.

## What EditVCS Does Not Do

- It does not upload raw footage, proxies, renders, caches, or source media by default.
- It does not overwrite your active project during restore.
- It does not automatically merge Premiere or After Effects project files.
- It does not claim clip-level changes when Premiere does not expose enough data.
## Requirements

- Node.js 20.19+ or 22.12+
- Adobe Premiere Pro 2023 or newer

## Architecture Overview

EditVCS uses a local Node-based companion service to handle Git-like snapshots securely outside the host environment. The frontend interface for the editor is an Adobe CEP panel, which is the canonical supported runtime for Phase 1. 

## Maturity Labels

- **Core Versioning**: Pre-release. Snapshot creation, file deduplication and restore-as-copy have automated coverage; supported Premiere installations still require acceptance testing.
- **Project Registration**: Pre-release. Registration validates paths, serializes persistence and refuses corrupt registries.
- **Sync/Cloud Backup/Version Streams**: Unavailable. Release API endpoints return HTTP 501. Experimental storage helpers are not a production backup solution.
- **Premiere Diffing**: 🟡 Experimental. Project structure diffing is basic and might miss specific effects or nested sequences.
- **Authentication**: Pre-release, with automated integration coverage. A secure 6-digit one-time code pairing flow is required to connect the panel to the companion.

## Setup

```bash
npm ci
npm run editvcs:build
npm run editvcs:companion
npm run editvcs:premiere
npm run editvcs:test
```

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting a pull request.

## License

This project is licensed under the MIT License.

## Release status

EditVCS is not yet production-ready. See [production readiness](docs/production-readiness.md) for the audit, implemented hardening, and remaining release gates. The CEP panel is the canonical Phase-1 runtime; `apps/premiere-plugin` is an experimental UXP prototype with incomplete actions.

The companion requires a standalone supported Node.js installation; the Node runtime embedded in Adobe CEP is not used to run the server. Put `node` on the PATH inherited by Premiere, or set `EDITVCS_NODE_EXECUTABLE` to an absolute Node executable path before launching Premiere. Alternatively, start the companion manually with `npm run editvcs:companion`, then use the panel's six-digit pairing flow.
