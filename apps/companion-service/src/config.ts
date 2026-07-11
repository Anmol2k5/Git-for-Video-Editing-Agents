export const config = {
  port: Number(process.env.EDITVCS_COMPANION_PORT) || 8731,
  storageRoot: process.env.EDITVCS_STORAGE_ROOT || ".editvcs",
  logLevel: process.env.EDITVCS_LOG_LEVEL || "info",
  devPanelPort: Number(process.env.EDITVCS_DEV_PANEL_PORT) || 5173,
} as const;
