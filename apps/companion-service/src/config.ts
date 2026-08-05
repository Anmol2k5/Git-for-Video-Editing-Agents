import os from "node:os";
import path from "node:path";
import { z } from "zod";

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

const envSchema = z.object({
  EDITVCS_COMPANION_PORT: z.coerce.number().int().min(1).max(65535).default(8731),
  EDITVCS_STORAGE_ROOT: z.string().optional(),
  EDITVCS_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  EDITVCS_DEV_PANEL_PORT: z.coerce.number().int().min(1).max(65535).default(5173),
});

const parsedEnv = envSchema.parse(process.env);

export interface CompanionConfig {
  readonly port: number;
  readonly storageRoot: string;
  readonly logLevel: "debug" | "info" | "warn" | "error";
  readonly devPanelPort: number;
}

export const config = {
  port: parsedEnv.EDITVCS_COMPANION_PORT,
  storageRoot: resolveStorageRoot(),
  logLevel: parsedEnv.EDITVCS_LOG_LEVEL,
  devPanelPort: parsedEnv.EDITVCS_DEV_PANEL_PORT,
} satisfies CompanionConfig;
