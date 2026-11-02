import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateStagedPackage, signPackage } from "./packaging.js";

test("packaging refuses missing companion and disguised SVG icon", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-package-"));
  try {
    for (const file of ["CSXS/manifest.xml", "dist/index.html", "dist/CSInterface.js", "jsx/hostscript.jsx", "public/icon.png"]) {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      await writeFile(path.join(dir, file), "<svg/>");
    }
    assert.throws(() => validateStagedPackage(dir), /companion/);
    await mkdir(path.join(dir, "server")); await writeFile(path.join(dir, "server/companion.cjs"), "console.log('service')");
    assert.throws(() => validateStagedPackage(dir), /PNG/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("signing failures never expose certificate passwords from command arguments", () => {
  const sentinel = "editvcs-nonsecret-test-password";
  assert.throws(() => signPackage({ stagingDir: "/not-a-package", outputZxp: "/not-an-output", certPath: "/missing-cert", certPassword: sentinel, executable: process.execPath }), error => {
    assert.equal(error.message.includes(sentinel), false);
    assert.equal(error.cause, undefined);
    assert.match(error.message, /Signing failed/);
    return true;
  });
});

test("packaging rejects host ranges that contradict Premiere 2023+ support", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-host-range-"));
  try {
    for (const file of ["server/companion.cjs", "CSXS/manifest.xml", "dist/index.html", "dist/CSInterface.js", "jsx/hostscript.jsx", "public/icon.png"]) {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      await writeFile(path.join(dir, file), file.endsWith(".png") ? Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) : "asset");
    }
    const manifestPath = path.join(dir, "CSXS/manifest.xml");
    await writeFile(manifestPath, '<HostList><Host Name="PPRO" Version="15.0" /></HostList>');
    assert.throws(() => validateStagedPackage(dir), /Premiere.*2023/);
    await writeFile(manifestPath, '<HostList><Host Name="PPRO" Version="[23.0,99.9]" /></HostList>');
    assert.doesNotThrow(() => validateStagedPackage(dir));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
