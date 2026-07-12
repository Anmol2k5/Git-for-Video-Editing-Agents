import { build } from "esbuild";

try {
  await build({
    entryPoints: ["src/server-start.ts"],
    outfile: "dist/companion.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    sourcemap: true,
    external: ["fsevents"],
  });
  console.log("Companion service bundled successfully to dist/companion.cjs");
} catch (err) {
  console.error("Bundle failed:", err);
  process.exit(1);
}
