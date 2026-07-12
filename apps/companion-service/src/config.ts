import os from "node:os";
import path from "node:path";

export function getDefaultStorageRoot(): string {
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
      "EditVCS"
    );
  }

  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "EditVCS"
    );
  }

  return path.join(
    process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
    "EditVCS"
  );
}

function resolveStorageRoot(): string {
  const envRoot = process.env.EDITVCS_STORAGE_ROOT;
  if (envRoot && envRoot.trim() !== "") {
    return path.resolve(envRoot);
  }
  return getDefaultStorageRoot();
}

export const config = {
  port: Number(process.env.EDITVCS_COMPANION_PORT) || 8731,
  storageRoot: resolveStorageRoot(),
  logLevel: process.env.EDITVCS_LOG_LEVEL || "info",
  devPanelPort: Number(process.env.EDITVCS_DEV_PANEL_PORT) || 5173,
} as const;
