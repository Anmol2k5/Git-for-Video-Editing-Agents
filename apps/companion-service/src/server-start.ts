import { createServer } from "./server";
import { config } from "./config";

const PORT = Number(process.env.EDITVCS_COMPANION_PORT) || config.port;
const STORAGE_ROOT = config.storageRoot;

console.log(`Starting EditVCS companion service with storage root: ${STORAGE_ROOT}`);

createServer({ port: PORT, storageRoot: STORAGE_ROOT })
  .then((server) => {
    server.on("error", (err) => {
      console.error("EditVCS companion failed to start:", err);
      process.exit(1);
    });
    console.log(`EditVCS companion listening on http://127.0.0.1:${PORT}`);
  })
  .catch((err) => {
    console.error("Failed to initialize server:", err);
    process.exit(1);
  });
