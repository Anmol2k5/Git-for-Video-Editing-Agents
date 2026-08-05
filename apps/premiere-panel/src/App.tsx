import { useEffect, useState, useCallback } from 'react';
import {
  Save, RefreshCw, FileText, GitBranch, CloudUpload
} from 'lucide-react';
import { companionClient as client, ProjectVersion, CompanionStatus } from './engine';
import type { PremiereProjectManifest } from '@editvcs/shared-types';

import { getErrorMessage } from './utils';
import { timelineStateSchema, type TimelineState } from './schemas';
import { useRestoreFlow } from './hooks/useRestoreFlow';
import { useDiff } from './hooks/useDiff';
import { usePairing } from './hooks/usePairing';

import { Accordion } from './components/Accordion';
import { Header } from './components/Header';
import { ProjectBar } from './components/ProjectBar';
import { OfflineScreen } from './components/OfflineScreen';
import { PairingScreen } from './components/PairingScreen';
import { DiffPanel } from './components/DiffPanel';

type ActivityEntry = { id: number; message: string; time: string };

const VITE_EXPERIMENTAL_ENABLED = import.meta.env.VITE_EDITVCS_ENABLE_EXPERIMENTAL_FEATURES === "true";
const MAX_MANIFEST_SIZE_BYTES = 1024 * 1024;
const MAX_MANIFEST_CLIPS = 500;

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

