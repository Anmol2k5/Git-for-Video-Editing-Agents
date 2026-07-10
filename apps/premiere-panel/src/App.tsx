import { useEffect, useState, useCallback } from 'react';
import {
  Settings, Save, RefreshCw, FileText, ChevronRight,
  GitBranch, Merge, CloudUpload, Film, Music, Image,
  ArrowUpCircle, ArrowDownCircle, FolderUp, Globe
} from 'lucide-react';
import { localEngine, ProjectVersion } from './engine';

// CSInterface global from Adobe CEP
declare global {
  interface Window {
    CSInterface: any;
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

type SyncTargetType = 'local' | 'github';
type ActivityEntry = { id: number; message: string; time: string };

// ─── Mock data for the "Modified Assets" section ────────────────────────────

const MOCK_CHANGED_FILES = [
  { name: 'Interview_B_Roll_002.mp4', type: 'video' as const, status: 'modified' as const },
  { name: 'Voiceover_Final_Mix.wav', type: 'audio' as const, status: 'modified' as const },
  { name: 'Title_Card_v3.png', type: 'image' as const, status: 'added' as const },
  { name: 'Lower_Third_Guest.mogrt', type: 'video' as const, status: 'modified' as const },
];

const FILE_ICONS = {
  video: Film,
  audio: Music,
  image: Image,
};

// ─── Accordion component ────────────────────────────────────────────────────

function Accordion({ title, defaultOpen = true, children }: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-1">
      <button
        className="accordion-header w-full"
        onClick={() => setOpen(!open)}
      >
        <ChevronRight size={10} className={`accordion-chevron ${open ? 'open' : ''}`} />
        {title}
      </button>
      {open && <div className="fade-in">{children}</div>}
    </div>
  );
}

// ─── Settings modal ─────────────────────────────────────────────────────────

function SettingsModal({ onClose, syncType, syncPath, onSave }: {
  onClose: () => void;
  syncType: SyncTargetType;
  syncPath: string;
  onSave: (type: SyncTargetType, path: string) => void;
}) {
  const [type, setType] = useState<SyncTargetType>(syncType);
  const [path, setPath] = useState(syncPath);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-4">Sync Settings</h3>

        <div className="mb-3">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1 block">
            Destination
          </label>
          <div className="flex gap-2">
            <button
              className={`btn flex-1 ${type === 'local' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setType('local')}
            >
              <FolderUp size={14} /> Local / NAS
            </button>
            <button
              className={`btn flex-1 ${type === 'github' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setType('github')}
            >
              <Globe size={14} /> GitHub
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1 block">
            {type === 'local' ? 'Folder Path' : 'Repository URL'}
          </label>
          <input
            className="input"
            placeholder={
              type === 'local'
                ? 'Z:\\NAS\\Projects\\MyEdit'
                : 'https://github.com/user/repo.git'
            }
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          {type === 'local' && (
            <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
              Works with NAS shares, Google Drive folders, or any local path.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary flex-1"
            onClick={() => { onSave(type, path); onClose(); }}
            disabled={!path.trim()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────

function App() {
  const [projectPath, setProjectPath] = useState<string>("");
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [syncType, setSyncType] = useState<SyncTargetType>('local');
  const [syncPath, setSyncPath] = useState('');
  const [isSyncingRemote, setIsSyncingRemote] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([
    { id: 1, message: 'EditVCS panel ready.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  ]);

  const addActivity = useCallback((message: string) => {
    setActivity(prev => [{
      id: Date.now(),
      message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }, ...prev].slice(0, 50));
  }, []);

  const loadProject = useCallback(() => {
    if (window.CSInterface) {
      const csInterface = new window.CSInterface();
      csInterface.evalScript("$._editvcs.getActiveProjectPath()", (res: string) => {
        if (res && res !== "") {
          setProjectPath(res);
          setVersions(localEngine.getVersions(res));
          localEngine.watchProject(res, () => {
            setVersions(localEngine.getVersions(res));
          });
        }
      });
    } else {
      // Mock for browser testing
      const mockPath = "E:\\Projects\\Demo.prproj";
      setProjectPath(mockPath);
      setVersions(localEngine.getVersions(mockPath));
    }
  }, []);

  useEffect(() => {
    loadProject();
    const interval = setInterval(() => {
      if (window.CSInterface) {
        const csInterface = new window.CSInterface();
        csInterface.evalScript("$._editvcs.getActiveProjectPath()", (res: string) => {
          if (res && res !== projectPath) {
            loadProject();
          }
        });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [loadProject, projectPath]);

  // ── Save Cut handler ────────────────────────────────────────────────────

  const handleSaveCut = async () => {
    if (window.CSInterface) {
      setIsSyncing(true);
      const csInterface = new window.CSInterface();
      csInterface.evalScript("$._editvcs.saveActiveProject()", async (res: string) => {
        if (projectPath) {
          await localEngine.createSnapshot(projectPath, "manual", saveNote);
          setVersions(localEngine.getVersions(projectPath));
          setSaveNote("");
          addActivity(`Cut saved: "${saveNote || 'Untitled'}"`);
        }
        setIsSyncing(false);
      });
    }
  };

  // ── Sync handler ────────────────────────────────────────────────────────

  const handleSync = async () => {
    if (!syncPath) {
      setShowSettings(true);
      return;
    }
    setIsSyncingRemote(true);
    addActivity(`Syncing to ${syncType === 'github' ? 'GitHub' : syncPath}...`);

    try {
      // In CEP mode, use Node's require to call the sync module directly
      const requireFn = (window as any).require;
      if (requireFn) {
        const { sync } = requireFn('@editvcs/storage');
        const os = requireFn('os');
        const path = requireFn('path');
        const localRoot = path.join(os.homedir(), '.editvcs', 'backups');

        const target = syncType === 'github'
          ? { type: 'github' as const, remoteUrl: syncPath }
          : { type: 'local' as const, path: syncPath };

        const result = await sync(localRoot, target);

        if (result.errors.length > 0) {
          addActivity(`Sync completed with errors: ${result.errors[0]}`);
        } else {
          addActivity(
            syncType === 'github'
              ? `Pushed to GitHub. ${result.pushed} pushed, ${result.pulled} pulled.`
              : `Synced with NAS. ${result.pushed} pushed, ${result.pulled} pulled.`
          );
        }
      } else {
        // Browser testing fallback — simulate
        await new Promise(r => setTimeout(r, 1500));
        addActivity(syncType === 'github'
          ? 'Pushed to GitHub successfully.'
          : `Synced with ${syncPath}`);
      }
    } catch (err) {
      addActivity(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSyncingRemote(false);
    }
  };

  // ── Restore handler ─────────────────────────────────────────────────────

  const handleRestore = (version: ProjectVersion) => {
    if (!window.CSInterface || !projectPath) return;

    const fs = (window as any).require('fs');
    const path = (window as any).require('path');
    const os = (window as any).require('os');
    const backupDir = path.join(os.homedir(), '.editvcs', 'backups');

    // Find the backup file for this version
    const snapshotFile = `${version.id}_${version.filename}`;
    const snapshotPath = path.join(backupDir, snapshotFile);

    if (!fs.existsSync(snapshotPath)) {
      addActivity(`Restore failed: snapshot file not found.`);
      return;
    }

    // Copy snapshot back to the project path
    try {
      fs.copyFileSync(snapshotPath, projectPath);
      addActivity(`Restored to v${version.versionNumber}${version.note ? ` — "${version.note}"` : ''}`);

      // Tell Premiere to reopen the project
      const csInterface = new window.CSInterface();
      csInterface.evalScript(`$._editvcs.reopenProject("${projectPath.replace(/\\/g, '\\\\')}")`);
    } catch (err) {
      addActivity(`Restore failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSaveSettings = (type: SyncTargetType, path: string) => {
    setSyncType(type);
    setSyncPath(path);
    addActivity(`Sync target set: ${type === 'github' ? 'GitHub' : path}`);
  };

  const projectName = projectPath
    ? projectPath.split('\\').pop()?.split('/').pop()
    : "No Project Open";

  const syncLabel = syncPath
    ? (syncType === 'github' ? 'Push to GitHub' : 'Sync to NAS')
    : 'Set Up Sync';

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-surface)' }}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black" style={{ background: 'var(--color-accent)', color: 'var(--color-bg-base)' }}>
            E
          </div>
          <span className="text-sm font-semibold tracking-tight">EditVCS</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
            Version:
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-accent)' }}>
            main ▸
          </span>
        </div>
      </div>

      {/* ── Project bar ────────────────────────────────────────────────── */}
      <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 overflow-hidden min-w-0">
          <FileText size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <span className="text-xs font-medium truncate">{projectName}</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="btn-icon" onClick={() => setShowSettings(true)} title="Sync Settings">
            <Settings size={14} />
          </button>
          <button className="btn-icon" onClick={loadProject} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ── Main scrollable area ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-2">

        {!projectPath ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-[200px]" style={{ color: 'var(--color-text-muted)' }}>
              <FileText size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Open a Premiere Pro project to start tracking.</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── WORKFLOW section ─────────────────────────────────────── */}
            <Accordion title="Workflow">
              <div className="flex flex-wrap gap-2 pb-3">
                <button className="btn btn-ghost text-xs">
                  <GitBranch size={12} /> New Version
                </button>
                <button className="btn btn-ghost text-xs">
                  <ArrowDownCircle size={12} /> Switch
                </button>
                <button className="btn btn-ghost text-xs">
                  <Merge size={12} /> Combine
                </button>
                <button
                  className={`btn text-xs ${syncPath ? 'btn-ghost' : 'btn-primary'}`}
                  onClick={handleSync}
                  disabled={isSyncingRemote}
                >
                  {isSyncingRemote
                    ? <RefreshCw size={12} className="animate-spin" />
                    : syncType === 'github'
                      ? <ArrowUpCircle size={12} />
                      : <CloudUpload size={12} />
                  }
                  {isSyncingRemote ? 'Syncing...' : syncLabel}
                </button>
              </div>
            </Accordion>

            {/* ── ACTIVITY section ─────────────────────────────────────── */}
            <Accordion title="Activity" defaultOpen={false}>
              <div
                className="rounded-lg p-2 mb-3 max-h-[100px] overflow-y-auto"
                style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}
              >
                {activity.map(entry => (
                  <div key={entry.id} className="flex items-start gap-2 py-1 text-[11px]">
                    <span style={{ color: 'var(--color-text-muted)' }} className="shrink-0">{entry.time}</span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{entry.message}</span>
                  </div>
                ))}
              </div>
            </Accordion>

            {/* ── MODIFIED ASSETS section ──────────────────────────────── */}
            <Accordion title="Modified Assets">
              <div className="flex flex-col gap-2 pb-3">
                <input
                  className="input"
                  value={saveNote}
                  onChange={(e) => setSaveNote(e.target.value)}
                  placeholder="Describe this cut..."
                />
                <button
                  className="btn btn-primary w-full"
                  onClick={handleSaveCut}
                  disabled={isSyncing}
                >
                  {isSyncing ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  {isSyncing ? 'Saving...' : 'Save Cut'}
                </button>

                {/* Mock file list */}
                <div className="mt-1 space-y-1">
                  {MOCK_CHANGED_FILES.map((file) => {
                    const Icon = FILE_ICONS[file.type];
                    return (
                      <div
                        key={file.name}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs"
                        style={{ background: 'var(--color-bg-surface)' }}
                      >
                        <Icon size={12} style={{ color: 'var(--color-text-muted)' }} />
                        <span className="truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                          {file.name}
                        </span>
                        <span className={`file-badge ${file.status}`}>
                          {file.status === 'modified' ? 'M' : 'A'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Accordion>

            {/* ── HISTORY section ──────────────────────────────────────── */}
            <Accordion title="History">
              <div className="pb-4">
                {versions.length === 0 ? (
                  <div className="text-center py-6 rounded-xl" style={{ border: '1px dashed var(--color-border)' }}>
                    <Save size={20} className="mx-auto mb-2 opacity-20" />
                    <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      Save a cut to start building history.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0">
                    {versions.map((v, i) => (
                      <div key={v.id} className="flex gap-3 fade-in">
                        {/* Timeline rail */}
                        <div className="flex flex-col items-center pt-1">
                          <div className={`timeline-node ${i === 0 ? 'active' : ''}`} />
                          {i !== versions.length - 1 && <div className="timeline-line" />}
                        </div>

                        {/* Card */}
                        <div className="glass rounded-lg p-3 mb-2 flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                  v{v.versionNumber}
                                </span>
                                {v.checkpointType === 'manual' && (
                                  <span
                                    className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                                    style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}
                                  >
                                    Manual
                                  </span>
                                )}
                              </div>
                              {v.note && (
                                <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                                  {v.note}
                                </p>
                              )}
                            </div>
                            <span className="text-[10px] shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                              {new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                              {v.contentHash.substring(0, 8)}
                            </span>
                            <button
                              className="text-[11px] font-medium px-2 py-1 rounded transition-colors"
                              style={{
                                color: 'var(--color-accent)',
                                background: 'var(--color-accent-dim)',
                              }}
                              onClick={() => handleRestore(v)}
                            >
                              Restore
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Accordion>
          </>
        )}
      </div>

      {/* ── Settings Modal ─────────────────────────────────────────────── */}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          syncType={syncType}
          syncPath={syncPath}
          onSave={handleSaveSettings}
        />
      )}
    </div>
  );
}

export default App;
