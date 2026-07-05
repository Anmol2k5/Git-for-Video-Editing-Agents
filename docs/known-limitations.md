# Known Limitations

- EditVCS does not back up media files, proxies, renders, or caches by default.
- Restore creates a separate project copy; replacing the active project is intentionally unsupported.
- Automatic merge is not supported for Premiere Pro or After Effects project files.
- Change details depend on what the Adobe host API can read safely.
- Effect-level and some timeline-level details may be unavailable in some Premiere versions.
- Cloud backup is optional and only syncs project snapshots and manifests unless the user explicitly chooses otherwise.
