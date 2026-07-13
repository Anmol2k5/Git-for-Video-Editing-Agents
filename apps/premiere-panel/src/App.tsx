import { useEffect, useState, useCallback } from 'react';
import {
  Settings, Save, RefreshCw, FileText, ChevronRight,
  GitBranch, CloudUpload, Key, Shield, AlertTriangle, CheckCircle,
  HelpCircle, Eye, EyeOff, FolderOpen, Play
} from 'lucide-react';
import { companionClient as client, ProjectVersion } from './engine';
import type { PremiereProjectManifest } from '@editvcs/shared-types';

declare global {
  interface Window {
    CSInterface: any;
  }
}

type SyncTargetType = 'local' | 'github';
type ActivityEntry = { id: number; message: string; time: string };

const VITE_EXPERIMENTAL_ENABLED = import.meta.env.VITE_EDITVCS_ENABLE_EXPERIMENTAL_FEATURES === "true";
const MAX_MANIFEST_SIZE_BYTES = 1024 * 1024;
const MAX_MANIFEST_CLIPS = 500;

// ─── Accordion component ────────────────────────────────────────────────────
function Accordion({ title, defaultOpen = true, children }: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-1" style={{ transition: 'all 120ms ease-in-out' }}>
      <button
        className="accordion-header w-full flex items-center justify-between text-left focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        onClick={() => setOpen(!open)}
        style={{ height: '32px' }}
      >
        <div className="flex items-center gap-1.5">
          <ChevronRight size={10} className={`accordion-chevron ${open ? 'open' : ''}`} />
          {title}
        </div>
      </button>
      {open && <div className="fade-in px-1">{children}</div>}
    </div>
  );
}

const evalScriptWithTimeout = (script: string, timeoutMs: number = 4000): Promise<string> => {
  return new Promise((resolve) => {
    if (window.CSInterface) {
      const csInterface = new window.CSInterface();
      const timeout = setTimeout(() => {
        resolve("ERROR_TIMEOUT");
      }, timeoutMs);

      csInterface.evalScript(script, (res: string) => {
        clearTimeout(timeout);
        resolve(res);
      });
    } else {
      resolve("ERROR_NO_CEP");
    }
  });
};

