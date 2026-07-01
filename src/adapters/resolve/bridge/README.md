# DaVinci Resolve Python Bridge

This folder contains Python scripts that interface with DaVinci Resolve Studio using the official Scripting API.

## Requirements
1. **DaVinci Resolve Studio** (The free version has limited scripting capabilities and requires launching scripts from within the application menu).
2. **Python 3.6+** installed on your system.

## Setup
By default, the bridge will attempt to auto-discover the `DaVinciResolveScript` module based on your operating system.

If discovery fails, you can manually set the environment variable:
- `EDITVCS_RESOLVE_SCRIPT_PATH` to point to your `Modules` folder.

**Windows Default:** `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules`
**macOS Default:** `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules`
**Linux Default:** `/opt/resolve/libs/Fusion/Modules`

## Usage (Internal)
These scripts are called by EditVCS's Node.js backend (`resolve-live-import.ts`). They are not meant to be run directly by the user unless debugging.

```bash
python resolve_export.py --active-timeline
```
