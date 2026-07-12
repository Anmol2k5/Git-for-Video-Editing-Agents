import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const rootDir = process.cwd();

console.log("Running repository verification checks...");

// Helper to run git command and get output lines
function getGitFiles(pattern) {
  try {
    const output = execSync(`git ls-files "${pattern}"`, { cwd: rootDir, encoding: "utf8" });
    return output.split("\n").map(l => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

let hasErrors = false;

// 1. Check for tracked node_modules or dist folders
const badFolders = ["*node_modules/*", "*dist/*"];
for (const pattern of badFolders) {
  const files = getGitFiles(pattern);
  if (files.length > 0) {
    console.error(`ERROR: The following tracked files should not be in git (match: ${pattern}):`);
    files.forEach(f => console.error(`  - ${f}`));
    hasErrors = true;
  }
}

// 2. Check for secret files or packages
const badExtensions = ["*.p12", "*.zxp", "*.pem", "*.key", ".env", ".env.local", ".env.production", ".env.development"];
for (const pattern of badExtensions) {
  const files = getGitFiles(pattern);
  if (files.length > 0) {
    console.error(`ERROR: Secret or packaging file found tracked in Git (match: ${pattern}):`);
    files.forEach(f => console.error(`  - ${f}`));
    hasErrors = true;
  }
}

// 3. Verify that critical CEP assets are present in premiere-panel
const requiredAssets = [
  "apps/premiere-panel/CSXS/manifest.xml",
  "apps/premiere-panel/index.html",
  "apps/premiere-panel/jsx/hostscript.jsx",
  "apps/premiere-panel/package.json"
];

for (const asset of requiredAssets) {
  if (!fs.existsSync(path.join(rootDir, asset))) {
    console.error(`ERROR: Missing required CEP asset: ${asset}`);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error("\nVerification FAILED. Please resolve the errors above.");
  process.exit(1);
} else {
  console.log("\nSuccess: Repository verification passed successfully!");
  process.exit(0);
}
