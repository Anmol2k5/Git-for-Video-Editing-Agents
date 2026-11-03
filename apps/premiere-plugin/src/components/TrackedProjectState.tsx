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
          <p>{host.isMock ? "Cloud: Not connected" : "Cloud: Unavailable in this prototype"}</p>
        </div>
        <button disabled={!host.isMock} onClick={onCreateSavePoint} title={host.isMock ? "Open a demo preview; no save point will be created." : "Save points are unavailable in this prototype."}>Create Save Point</button>
      </header>

      {!host.companionConnected && (
        <section className="status-banner">
          <span>{host.isMock ? "Companion service not running" : "Companion connection is unavailable in this UXP prototype."}</span>
          <button disabled title="Companion connection retry is unavailable in this prototype.">Retry</button>
        </section>
      )}

      {!host.capabilities?.projectPath && (
        <section className="status-banner">
          Project file location is unavailable in this Premiere version.
        </section>
      )}

      <label className="stream-control">
        Version stream
        <select disabled defaultValue={host.streams?.[0] ?? ""} aria-label="Version stream" title="Switching version streams is unavailable in this prototype.">
          {!host.streams?.length && <option value="">Unavailable in this prototype</option>}
          {(host.streams ?? []).map((stream: string) => (
            <option key={stream}>{stream}</option>
          ))}
        </select>
      </label>

      <VersionHistory snapshots={host.snapshots ?? []} />
      <CompareView summary={host.changes?.summary ?? []} unsupported={host.changes?.unsupported ?? []} />
      <RestoreDialog />
    </main>
  );
}
