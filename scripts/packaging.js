import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function validateStagedPackage(stagingDir) {
  for (const file of ["server/companion.cjs", "CSXS/manifest.xml", "dist/index.html", "dist/CSInterface.js", "jsx/hostscript.jsx", "public/icon.png"]) {
    const fullPath = path.join(stagingDir, file);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile() || fs.statSync(fullPath).size === 0) {
      throw new Error(`Missing required package asset: ${file}`);
    }
  }
  const signature = fs.readFileSync(path.join(stagingDir, "public/icon.png")).subarray(0, 8);
  if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("Package icon must contain PNG image data.");
  }
  const manifest = fs.readFileSync(path.join(stagingDir, "CSXS/manifest.xml"), "utf8");
  const premiereHost = manifest.match(/<Host\b[^>]*\bName="PPRO"[^>]*>/)?.[0];
  const version = premiereHost?.match(/\bVersion="([^"]+)"/)?.[1];
  if (version !== "[23.0,99.9]") {
    throw new Error("Package must declare Premiere 2023+ support with host version range [23.0,99.9].");
  }
}

export function signPackage({ stagingDir, outputZxp, certPath, certPassword, executable = "ZXPSignCmd" }) {
  try {
    // The signer requires argv input. Never propagate its command, error object,
    // stdout or stderr: any of them may repeat the certificate password.
    execFileSync(executable, ["-sign", stagingDir, outputZxp, certPath, certPassword], { stdio: "ignore" });
  } catch {
    throw new Error("Signing failed. Verify the signing tool, certificate and credentials.");
  }
}
