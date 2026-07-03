export type ProjectVersion = {
  id: string;
  projectId: string; // The path of the .prproj
  versionNumber: number;
  filename: string;
  contentHash: string;
  createdAt: string;
  checkpointType: "auto" | "manual";
  note?: string;
};

// Use window.require to bypass Vite's bundler complaining about Node modules
const getFs = () => (window as any).require ? (window as any).require('fs') : null;
const getPath = () => (window as any).require ? (window as any).require('path') : null;
const getCrypto = () => (window as any).require ? (window as any).require('crypto') : null;
const getOs = () => (window as any).require ? (window as any).require('os') : null;
const getChokidar = () => (window as any).require ? (window as any).require('chokidar') : null;

export class LocalEngine {
  private backupDir: string;
  private dbPath: string;
  private watcher: any = null;
  private debounceTimer: any = null;
  private currentPath: string = "";

  constructor() {
    const os = getOs();
    const path = getPath();
    const fs = getFs();
    if (!os) {
      this.backupDir = "";
      this.dbPath = "";
      return;
    }

    this.backupDir = path.join(os.homedir(), '.editvcs', 'backups');
    this.dbPath = path.join(this.backupDir, 'local_db.json');

    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    if (!fs.existsSync(this.dbPath)) {
      fs.writeFileSync(this.dbPath, JSON.stringify({ versions: {} }), 'utf-8');
    }
  }

  public getVersions(projectPath: string): ProjectVersion[] {
    const fs = getFs();
    if (!fs) return [];
    try {
      const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf-8'));
      return data.versions[projectPath] || [];
    } catch {
      return [];
    }
  }

  private saveVersionRecord(projectPath: string, version: ProjectVersion) {
    const fs = getFs();
    if (!fs) return;
    const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf-8'));
    if (!data.versions) data.versions = {};
    if (!data.versions[projectPath]) data.versions[projectPath] = [];
    data.versions[projectPath].unshift(version);
    fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private async hashFile(filePath: string): Promise<string> {
    const fs = getFs();
    const crypto = getCrypto();
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('error', (err: any) => reject(err));
      stream.on('data', (chunk: any) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  public async createSnapshot(projectPath: string, type: "auto" | "manual" = "auto"): Promise<ProjectVersion | null> {
    const fs = getFs();
    const path = getPath();
    if (!fs || !fs.existsSync(projectPath)) return null;

    const hash = await this.hashFile(projectPath);
    const versions = this.getVersions(projectPath);
    
    // Don't save if hash is identical to latest
    if (versions.length > 0 && versions[0].contentHash === hash) {
      return null;
    }

    const versionId = getCrypto().randomUUID();
    const versionNumber = versions.length + 1;
    const snapshotFilename = `${versionNumber}_${path.basename(projectPath)}`;
    const snapshotPath = path.join(this.backupDir, versionId + "_" + snapshotFilename);

    fs.copyFileSync(projectPath, snapshotPath);

    const version: ProjectVersion = {
      id: versionId,
      projectId: projectPath,
      versionNumber,
      filename: snapshotFilename,
      contentHash: hash,
      createdAt: new Date().toISOString(),
      checkpointType: type
    };

    this.saveVersionRecord(projectPath, version);
    return version;
  }

  public watchProject(projectPath: string, onUpdate: () => void) {
    const chokidar = getChokidar();
    const fs = getFs();
    if (!chokidar || !fs.existsSync(projectPath)) return;

    if (this.watcher) {
      this.watcher.close();
    }
    
    this.currentPath = projectPath;
    
    // Create initial snapshot if none exists
    if (this.getVersions(projectPath).length === 0) {
      this.createSnapshot(projectPath, "auto").then(onUpdate);
    }

    this.watcher = chokidar.watch(projectPath, {
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    this.watcher.on('change', () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(async () => {
        const newVer = await this.createSnapshot(projectPath, "auto");
        if (newVer) onUpdate();
      }, 1000);
    });
  }
}

export const localEngine = new LocalEngine();
