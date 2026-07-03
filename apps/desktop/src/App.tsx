import { useEffect, useState } from 'react';
import { useStore } from './store';
import { Folder, Clock, CheckCircle2, History, Plus, Play, MoreVertical } from 'lucide-react';

// Declare electronAPI on window
declare global {
  interface Window {
    electronAPI: {
      selectProject: () => Promise<string | null>;
      startWatching: (projectId: string, filePath: string) => Promise<{ success: boolean; error?: string }>;
      openFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      onWatchEvent: (callback: (data: any) => void) => void;
    };
  }
}

function App() {
  const { projects, addProject, currentProject, setCurrentProject, versions, addVersion, updateVersionStatus } = useStore();
  const [syncingStatus, setSyncingStatus] = useState<string>('');

  useEffect(() => {
    // Listen for watch events from main process
    if (window.electronAPI) {
      window.electronAPI.onWatchEvent((data: any) => {
        if (data.type === 'change') {
          setSyncingStatus('Saving...');
        } else if (data.type === 'snapshot_ready') {
          setSyncingStatus('Synced just now');
          
          // Add a new version (Mock Cloud Upload)
          const newVersion = {
            id: crypto.randomUUID(),
            projectId: data.projectId,
            versionNumber: (versions[data.projectId]?.length || 0) + 1,
            filename: data.filePath.split('\\').pop() || data.filePath.split('/').pop(),
            contentHash: data.hash,
            createdAt: new Date().toISOString(),
            checkpointType: "auto" as const,
            isStable: false,
            syncStatus: "synced" as const
          };
          addVersion(data.projectId, newVersion);
        }
      });
    }
  }, [versions, addVersion]);

  const handleAddProject = async () => {
    if (!window.electronAPI) return;
    const filePath = await window.electronAPI.selectProject();
    if (filePath) {
      const name = filePath.split('\\').pop()?.split('.')[0] || "New Project";
      const newProject = {
        id: crypto.randomUUID(),
        name,
        localProjectPath: filePath,
        latestVersionNumber: 1
      };
      addProject(newProject);
      setCurrentProject(newProject);

      // Start watching
      window.electronAPI.startWatching(newProject.id, filePath);
    }
  };

  const handleOpenProject = async (filePath: string) => {
    if (!window.electronAPI) return;
    await window.electronAPI.openFile(filePath);
  };

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0f] text-[#f0f0f5]">
      {/* Titlebar */}
      <div className="h-10 titlebar flex items-center px-4 border-b border-white/5 select-none shrink-0 bg-[#111118]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center text-[10px] font-bold">✦</div>
          <span className="text-sm font-semibold tracking-tight">EditVCS</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-white/5 bg-[#111118] flex flex-col">
          <div className="p-4">
            <button 
              onClick={handleAddProject}
              className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-sm font-medium py-2 px-4 rounded-lg transition-colors border border-white/10 no-drag"
            >
              <Plus size={16} /> Connect Project
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider px-3 mb-2">Projects</div>
            {projects.map(p => (
              <div 
                key={p.id}
                onClick={() => {
                  setCurrentProject(p);
                  if (window.electronAPI) window.electronAPI.startWatching(p.id, p.localProjectPath);
                }}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer no-drag transition-colors ${currentProject?.id === p.id ? 'bg-indigo-500/10 text-indigo-300' : 'hover:bg-white/5'}`}
              >
                <Folder size={16} className={currentProject?.id === p.id ? 'text-indigo-400' : 'text-white/40'} />
                <div className="truncate text-sm font-medium">{p.name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0f]">
          {currentProject ? (
            <>
              {/* Header */}
              <div className="h-20 border-b border-white/5 flex items-center justify-between px-8 shrink-0">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">{currentProject.name}</h1>
                  <div className="text-sm text-white/40 mt-1 truncate max-w-md">{currentProject.localProjectPath}</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    {syncingStatus === 'Saving...' ? (
                      <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> Saving snapshot...</span>
                    ) : syncingStatus ? (
                      <span className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-400" /> {syncingStatus}</span>
                    ) : null}
                  </div>
                  <button 
                    onClick={() => handleOpenProject(currentProject.localProjectPath)}
                    className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
                  >
                    <Play size={16} fill="currentColor" /> Open in Premiere
                  </button>
                </div>
              </div>

              {/* Version History */}
              <div className="flex-1 p-8 overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-medium flex items-center gap-2"><History size={20} className="text-white/40" /> Version History</h2>
                  <button className="text-sm text-indigo-400 hover:text-indigo-300 font-medium px-3 py-1.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors">
                    + Manual Checkpoint
                  </button>
                </div>

                <div className="space-y-4">
                  {(versions[currentProject.id] || []).length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
                      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 text-white/30">
                        <History size={24} />
                      </div>
                      <div className="text-white/60 font-medium">No versions yet</div>
                      <div className="text-sm text-white/40 mt-1">Make a save in Premiere Pro to trigger a backup.</div>
                    </div>
                  ) : (
                    (versions[currentProject.id] || []).map((v, i) => (
                      <div key={v.id} className="flex gap-4 group">
                        <div className="flex flex-col items-center mt-1">
                          <div className={`w-3 h-3 rounded-full border-2 ${i === 0 ? 'border-indigo-400 bg-indigo-400/20' : 'border-white/20 bg-[#0a0a0f]'}`} />
                          {i !== (versions[currentProject.id]?.length || 0) - 1 && <div className="w-px h-full bg-white/10 my-1 group-hover:bg-white/20 transition-colors" />}
                        </div>
                        <div className="flex-1 glass rounded-xl p-4 mb-4 hover:border-white/10 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-white/90">Version {v.versionNumber}</span>
                              {v.checkpointType === 'manual' && (
                                <span className="text-[10px] uppercase tracking-wider font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">Manual</span>
                              )}
                              {i === 0 && (
                                <span className="text-[10px] uppercase tracking-wider font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Latest Safe</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-white/40 flex items-center gap-1">
                                <Clock size={12} /> {new Date(v.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </span>
                              <button className="text-white/30 hover:text-white/70 transition-colors"><MoreVertical size={16}/></button>
                            </div>
                          </div>
                          <div className="text-sm text-white/60 mb-4">
                            {v.note || `Auto-saved from ${v.filename}`}
                          </div>
                          <div className="flex items-center gap-2">
                            <button className="text-xs font-medium text-white/70 hover:text-white px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                              Restore...
                            </button>
                            <button className="text-xs font-medium text-white/70 hover:text-white px-3 py-1.5 rounded-md hover:bg-white/5 transition-colors">
                              Download
                            </button>
                            <div className="ml-auto text-xs font-mono text-white/30">
                              {v.contentHash.substring(0, 8)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="max-w-sm text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-cyan-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-500/20 shadow-glow-purple">
                  <span className="text-2xl font-bold">✦</span>
                </div>
                <h2 className="text-xl font-semibold mb-2">Never lose your latest edit again.</h2>
                <p className="text-white/50 text-sm mb-8 leading-relaxed">
                  Connect a Premiere Pro project and EditVCS will keep a safe version history automatically.
                </p>
                <button 
                  onClick={handleAddProject}
                  className="bg-white text-black font-semibold py-2.5 px-6 rounded-lg hover:bg-white/90 transition-colors"
                >
                  Connect Project
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App;
