import { useEffect, useState, useCallback } from 'react';
import { History, Save, Play, RefreshCw, FileText } from 'lucide-react';
import { localEngine, ProjectVersion } from './engine';

// Use CSInterface from global window
declare global {
  interface Window {
    CSInterface: any;
  }
}

function App() {
  const [projectPath, setProjectPath] = useState<string>("");
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadProject = useCallback(() => {
    if (window.CSInterface) {
      const csInterface = new window.CSInterface();
      csInterface.evalScript("$._editvcs.getActiveProjectPath()", (res: string) => {
        if (res && res !== "") {
          setProjectPath(res);
          setVersions(localEngine.getVersions(res));
          // Start watching
          localEngine.watchProject(res, () => {
            setVersions(localEngine.getVersions(res));
          });
        }
      });
    } else {
      // Mock for browser testing
      setProjectPath("E:\\Projects\\Demo.prproj");
      setVersions(localEngine.getVersions("E:\\Projects\\Demo.prproj"));
    }
  }, []);

  useEffect(() => {
    loadProject();
    
    // Poll every 5s in case the active project changes in Premiere
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

  const handleManualCheckpoint = async () => {
    if (window.CSInterface) {
      setIsSyncing(true);
      const csInterface = new window.CSInterface();
      // Force Premiere to save the project first
      csInterface.evalScript("$._editvcs.saveActiveProject()", async (res: string) => {
        if (projectPath) {
           await localEngine.createSnapshot(projectPath, "manual");
           setVersions(localEngine.getVersions(projectPath));
        }
        setIsSyncing(false);
      });
    }
  };

  const projectName = projectPath ? projectPath.split('\\').pop()?.split('/').pop() : "No Project Open";

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0f] text-[#f0f0f5]">
      {/* Header */}
      <div className="p-4 border-b border-white/5 bg-[#111118]">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center text-[10px] font-bold">✦</div>
          <span className="text-sm font-semibold tracking-tight">EditVCS</span>
          <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-white/30">Local Node</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <FileText size={16} className="text-indigo-400 shrink-0" />
            <div className="truncate text-sm font-medium">{projectName}</div>
          </div>
          <button onClick={loadProject} className="text-white/40 hover:text-white transition-colors shrink-0">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 p-4 overflow-y-auto">
        {!projectPath ? (
          <div className="flex-1 flex items-center justify-center text-center">
            <div className="text-white/40 text-sm max-w-[200px]">
              Open a Premiere Pro project to start tracking history.
            </div>
          </div>
        ) : (
          <>
            <button 
              onClick={handleManualCheckpoint}
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors shadow-lg shadow-indigo-500/20 mb-6 shrink-0"
            >
              {isSyncing ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />} 
              {isSyncing ? "Saving..." : "Manual Checkpoint"}
            </button>

            <div className="flex items-center gap-2 mb-4">
              <History size={16} className="text-white/40" />
              <h2 className="text-sm font-medium text-white/60">Version History</h2>
            </div>

            <div className="space-y-4">
              {versions.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-white/10 rounded-xl">
                  <div className="text-xs text-white/40">Make a save to trigger a backup.</div>
                </div>
              ) : (
                versions.map((v, i) => (
                  <div key={v.id} className="flex gap-3 group">
                    <div className="flex flex-col items-center mt-1">
                      <div className={`w-2.5 h-2.5 rounded-full border-2 ${i === 0 ? 'border-indigo-400 bg-indigo-400/20' : 'border-white/20 bg-[#0a0a0f]'}`} />
                      {i !== versions.length - 1 && <div className="w-px h-full bg-white/10 my-1 group-hover:bg-white/20 transition-colors" />}
                    </div>
                    <div className="flex-1 glass rounded-xl p-3 mb-2 hover:border-white/10 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white/90 text-sm">v{v.versionNumber}</span>
                          {v.checkpointType === 'manual' && (
                            <span className="text-[9px] uppercase tracking-wider font-bold bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-sm">Manual</span>
                          )}
                        </div>
                        <span className="text-[10px] text-white/40">
                          {new Date(v.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                         <div className="text-[10px] font-mono text-white/30">
                           {v.contentHash.substring(0, 8)}
                         </div>
                         <button className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors">
                            Restore
                         </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default App;
