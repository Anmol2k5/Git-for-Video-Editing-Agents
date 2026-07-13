# EditVCS

EditVCS gives video editors GitHub-style version history without asking them to understand Git. Phase 1 supports Adobe Premiere Pro with local save points, version history, safe restore-as-copy, and optional cloud backup.

## What EditVCS Does

- Creates manual and automatic save points for Premiere project files.
- Stores project versions locally by default.
- Shows editor-friendly changes when the host API exposes trustworthy metadata.
- Restores old versions as new project copies.
- Keeps cloud backup optional and opt-in.

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

- **Core Versioning**: 🟢 Stable. Snapshot creation, file deduplication, and atomic restore-as-copy are robust and verified.
- **Project Registration**: 🟢 Stable. Strict path canonicalization and verification are enforced.
- **Sync/Cloud Backup**: 🟡 Experimental. Currently relies on a rudimentary GitHub/local sync endpoint. Do not rely on it for critical automated backup.
- **Premiere Diffing**: 🟡 Experimental. Project structure diffing is basic and might miss specific effects or nested sequences.
- **Authentication**: 🟢 Stable. A secure 6-digit one-time code pairing flow is required to connect the panel to the companion.

## Setup

```bash
npm install
npm run editvcs:build
npm run editvcs:companion
npm run editvcs:premiere
npm run editvcs:test
```

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting a pull request.

## License

This project is licensed under the MIT License.
