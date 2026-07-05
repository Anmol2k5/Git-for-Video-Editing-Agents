interface SnapshotListItem {
  id: string;
  label: string;
  createdAt: string;
}

export function VersionHistory({ snapshots }: { snapshots: SnapshotListItem[] }) {
  return (
    <section className="panel-section" aria-label="Version history">
      <div className="section-title">Latest saved version</div>
      <ol className="history-list">
        {snapshots.map((snapshot) => (
          <li key={snapshot.id}>
            <span>{snapshot.label}</span>
            <time dateTime={snapshot.createdAt}>{new Date(snapshot.createdAt).toLocaleString()}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}
