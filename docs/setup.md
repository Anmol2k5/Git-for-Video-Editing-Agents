# EditVCS Setup Guide

This guide walks you through setting up EditVCS for development and testing.

## Prerequisites

- **Node.js**: v20.19+ or v22.12+
- **npm**: v9 or higher
- **Adobe Premiere Pro**: 2023 or newer
- **OS**: Windows or macOS (Linux is supported for the companion service, but Adobe Premiere Pro is required for the full experience).

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd editvcs
   ```

2. **Install dependencies**
   ```bash
   npm ci
   ```
   > **Note**: Always use `npm ci` rather than `npm install` to ensure lockfile consistency, particularly for the companion service which relies on strict dependency resolution.

3. **Build the workspaces**
   ```bash
   npm run editvcs:build
   ```

## Running Locally

EditVCS is split into a **Companion Service** (Node.js backend) and a **Premiere Panel** (Adobe CEP panel).

### Start the Companion Service
The companion service handles file operations securely outside of Premiere.
```bash
npm run editvcs:companion
```
*The companion service will start on `http://127.0.0.1:8731`.*

### Start the Premiere Panel (Dev Mode)
To run the Premiere Panel in development mode:
```bash
npm run editvcs:premiere
```
*This will launch a local Vite dev server for the panel UI.*

> **Loading the Extension in Premiere**: 
> You will need to symlink the `apps/premiere-panel` directory to your Adobe CEP extensions folder, and enable `PlayerDebugMode` in your registry/plist to load unsigned extensions during development.

## Testing

Run the full test suite across all workspaces:
```bash
npm run test
```

## Security & Architecture Notes

- **Canonical Runtime**: The Adobe CEP panel (`apps/premiere-panel`) is the canonical runtime for Phase 1. 
- **Data Persistence**: Project registry and version history are stored in a local `.editvcs` folder by default.
- **Authentication**: A local pairing flow with a 6-digit one-time code is required to connect the panel to the companion service.

For a full security audit overview, see `SECURITY.md`.

## Companion runtime and troubleshooting

The panel starts the bundled `server/companion.cjs` using a standalone Node.js executable (`EDITVCS_NODE_EXECUTABLE` or `node` on PATH), not Adobe's embedded executable. Install a supported Node version on the editing workstation before launching Premiere. A GUI-launched Premiere process may have a different PATH from your terminal; use the absolute executable override when needed. The release does not bundle or install Node automatically.

If auto-start fails, start the companion manually in a visible terminal, then choose **Start & Authenticate** in the panel and enter its six-digit code. Local snapshots need no cloud credentials. Configure `EDITVCS_STORAGE_ROOT` to override the platform-specific storage directory, and `EDITVCS_COMPANION_PORT`/`EDITVCS_DEV_PANEL_PORT` for backend development. The shipped CEP panel currently connects to companion port 8731.

A corrupt or unreadable `registry.json` now blocks startup to preserve existing mappings. Keep a copy of that file and recover the valid JSON/permissions before restarting; do not delete it as a routine repair. No automatic registry reconstruction is provided.

Run `npm run editvcs:build:packages && npm run verify` for repository verification, type checks, all builds, tests and packaging regressions. Run `npm run package:cep:unsigned` to build a complete developer package, including the companion bundle and PNG icon. Signed packaging needs ZXPSignCmd plus separately provisioned signing credentials. Windows/macOS clean-machine installation and real Premiere acceptance remain required before a public release.

## Release validation

`npm run verify` also runs the functional smoke-runner regressions against the built companion. To run the actual lifecycle check directly after building, use `node scripts/companion-smoke-test.js`. It creates its own temporary project, storage directory and loopback port, so it can run alongside an existing companion. It verifies process/session ownership, two save points, duplicate-content handling, restore bytes, graceful shutdown and immediate crash recovery. Its temporary data and owned child are cleaned up; it does not terminate other services. These synthetic `.prproj` bytes validate storage mechanics, not Premiere's ability to open a real project.

Health failures keep filesystem details in the companion's local console log and return a generic public response. Repeated identical failures are logged once until the failure changes or a successful probe resets the state. A dead PID owner can restart immediately; an existing owner with an old heartbeat is kept rather than overwritten. Diagnose a stale/reused PID record locally before removing it.

The file-loaded CEP panel uses the opaque Origin `null`; this origin is explicitly supported while bearer authentication continues to protect project data. The packaged extension declares Premiere version range `[23.0,99.9]` (2023+). Native rendering and Node discovery still need acceptance on actual supported editing workstations.

## CEP browser build checks

The frontend targets Chromium 88, following [Adobe CEP 11.1 runtime documentation](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_11.x/Documentation/CEP%2011.1%20HTML%20Extension%20Cookbook.md). Tailwind 3/PostCSS generates CSS without unsupported cascade layers, registered properties or modern color functions. `npm run test:cep-compat` checks built CSS and local resources.

`npm run test:cep-browser` exercises the built panel/SDK in an installed Chromium/Chrome browser with controlled native and HTTP fixtures. Set `EDITVCS_CHROMIUM_EXECUTABLE` if the browser is not in a standard location. This runs in the selected Linux CI job. It checks rendering/styles/save behavior; it does not pretend the installed modern browser is the actual Adobe CEF runtime.

A companion keeps an exclusive PID ownership claim until its HTTP requests and file watchers drain. Corrupt or unreadable ownership records block startup; diagnose locally before removing them, and never remove a live process's claim. Heartbeat ownership loss shuts down the instance instead of continuing to write under another claim.

Sync remains unavailable through the release UI/API. The exported experimental storage helpers now validate current metadata/object layout and exclude private registry/log files. Pre-existing Git history with private/unsupported paths is refused rather than rewritten; use a clean dedicated sync repository. Filesystems without the required hard-link primitives fail safely, so validate any NAS/external target separately.
