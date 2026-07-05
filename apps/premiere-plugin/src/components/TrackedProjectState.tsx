import { CompareView } from "./CompareView";
import { RestoreDialog } from "./RestoreDialog";
import { VersionHistory } from "./VersionHistory";

interface TrackedProjectStateProps {
  host: any;
  onCreateSavePoint: () => void;
}

export function TrackedProjectState({ host, onCreateSavePoint }: TrackedProjectStateProps) {
  return (
    <main className="panel-shell">
      <header className="panel-header">
        <div>
          <h1>{host.project?.name ?? "Premiere project"}</h1>
          <p>Cloud: Not connected</p>
        </div>
        <button onClick={onCreateSavePoint}>Create Save Point</button>
      </header>

      {!host.companionConnected && (
        <section className="status-banner">
          <span>Companion service not running</span>
          <button>Retry</button>
        </section>
      )}

      {!host.capabilities?.projectPath && (
        <section className="status-banner">
          Project file location is unavailable in this Premiere version.
        </section>
      )}

      <label className="stream-control">
        Version stream
        <select defaultValue="Main edit" aria-label="Version stream">
          {host.streams.map((stream: string) => (
            <option key={stream}>{stream}</option>
          ))}
        </select>
      </label>

      <VersionHistory snapshots={host.snapshots} />
      <CompareView summary={host.changes.summary} unsupported={host.changes.unsupported} />
      <RestoreDialog />
    </main>
  );
}
