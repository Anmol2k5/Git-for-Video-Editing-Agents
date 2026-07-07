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

- Node.js 18 or higher
- Adobe Premiere Pro 2023 or newer

## Architecture Overview

EditVCS uses a local node-based companion service to handle git-like snapshots, while a Premiere UXP panel acts as the frontend interface for the editor.

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

