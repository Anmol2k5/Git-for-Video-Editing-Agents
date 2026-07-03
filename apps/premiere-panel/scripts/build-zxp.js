import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const rootDir = path.resolve(process.cwd());
const stagingDir = path.join(rootDir, '.zxp-staging');
const zxpFile = path.join(rootDir, 'EditVCS.zxp');
const certFile = path.join(rootDir, 'cert.p12');

// Find the ZXPSignCmd binary
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
let zxpCmd = '';

if (isWin) {
  zxpCmd = path.join(rootDir, 'node_modules', 'zxp-provider', 'bin', '4.1.1', 'win64', 'ZXPSignCmd.exe');
} else if (isMac) {
  zxpCmd = path.join(rootDir, 'node_modules', 'zxp-provider', 'bin', '4.1.1', 'osx64', 'ZXPSignCmd');
}

if (!fs.existsSync(zxpCmd)) {
  console.error('Cannot find ZXPSignCmd binary at', zxpCmd);
  process.exit(1);
}

// 1. Build the Vite app
console.log('Building React app...');
execSync('npm run build', { stdio: 'inherit', cwd: rootDir });

// 2. Clean and create staging directory
console.log('Preparing staging directory...');
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

// 3. Copy files to staging
const filesToCopy = ['CSXS', 'dist', 'jsx', 'public', 'index.html', 'package.json'];
filesToCopy.forEach(file => {
  const src = path.join(rootDir, file);
  const dest = path.join(stagingDir, file);
  if (fs.existsSync(src)) {
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest); if (file === 'package.json') { const pkg = JSON.parse(fs.readFileSync(dest)); delete pkg.dependencies.editvcs; fs.writeFileSync(dest, JSON.stringify(pkg, null, 2)); }
    }
  }
});

// 4. Install production Node modules
console.log('Installing production dependencies...');
execSync('npm install --omit=dev', { stdio: 'inherit', cwd: stagingDir }); if (fs.existsSync(path.join(stagingDir, 'node_modules', '.bin'))) fs.rmSync(path.join(stagingDir, 'node_modules', '.bin'), { recursive: true, force: true });

try {
  // 5. Generate certificate if it doesn't exist
  if (!fs.existsSync(certFile)) {
      console.log('No certificate found. Generating cert.p12...');
      const genCmd = `"${zxpCmd}" -selfSignedCert US CA EditVCS "EditVCS Developer" password "${certFile}"`;
      execSync(genCmd, { stdio: 'inherit' });
  }

  // 6. Package ZXP
  console.log('Signing and packaging ZXP...');
  const signCmd = `"${zxpCmd}" -sign "${stagingDir}" "${zxpFile}" "${certFile}" password`;
  execSync(signCmd, { stdio: 'inherit' });

  console.log(`Success! Created ${zxpFile}`);
} catch (err) {
  console.error('Failed to package ZXP:', err);
} finally {
  // Cleanup staging
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}
