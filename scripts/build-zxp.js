import { execSync, execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const rootDir = process.cwd();

// Staging and release directories
const panelDir = path.join(rootDir, "apps", "premiere-panel");
const distDir = path.join(panelDir, "dist");
const csxsDir = path.join(panelDir, "CSXS");
const jsxDir = path.join(panelDir, "jsx");
const publicDir = path.join(panelDir, "public");

const stagingDir = path.join(rootDir, "dist-zxp-staging");
const releaseDir = path.join(rootDir, "release");

const isSigned = process.argv.includes("--signed");
const isUnsigned = process.argv.includes("--unsigned") || !isSigned;

// Get package version
let version = "1.0.0";
try {
  const pkgContent = fs.readFileSync(path.join(panelDir, "package.json"), "utf8");
  const pkg = JSON.parse(pkgContent);
  if (pkg.version) version = pkg.version;
} catch (e) {
  console.warn("Could not read version from package.json, defaulting to 1.0.0");
}

console.log("Building premiere-panel CEP frontend...");
try {
  execSync("npm run build --workspace @editvcs/premiere-panel", { stdio: "inherit" });
} catch (err) {
  console.error("Vite build failed.");
  process.exit(1);
}

console.log("Validating required files...");
const requiredFiles = [
  path.join(csxsDir, "manifest.xml"),
  path.join(distDir, "index.html"),
  path.join(distDir, "CSInterface.js"),
  path.join(jsxDir, "hostscript.jsx")
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`ERROR: Missing required file for packaging: ${file}`);
    process.exit(1);
  }
}

// Clean and recreate staging folder
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

// Helper to copy directory
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy resources to staging
console.log("Copying production assets to packaging staging...");
copyDir(csxsDir, path.join(stagingDir, "CSXS"));
copyDir(distDir, path.join(stagingDir, "dist"));
copyDir(jsxDir, path.join(stagingDir, "jsx"));
fs.mkdirSync(path.join(stagingDir, "public"), { recursive: true });

// Copy icons/assets to public staging
if (fs.existsSync(path.join(publicDir, "favicon.svg"))) {
  fs.copyFileSync(path.join(publicDir, "favicon.svg"), path.join(stagingDir, "public", "favicon.svg"));
}
if (fs.existsSync(path.join(publicDir, "icons.svg"))) {
  fs.copyFileSync(path.join(publicDir, "icons.svg"), path.join(stagingDir, "public", "icons.svg"));
}

// Satisfy manifest.xml reference to icon.png
const placeholderIconDest = path.join(stagingDir, "public", "icon.png");
if (fs.existsSync(path.join(publicDir, "favicon.svg"))) {
  fs.copyFileSync(path.join(publicDir, "favicon.svg"), placeholderIconDest);
} else {
  fs.writeFileSync(placeholderIconDest, "placeholder icon content");
}

// Make sure release dir exists
if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

if (isSigned) {
  console.log("Packaging signed extension...");
  const certPath = process.env.EDITVCS_SIGNING_CERT;
  const certPassword = process.env.EDITVCS_SIGNING_PASSWORD;

  if (!certPath || !certPassword) {
    console.error("ERROR: Signing certificate secrets (EDITVCS_SIGNING_CERT / EDITVCS_SIGNING_PASSWORD) not found.");
    console.error("Signed build aborted.");
    fs.rmSync(stagingDir, { recursive: true, force: true });
    process.exit(1);
  }

  const outputZxp = path.join(releaseDir, `EditVCS-${version}.zxp`);
  if (fs.existsSync(outputZxp)) fs.unlinkSync(outputZxp);

  try {
    console.log(`Running ZXPSignCmd to create ${outputZxp}...`);
    // Use execFileSync to prevent shell interpolation or printing password in logs
    execFileSync("ZXPSignCmd", [
      "-sign",
      stagingDir,
      outputZxp,
      certPath,
      certPassword
    ], { stdio: "inherit" });
    console.log(`\nSuccess: Signed package generated at ${outputZxp}`);
  } catch (err) {
    console.error("ERROR: ZXPSignCmd signature execution failed:", err.message || String(err));
    fs.rmSync(stagingDir, { recursive: true, force: true });
    process.exit(1);
  }
} else {
  console.log("Packaging unsigned developer extension...");
  const outputZip = path.join(releaseDir, "EditVCS-CEP-unsigned.zip");
  const outputDevFolder = path.join(releaseDir, "EditVCS-CEP");

  if (fs.existsSync(outputZip)) fs.unlinkSync(outputZip);
  if (fs.existsSync(outputDevFolder)) fs.rmSync(outputDevFolder, { recursive: true, force: true });

  // 1. Copy staging directly to release folder as directory
  copyDir(stagingDir, outputDevFolder);

  // 2. Zip staging to release folder
  const isWin = process.platform === "win32";
  try {
    if (isWin) {
      execSync(`powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${stagingDir}', '${outputZip}')"`);
    } else {
      execSync(`zip -r "${outputZip}" .`, { cwd: stagingDir });
    }
    console.log(`\nSuccess: Unsigned developer files created:`);
    console.log(`- Folder: ${outputDevFolder}`);
    console.log(`- Zip Archive: ${outputZip}`);
    console.log("\nDeveloper Installation Instructions:");
    console.log("1. Extract the Zip Archive to your Adobe Extensions folder:");
    console.log("   - Windows: C:\\Users\\<username>\\AppData\\Roaming\\Adobe\\CEP\\extensions\\EditVCS");
    console.log("   - macOS: ~/Library/Application Support/Adobe/CEP/extensions/EditVCS");
    console.log("2. Enable CEP debug mode on your development machine:");
    console.log("   - Windows: reg add \"HKCU\\Software\\Adobe\\CSXS.11\" /v PlayerDebugMode /t REG_SZ /d 1 /f");
    console.log("   - macOS: defaults write com.adobe.CSXS.11 PlayerDebugMode 1");
  } catch (err) {
    console.error("Failed to create ZIP package:", err);
    fs.rmSync(stagingDir, { recursive: true, force: true });
    process.exit(1);
  }
}

// Clean up staging folder
fs.rmSync(stagingDir, { recursive: true, force: true });
console.log("Packaging staging cleaned up.");
process.exit(0);
