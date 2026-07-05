# EditVCS Architecture

EditVCS is a local-first version history tool for professional video editors. Phase 1 supports Adobe Premiere Pro through a panel UI and a local companion service. The product versions project files and privacy-safe structured metadata; it does not upload source media by default.

## Components

- Premiere panel: shows project state, save points, changes, restore-as-copy, version streams, cloud backup state, and unsupported capability states.
- Companion service: owns filesystem access, hashing, stable-write detection, local storage, restore-copy creation, and optional cloud queueing.
- Shared packages: define host contracts, snapshot data, manifest types, storage adapters, diff summaries, and stream ancestry.
- Local storage: stores content-addressed project objects and manifests in `.editvcs` beside the project when writable, otherwise in the user application-data fallback.

## Safety Rules

- Restore creates a new project copy and never overwrites the active project file.
- Deletion requires explicit user confirmation.
- Cloud backup is opt-in and never uploads footage by default.
- Unsupported host capabilities render honest unavailable states.
- Premiere and After Effects project files are not automatically merged.

## Data Flow

1. The panel asks the host adapter for the current project and capabilities.
2. The panel pairs with the companion service over localhost using a bearer token.
3. Manual or automatic save points send a snapshot request to the companion.
4. The companion waits for a stable project file, hashes it, deduplicates content, stores an object and manifest, and returns a snapshot record.
5. Compare requests read two manifests and return editor-friendly change groups.
6. Restore requests create a new `.prproj` copy at a user-selected destination.
