import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const rootDir = process.cwd();

// Staging directories
const panelDir = path.join(rootDir, "apps", "premiere-panel");
const distDir = path.join(panelDir, "dist");
const csxsDir = path.join(panelDir, "CSXS");
const jsxDir = path.join(panelDir, "jsx");
const publicDir = path.join(panelDir, "public");

const stagingDir = path.join(rootDir, "dist-zxp-staging");
const outputZxp = path.join(rootDir, "com.editvcs.panel.zxp");

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

// Copy directory helper
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

// Check for signing certificate in env
const certPath = process.env.EDITVCS_SIGNING_CERT;
const certPassword = process.env.EDITVCS_SIGNING_PASSWORD;

if (certPath && certPassword) {
  console.log("Signing certificate config found. Attempting to sign using ZXPSignCmd...");
  try {
    execSync(`ZXPSignCmd -sign "${stagingDir}" "${outputZxp}" "${certPath}" "${certPassword}"`, { stdio: "inherit" });
    console.log(`Success: Signed package generated at ${outputZxp}`);
  } catch (err) {
    console.error("WARNING: ZXPSignCmd signature failed. Falling back to unsigned archive zip.");
    createUnsignedZxp();
  }
} else {
  console.log("No signing certificate supplied (EDITVCS_SIGNING_CERT / EDITVCS_SIGNING_PASSWORD). Packaging unsigned...");
  createUnsignedZxp();
}

// Clean up staging folder
fs.rmSync(stagingDir, { recursive: true, force: true });

function createUnsignedZxp() {
  if (fs.existsSync(outputZxp)) {
    fs.unlinkSync(outputZxp);
  }
  const isWin = process.platform === "win32";
  try {
    if (isWin) {
      // Create ZIP using PowerShell's System.IO.Compression
      execSync(`powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${stagingDir}', '${outputZxp}')"`);
    } else {
      execSync(`zip -r "${outputZxp}" .`, { cwd: stagingDir });
    }
    console.log(`\nSuccess: Unsigned developer package generated at: ${outputZxp}`);
    console.log("\nDeveloper Installation Instructions:");
    console.log("1. Rename .zxp to .zip and extract it to your Adobe Extensions folder:");
    console.log("   - Windows: C:\\Users\\<username>\\AppData\\Roaming\\Adobe\\CEP\\extensions\\EditVCS");
    console.log("   - macOS: ~/Library/Application Support/Adobe/CEP/extensions/EditVCS");
    console.log("2. Enable CEP debug mode on your development machine:");
    console.log("   - Windows: reg add \"HKCU\\Software\\Adobe\\CSXS.11\" /v PlayerDebugMode /t REG_SZ /d 1 /f");
    console.log("   - macOS: defaults write com.adobe.CSXS.11 PlayerDebugMode 1");
  } catch (err) {
    console.error("Failed to create ZIP package: ", err);
    process.exit(1);
  }
}