function App() {
  const [projectPath, setProjectPath] = useState<string>("");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const [companionStatus, setCompanionStatus] = useState<CompanionStatus>("unknown");
  const [isInitializing, setIsInitializing] = useState(true);

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

  const {
    sessionToken,
    setSessionToken,
    pairingId,
    pairingCode,
    setPairingCode,
    pairingError,
    setPairingError,
    pairingTimeLeft,
    handleCompletePairing,
    handleDisconnect
  } = usePairing(addActivity);

  const {
    restoringVersion,
    setRestoringVersion,
    restoreDest,
    setRestoreDest,
    restoreProgress,
    restoreError,
    handleOpenRestoreConfirm,
    handleConfirmRestore
  } = useRestoreFlow(addActivity);

  const {
    diffVersionFrom,
    diffVersionTo,
    diffResult,
    diffLoading,
    diffError,
    handleCompare,
    clearDiff
  } = useDiff(currentProjectId);

  useEffect(() => {
    client.onStatusChange = (status: CompanionStatus) => {
      setCompanionStatus(status);
    };
    return () => { client.onStatusChange = undefined; };
  }, []);

  const checkHealthAndRestart = useCallback(async () => {
    const isOk = await client.isReachable();
    if (isOk) {
      if (companionStatus !== "connected") {
        setCompanionStatus("connected");
        addActivity("Success: Connected to companion service.");
      }
      return;
    }

    addActivity("Warning: Companion service disconnected. Auto-restarting...");
    const delay = client.getRestartDelayMs();
    await new Promise(r => setTimeout(r, delay));
    const success = await client.ensureRunning();
    if (success && client.sessionToken) {
      setSessionToken(client.sessionToken);
      addActivity("Success: Companion auto-restarted and reconnected.");
    }
  }, [companionStatus, addActivity, setSessionToken]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setCompanionStatus("starting");
      const success = await client.ensureRunning();
      if (!mounted) return;
      if (success) {
        setCompanionStatus("connected");
        if (client.sessionToken) {
          setSessionToken(client.sessionToken);
        }
      }
      setIsInitializing(false);
    };
    init();
  }, [setSessionToken]);

  useEffect(() => {
    if (isInitializing) return;
    const timer = setInterval(checkHealthAndRestart, 5000);
    return () => clearInterval(timer);
  }, [checkHealthAndRestart, isInitializing]);

  useEffect(() => {
    if (companionStatus !== "connected") return;
    const timer = setTimeout(() => {
      client.resetRestartCounter();
    }, 30_000);
    return () => clearTimeout(timer);
  }, [companionStatus]);

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
        } catch (err: unknown) {
          addActivity(`Error: Project registration failed: ${getErrorMessage(err)}`);
        }
      } else {
        setProjectPath("");
        setCurrentProjectId(null);
        setVersions([]);
      }
    } else {
      setProjectPath("E:/Work/Film.prproj");
      const registeredId = await client.registerProject("E:/Work/Film.prproj");
      if (registeredId) {
        setCurrentProjectId(registeredId);
        setVersions(await client.listSnapshots(registeredId));
      }
    }
  }, [sessionToken, addActivity]);

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

  const getTimelineStatePromise = (): Promise<TimelineState> => {
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
              const rawData = JSON.parse(res);
              const validatedData = timelineStateSchema.parse(rawData);
              resolve(validatedData);
            }
          } catch (err: unknown) {
            resolve({ error: "PARSE_ERROR", reason: `Failed to parse timeline JSON metadata: ${getErrorMessage(err)}` });
          }
        });
      } else {
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

  const mapTimelineToManifest = (timelineData: TimelineState, projectFilePath: string): PremiereProjectManifest => {
    const TICKS_PER_SECOND = 254_016_000_000;
    const toTicksStr = (sec: number) => String(Math.round(sec * TICKS_PER_SECOND));

    const sequences = [];
    if (timelineData && !timelineData.error) {
      const clipsList: any[] = [];
      
      if (timelineData.videoTracks) {
        timelineData.videoTracks.forEach((track, trackIdx: number) => {
          if (track.clips) {
            track.clips.forEach((clip) => {
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

      if (timelineData.audioTracks) {
        timelineData.audioTracks.forEach((track, trackIdx: number) => {
          if (track.clips) {
            track.clips.forEach((clip) => {
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
      host: "premiere",
      projectName: timelineData.projectName || projectFilePath.split(/[\\/]/).pop() || "Project",
      projectPathHint: projectFilePath,
      capturedAt: new Date().toISOString(),
      sequences
    };
  };

  const handleSavePoint = async () => {
    if (!projectPath || !currentProjectId) return;
    setIsSyncing(true);
    addActivity("Saving Premiere project file...");

    const executeSnapshotCreation = async (manifestObj: PremiereProjectManifest | null, statusStr: string, reasonStr?: string) => {
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
      } catch (err: unknown) {
        addActivity(`Error: Save point creation failed: ${getErrorMessage(err)}`);
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

      addActivity("Collecting active sequence timeline metadata...");
      const timelineData = await getTimelineStatePromise();

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
      const mockManifest = mapTimelineToManifest(
        { projectName: "Film.prproj", sequenceName: "Main Edit", videoTracks: [] },
        projectPath
      );
      await executeSnapshotCreation(mockManifest, "verified");
    }
  };

  const projectName = projectPath
    ? projectPath.split('\\').pop()?.split('/').pop() || "Untitled"
    : "No Project Open";

  if (isInitializing) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-6 text-center bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
        <RefreshCw size={24} className="text-[var(--color-accent)] mb-3 animate-spin" />
        <h3 className="text-sm font-semibold mb-1">Starting Engine...</h3>
        <p className="text-[11px] text-[var(--color-text-secondary)]">
          Initializing local version control.
        </p>
      </div>
    );
  }

  if (companionStatus === "reconnecting" || companionStatus === "failed") {
    return (
      <OfflineScreen
        status={companionStatus}
        onTryAgain={async () => {
          client.resetRestartCounter();
          setCompanionStatus("reconnecting");
          const success = await client.ensureRunning();
          if (success && client.sessionToken) {
            setSessionToken(client.sessionToken);
          }
        }}
      />
    );
  }

  if (!sessionToken) {
    return (
      <PairingScreen
        pairingId={pairingId}
        pairingCode={pairingCode}
        pairingError={pairingError}
        pairingTimeLeft={pairingTimeLeft}
        onCodeChange={setPairingCode}
        onCompletePairing={handleCompletePairing}
        onCancelPairing={() => {}}
        onStartAuthenticate={async () => {
          setIsInitializing(true);
          setPairingError(null);
          client.resetRestartCounter();
          const success = await client.ensureRunning();
          if (success) {
            setCompanionStatus("connected");
            if (client.sessionToken) setSessionToken(client.sessionToken);
          } else {
            setPairingError("Failed to auto-start companion. Is it packaged correctly?");
          }
          setIsInitializing(false);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}>
      <Header onDisconnect={handleDisconnect} />
      <ProjectBar projectPath={projectPath} projectName={projectName} onRefresh={loadProject} />

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

            {diffVersionFrom && diffVersionTo && (
              <DiffPanel
                diffVersionFrom={diffVersionFrom}
                diffVersionTo={diffVersionTo}
                diffLoading={diffLoading}
                diffError={diffError}
                diffResult={diffResult}
                onClear={clearDiff}
              />
            )}

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
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`timeline-node ${i === 0 ? 'active' : ''}`} />
                          {i !== versions.length - 1 && <div className="timeline-line" />}
                        </div>

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
                                onClick={() => handleOpenRestoreConfirm(v, projectPath)}
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

            {VITE_EXPERIMENTAL_ENABLED && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-1">Experimental Features Enabled</p>
                <div className="flex gap-1">
                  <button className="btn btn-ghost text-[10px] py-1 px-2"><GitBranch size={10} /> New Version</button>
                  <button className="btn btn-ghost text-[10px] py-1 px-2"><CloudUpload size={10} /> Push</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

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