// ─── Main App ───────────────────────────────────────────────────────────────
function App() {
  const [projectPath, setProjectPath] = useState<string>("");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  
  // Pairing State
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('editvcs_session_token') : null;
  });
  const [pairingId, setPairingId] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingTimeLeft, setPairingTimeLeft] = useState(0);
  const [companionHealthy, setCompanionHealthy] = useState(true);

  // Restore State
  const [restoringVersion, setRestoringVersion] = useState<ProjectVersion | null>(null);
  const [restoreDest, setRestoreDest] = useState("");
  const [restoreProgress, setRestoreProgress] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Compare Diff State
  const [diffVersionFrom, setDiffVersionFrom] = useState<ProjectVersion | null>(null);
  const [diffVersionTo, setDiffVersionTo] = useState<ProjectVersion | null>(null);
  const [diffResult, setDiffResult] = useState<{
    confidence: string;
    summary: string[];
    groups: Array<{ title: string; items: string[] }>;
    unsupported: string[];
  } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const [activity, setActivity] = useState<ActivityEntry[]>([
    { id: 1, message: 'EditVCS panel initialized.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  ]);

  const addActivity = useCallback((message: string) => {
    setActivity(prev => [{
      id: Date.now(),
      message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }, ...prev].slice(0, 50));
  }, []);

  // Update companion client token when state changes
  useEffect(() => {
    client.sessionToken = sessionToken;
    if (typeof sessionStorage !== 'undefined') {
      if (sessionToken) {
        sessionStorage.setItem('editvcs_session_token', sessionToken);
      } else {
        sessionStorage.removeItem('editvcs_session_token');
      }
    }
  }, [sessionToken]);

  // Handle unauthorized response (session expired or companion restarted)
  useEffect(() => {
    client.onUnauthorized = () => {
      setSessionToken(null);
      setCurrentProjectId(null);
      setVersions([]);
      setPairingError("Session expired or companion restarted. Pair again.");
    };
    return () => {
      client.onUnauthorized = undefined;
    };
  }, []);

  // Timer for pairing code expiration
  useEffect(() => {
    if (pairingTimeLeft <= 0) return;
    const timer = setInterval(() => {
      setPairingTimeLeft(prev => {
        if (prev <= 1) {
          setPairingId(null);
          setPairingError("Pairing session expired. Please start pairing again.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [pairingTimeLeft]);

  const checkHealth = useCallback(async () => {
    const isOk = await client.isReachable();
    if (companionHealthy !== isOk) {
      setCompanionHealthy(isOk);
      if (!isOk) {
        addActivity("Warning: Companion service disconnected or unhealthy.");
      } else {
        addActivity("Success: Connected to companion service.");
      }
    }
  }, [companionHealthy, addActivity]);

  // Periodic health check
  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, 5000);
    return () => clearInterval(timer);
  }, [checkHealth]);

  const loadProject = useCallback(async () => {
    if (!sessionToken) return;
    
    if (window.CSInterface) {
      const res = await evalScriptWithTimeout("$._editvcs.getActiveProjectPath()", 3000);
      if (res && res !== "" && res !== "evalFiles" && res !== "ERROR_TIMEOUT" && res !== "ERROR_NO_CEP") {
        setProjectPath(res);
        try {
          const registeredId = await client.registerProject(res);
          if (registeredId) {
            setCurrentProjectId(registeredId);
            setVersions(await client.listSnapshots(registeredId));
          } else {
            addActivity("Error: Failed to register project in companion registry.");
          }
        } catch (err: any) {
          addActivity(`Error: Project registration failed: ${err.message || String(err)}`);
        }
      } else {
        setProjectPath("");
        setCurrentProjectId(null);
        setVersions([]);
      }
    } else {
      // Mock environment when loaded outside Premiere Pro CEP
      setProjectPath("E:/Work/Film.prproj");
      const registeredId = await client.registerProject("E:/Work/Film.prproj");
      if (registeredId) {
        setCurrentProjectId(registeredId);
        setVersions(await client.listSnapshots(registeredId));
      }
    }
  }, [sessionToken, addActivity]);

  // Reload project when window active project path changes
  useEffect(() => {
    if (sessionToken) {
      loadProject();
      const interval = setInterval(async () => {
        if (window.CSInterface) {
          const res = await evalScriptWithTimeout("$._editvcs.getActiveProjectPath()", 3000);
          if (res && res !== "" && res !== "evalFiles" && res !== "ERROR_TIMEOUT" && res !== "ERROR_NO_CEP" && res !== projectPath) {
            loadProject();
          }
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [loadProject, projectPath, sessionToken]);

  // ── Pairing functions ─────────────────────────────────────────────────────
  const handleStartPairing = async () => {
    setPairingError(null);
    setPairingCode("");
    const res = await client.startPairing();
    if (res) {
      setPairingId(res.pairingId);
      const remainingSecs = Math.max(0, Math.round((res.expiresAt - Date.now()) / 1000));
      setPairingTimeLeft(remainingSecs);
      addActivity("Pairing started. Enter the code shown in the companion.");
    } else {
      setPairingError("Failed to initiate pairing. Verify companion is running.");
    }
  };

  const handleCompletePairing = async () => {
    if (!pairingId || !pairingCode) return;
    setPairingError(null);
    const success = await client.completePairing(pairingId, pairingCode);
    if (success) {
      setSessionToken(client.sessionToken);
      setPairingId(null);
      addActivity("Pairing completed. Panel successfully authenticated.");
    } else {
      setPairingError("Invalid code or too many invalid attempts.");
    }
  };

  const handleDisconnect = async () => {
    if (sessionToken) {
      try {
        await fetch(`http://127.0.0.1:8731/sessions/revoke`, {
          method: "POST",
          headers: { authorization: `Bearer ${sessionToken}` }
        });
      } catch {}
    }
    setSessionToken(null);
    setCurrentProjectId(null);
    setVersions([]);
    addActivity("Session revoked. Disconnected.");
  };

  // ── ExtendScript Timeline Extraction ──────────────────────────────────────
  const getTimelineStatePromise = (): Promise<any> => {
    return new Promise((resolve) => {
      if (window.CSInterface) {
        const csInterface = new window.CSInterface();
        const timeout = setTimeout(() => {
          resolve({ error: "TIMEOUT", reason: "ExtendScript metadata collection timed out." });
        }, 4000);

        csInterface.evalScript("$._editvcs.getTimelineState()", (res: string) => {
          clearTimeout(timeout);
          try {
            if (!res || res.startsWith("evalFiles") || res === "") {
              resolve({ error: "EMPTY", reason: "No active sequence found." });
            } else {
              resolve(JSON.parse(res));
            }
          } catch (err) {
            resolve({ error: "PARSE_ERROR", reason: "Failed to parse timeline JSON metadata." });
          }
        });
      } else {
        // Mock data
        resolve({
          projectName: "Film.prproj",
          sequenceName: "Main Edit",
          framerate: 24,
          videoTracks: [
            {
              id: "v1",
              name: "Video 1",
              clips: [{ id: "clip1", name: "Footage_01.mov", start: 0, end: 10, inPoint: 0, outPoint: 10, duration: 10 }]
            }
          ],
          audioTracks: []
        });
      }
    });
  };

  const mapTimelineToManifest = (timelineData: any, projectFilePath: string): PremiereProjectManifest => {
    const TICKS_PER_SECOND = 254_016_000_000;
    const toTicksStr = (sec: number) => String(Math.round(sec * TICKS_PER_SECOND));

    const sequences = [];
    if (timelineData && !timelineData.error) {
      const clipsList: any[] = [];
      
      if (Array.isArray(timelineData.videoTracks)) {
        timelineData.videoTracks.forEach((track: any, trackIdx: number) => {
          if (Array.isArray(track.clips)) {
            track.clips.forEach((clip: any) => {
              clipsList.push({
                stableFingerprint: clip.id || `fallback_video_${clip.name}_${clip.inPoint}_${clip.outPoint}`,
                name: clip.name,
                trackType: "video" as const,
                trackIndex: trackIdx,
                startTicks: toTicksStr(clip.start),
                endTicks: toTicksStr(clip.end),
                inTicks: toTicksStr(clip.inPoint),
                outTicks: toTicksStr(clip.outPoint)
              });
            });
          }
        });
      }

      if (Array.isArray(timelineData.audioTracks)) {
        timelineData.audioTracks.forEach((track: any, trackIdx: number) => {
          if (Array.isArray(track.clips)) {
            track.clips.forEach((clip: any) => {
              clipsList.push({
                stableFingerprint: clip.id || `fallback_audio_${clip.name}_${clip.inPoint}_${clip.outPoint}`,
                name: clip.name,
                trackType: "audio" as const,
                trackIndex: trackIdx,
                startTicks: toTicksStr(clip.start),
                endTicks: toTicksStr(clip.end),
                inTicks: toTicksStr(clip.inPoint),
                outTicks: toTicksStr(clip.outPoint)
              });
            });
          }
        });
      }

      sequences.push({
        name: timelineData.sequenceName || "Active Sequence",
        clips: clipsList
      });
    }

    return {
      projectName: timelineData.projectName || projectFilePath.split(/[\\/]/).pop() || "Project",
      projectPathHint: projectFilePath,
      capturedAt: new Date().toISOString(),
      sequences
    };
  };

  // ── Save Point handler ────────────────────────────────────────────────────
  const handleSavePoint = async () => {
    if (!projectPath || !currentProjectId) return;
    setIsSyncing(true);
    addActivity("Saving Premiere project file...");

    const executeSnapshotCreation = async (manifestObj: any, statusStr: string, reasonStr?: string) => {
      addActivity("Stable project file verification...");
      try {
        const response = await client.createSnapshot(
          currentProjectId,
          "manual",
          saveNote,
          manifestObj,
          statusStr,
          reasonStr
        );

        if (response.created) {
          addActivity(`Success: Save Point created: "${saveNote || 'Manual save point'}"`);
          setSaveNote("");
          setVersions(await client.listSnapshots(currentProjectId));
        } else {
          addActivity(`Save Point skipped: ${response.message || 'No modifications detected.'}`);
        }
      } catch (err: any) {
        addActivity(`Error: Save point creation failed: ${err.message || String(err)}`);
      } finally {
        setIsSyncing(false);
      }
    };

    if (window.CSInterface) {
      const res = await evalScriptWithTimeout("$._editvcs.saveActiveProject()", 5000);
      if (res !== "SUCCESS") {
        setIsSyncing(false);
        addActivity("Premiere could not save the project. Save point was not created.");
        return;
      }

      // 2. Fetch timeline metadata
      addActivity("Collecting active sequence timeline metadata...");
      const timelineData = await getTimelineStatePromise();

      // 3. Map to manifest and validate limits
      const manifest = mapTimelineToManifest(timelineData, projectPath);
      let status = "verified";
      let reason = undefined;

      const totalClips = manifest.sequences.reduce((acc, s) => acc + (s.clips?.length ?? 0), 0);
      const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest)).byteLength;

      if (timelineData.error) {
        status = "unavailable";
        reason = timelineData.reason || "ExtendScript collection error.";
      } else if (totalClips > MAX_MANIFEST_CLIPS) {
        status = "unavailable";
        reason = "Timeline clip count exceeded the supported Phase-1 limit.";
      } else if (manifestBytes > MAX_MANIFEST_SIZE_BYTES) {
        status = "unavailable";
        reason = "Timeline metadata exceeded the Phase-1 size limit.";
      }

      await executeSnapshotCreation(status === "verified" ? manifest : null, status, reason);
    } else {
      // Mock flow
      const mockManifest = mapTimelineToManifest(
        { projectName: "Film.prproj", sequenceName: "Main Edit", videoTracks: [] },
        projectPath
      );
      await executeSnapshotCreation(mockManifest, "verified");
    }
  };

  // ── Restore handler ───────────────────────────────────────────────────────
  const handleOpenRestoreConfirm = (version: ProjectVersion) => {
    setRestoringVersion(version);
    setRestoreError(null);
    // Pre-fill with original parent path
    const parentPath = projectPath.substring(0, Math.max(projectPath.lastIndexOf('/'), projectPath.lastIndexOf('\\')) + 1);
    setRestoreDest(parentPath);
  };

  const handleConfirmRestore = async () => {
    if (!restoringVersion || !restoreDest) return;
    setRestoreProgress(true);
    setRestoreError(null);

    try {
      const restoredPath = await client.restore(restoringVersion, restoreDest);
      if (!restoredPath) {
        setRestoreError("Restore failed. Verify destination folder is writable and folder path is correct.");
      } else {
        addActivity(`Restore copy created: ${restoredPath.split(/[\\/]/).pop()}`);
        setRestoringVersion(null);
      }
    } catch (err: any) {
      setRestoreError(err.message || String(err));
    } finally {
      setRestoreProgress(false);
    }
  };

  // ── Compare Diff Handler ──────────────────────────────────────────────────
  const handleCompare = async (from: ProjectVersion, to: ProjectVersion) => {
    setDiffVersionFrom(from);
    setDiffVersionTo(to);
    setDiffLoading(true);
    setDiffError(null);
    setDiffResult(null);

    try {
      const result = await client.getChanges(currentProjectId!, from.id, to.id);
      if (!result) {
        setDiffError("Failed to fetch changes comparison.");
      } else {
        setDiffResult(result);
      }
    } catch (err: any) {
      setDiffError(err.message || String(err));
    } finally {
      setDiffLoading(false);
    }
  };

  const projectName = projectPath
    ? projectPath.split('\\').pop()?.split('/').pop()
    : "No Project Open";

  // ── Render Screens ────────────────────────────────────────────────────────

  // Screen 1: Companion offline
  if (!companionHealthy) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-6 text-center bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
        <AlertTriangle size={36} className="text-[#f87171] mb-3 animate-pulse" />
        <h3 className="text-sm font-semibold mb-1">Companion Service Offline</h3>
        <p className="text-[11px] text-[var(--color-text-secondary)] max-w-[220px] mb-4">
          Make sure the EditVCS companion service is running. Port 8731 must be open on localhost.
        </p>
        <button className="btn btn-ghost" onClick={checkHealth}>
          <RefreshCw size={12} className="mr-1.5" /> Reconnect
        </button>
      </div>
    );
  }

  // Screen 2: Unpaired / Authenticate
  if (!sessionToken) {
    return (
      <div className="flex h-screen flex-col p-6 bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-black bg-[var(--color-accent)] text-[var(--color-bg-base)]">
            E
          </div>
          <span className="text-sm font-bold tracking-tight">EditVCS Pairing</span>
        </div>

        {pairingId ? (
          <div className="flex-1 flex flex-col justify-center">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
              Enter Pairing Code
            </h3>
            <p className="text-[11px] text-[var(--color-text-muted)] mb-4">
              Enter the 6-digit pairing code printed in the companion's terminal window.
            </p>
            
            <input
              type="text"
              className="input text-center text-lg font-mono tracking-widest mb-3 h-[44px]"
              maxLength={6}
              placeholder="000000"
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value.replace(/\D/g, ''))}
            />

            {pairingError && (
              <p className="text-[11px] text-[#f87171] mb-3">{pairingError}</p>
            )}

            <p className="text-[10px] text-[var(--color-text-muted)] mb-4 text-center">
              Expires in: <span className="font-bold text-[var(--color-accent)]">{pairingTimeLeft}s</span>
            </p>

            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1 h-[36px]" onClick={() => setPairingId(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary flex-1 h-[36px]"
                disabled={pairingCode.length !== 6}
                onClick={handleCompletePairing}
              >
                Pair Panel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-center items-center text-center">
            <Shield size={32} className="text-[var(--color-accent)] mb-3 opacity-80" />
            <h3 className="text-sm font-semibold mb-1">Authorization Required</h3>
            <p className="text-[11px] text-[var(--color-text-secondary)] max-w-[200px] mb-6">
              You must pair the Premiere panel with the companion service before registering files.
            </p>
            {pairingError && (
              <p className="text-[11px] text-[#f87171] mb-3 max-w-[220px]">{pairingError}</p>
            )}
            <button
              className="btn btn-primary w-full h-[44px]"
              onClick={handleStartPairing}
            >
              <Key size={14} /> Pair with Companion
            </button>
          </div>
        )}
      </div>
    );
  }

  // Screen 3: Normal interface (Paired)
  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}>

      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-surface)' }}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black bg-[var(--color-accent)] text-[var(--color-bg-base)]">
            E
          </div>
          <span className="text-sm font-semibold tracking-tight">EditVCS</span>
        </div>
        <button
          className="text-[10px] text-[var(--color-text-secondary)] hover:text-white uppercase tracking-wider font-semibold focus:outline-none"
          onClick={handleDisconnect}
        >
          Disconnect
        </button>
      </div>

      {/* Project Bar */}
      <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 overflow-hidden min-w-0">
          <FileText size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <span className="text-xs font-medium truncate" title={projectPath || undefined}>{projectName}</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="btn-icon focus:ring-1 focus:ring-[var(--color-accent)]" onClick={loadProject} title="Refresh Project">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
        {!projectPath ? (
          <div className="flex items-center justify-center h-full min-h-[250px]">
            <div className="text-center max-w-[200px]" style={{ color: 'var(--color-text-muted)' }}>
              <FileText size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-xs">No project open. Open a Premiere Pro project to start versioning.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Save Point creation */}
            <Accordion title="Create Save Point">
              <div className="flex flex-col gap-2 pb-3">
                <input
                  className="input focus:ring-1 focus:ring-[var(--color-accent)]"
                  value={saveNote}
                  onChange={(e) => setSaveNote(e.target.value)}
                  placeholder="What changes did you make in this cut?"
                />
                <button
                  className="btn btn-primary w-full h-[44px] select-none"
                  onClick={handleSavePoint}
                  disabled={isSyncing || !saveNote.trim()}
                >
                  {isSyncing ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  {isSyncing ? 'Creating Save Point...' : 'Create Save Point'}
                </button>
                <p className="text-[10px] text-[var(--color-text-muted)] leading-tight">
                  This copies the current `.prproj` file and captures sequence details. Source media footage is not backed up.
                </p>
              </div>
            </Accordion>

            {/* Compare Changes Modal / Panel */}
            {diffVersionFrom && diffVersionTo && (
              <div className="p-3 rounded-lg border border-[var(--color-border)] mb-3 bg-[var(--color-bg-surface)]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold">Comparing v{diffVersionFrom.versionNumber} to v{diffVersionTo.versionNumber}</h4>
                  <button className="text-[10px] text-[var(--color-text-muted)] hover:text-white" onClick={() => { setDiffVersionFrom(null); setDiffVersionTo(null); setDiffResult(null); }}>
                    Clear
                  </button>
                </div>
                {diffLoading ? (
                  <p className="text-[11px] text-[var(--color-text-secondary)]">Computing differences...</p>
                ) : diffError ? (
                  <p className="text-[11px] text-[#f87171]">{diffError}</p>
                ) : diffResult ? (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-[var(--color-accent)]">
                      Confidence Level: {diffResult.confidence}
                    </p>
                    {diffResult.summary.length > 0 ? (
                      <ul className="list-disc list-inside text-[11px] text-[var(--color-text-secondary)] space-y-1">
                        {diffResult.summary.map((s, idx) => (
                          <li key={idx}>{s}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-[var(--color-text-muted)]">No changes detected between these manifests.</p>
                    )}
                    {diffResult.unsupported.map((u, idx) => (
                      <p key={idx} className="text-[10px] text-amber-400 font-semibold">{u}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {/* History Rail */}
            <Accordion title="Version History">
              <div className="pb-4">
                {versions.length === 0 ? (
                  <div className="text-center py-6 rounded-xl" style={{ border: '1px dashed var(--color-border)' }}>
                    <Save size={20} className="mx-auto mb-2 opacity-20" />
                    <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      No save points. Describe your changes above to create your first save point.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {versions.map((v, i) => (
                      <div key={v.id} className="flex gap-2.5 items-stretch">
                        {/* Timeline */}
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`timeline-node ${i === 0 ? 'active' : ''}`} />
                          {i !== versions.length - 1 && <div className="timeline-line" />}
                        </div>

                        {/* Card */}
                        <div className="glass rounded-lg p-3 flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between gap-1 flex-wrap mb-1">
                              <span className="text-xs font-bold text-[var(--color-text-primary)]">v{v.versionNumber}</span>
                              <span className="text-[9px] text-[var(--color-text-muted)]">
                                {new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {v.note && (
                              <p className="text-[11px] text-[var(--color-text-secondary)] leading-tight mb-2 break-words">
                                {v.note}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[rgba(255,255,255,0.03)]">
                            <span className="text-[9px] font-mono text-[var(--color-text-muted)]">
                              {v.contentHash.substring(0, 8)}
                            </span>
                            <div className="flex gap-1.5">
                              {i < versions.length - 1 && (
                                <button
                                  className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]"
                                  onClick={() => handleCompare(versions[i+1], v)}
                                >
                                  Diff
                                </button>
                              )}
                              <button
                                className="text-[10px] font-semibold px-2 py-1 rounded text-[var(--color-accent)] bg-[var(--color-accent-dim)] hover:bg-[var(--color-accent-glow)]"
                                onClick={() => handleOpenRestoreConfirm(v)}
                              >
                                Restore as Copy
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Accordion>

            {/* Activity Log */}
            <Accordion title="Activity Log" defaultOpen={false}>
              <div
                className="rounded-lg p-2 mb-3 max-h-[100px] overflow-y-auto"
                style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}
              >
                {activity.map(entry => (
                  <div key={entry.id} className="flex items-start gap-2 py-0.5 text-[10px]">
                    <span style={{ color: 'var(--color-text-muted)' }} className="shrink-0">{entry.time}</span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{entry.message}</span>
                  </div>
                ))}
              </div>
            </Accordion>

            {/* Experimental banner for developer debugging */}
            {VITE_EXPERIMENTAL_ENABLED && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <p className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider mb-1">Experimental Features Enabled</p>
                <div className="flex gap-1">
                  <button className="btn btn-ghost text-[10px] py-1 px-2"><GitBranch size={10} /> New Version</button>
                  <button className="btn btn-ghost text-[10px] py-1 px-2"><CloudUpload size={10} /> Push</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Restore Destination Confirmation Modal */}
      {restoringVersion && (
        <div className="modal-backdrop">
          <div className="modal-content w-[320px] p-4 bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)]">
            <h3 className="text-sm font-semibold mb-1">Restore as Copy</h3>
            <p className="text-[11px] text-[var(--color-text-secondary)] mb-3">
              Create a new copy of v{restoringVersion.versionNumber} in the directory below. The active project file will not be touched.
            </p>

            <div className="mb-3">
              <label className="text-[9px] uppercase tracking-wider font-bold text-[var(--color-text-muted)] mb-1 block">
                Destination Directory
              </label>
              <input
                type="text"
                className="input text-xs"
                value={restoreDest}
                onChange={(e) => setRestoreDest(e.target.value)}
                placeholder="Folder absolute path..."
              />
            </div>

            {restoreError && (
              <p className="text-[11px] text-[#f87171] mb-3">{restoreError}</p>
            )}

            <div className="flex gap-2">
              <button
                className="btn btn-ghost flex-1 h-[36px]"
                onClick={() => setRestoringVersion(null)}
                disabled={restoreProgress}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary flex-1 h-[36px]"
                onClick={handleConfirmRestore}
                disabled={restoreProgress || !restoreDest.trim()}
              >
                {restoreProgress ? 'Restoring...' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
