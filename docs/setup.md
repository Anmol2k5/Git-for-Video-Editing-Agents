# EditVCS Setup Guide

This guide walks you through setting up EditVCS for development and testing.

## Prerequisites

- **Node.js**: v18 or v20
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
