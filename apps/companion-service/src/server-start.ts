import { createServer } from "./server";

const PORT = Number(process.env.EDITVCS_COMPANION_PORT) || 8731;
const STORAGE_ROOT = process.env.EDITVCS_STORAGE_ROOT || ".editvcs";

const server = createServer({ port: PORT, storageRoot: STORAGE_ROOT });

server.on("error", (err) => {
  console.error("EditVCS companion failed to start:", err);
  process.exit(1);
});

console.log(`EditVCS companion listening on http://127.0.0.1:${PORT}`);
