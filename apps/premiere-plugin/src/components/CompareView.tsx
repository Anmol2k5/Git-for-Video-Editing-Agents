interface CompareViewProps {
  summary: string[];
  unsupported: string[];
}

export function CompareView({ summary, unsupported }: CompareViewProps) {
  return (
    <section className="panel-section" aria-label="Changes">
      <div className="section-title">Changes</div>
      <ul className="change-list">
        {summary.map((item) => (
          <li key={item}>{item}</li>
        ))}
        {unsupported.map((item) => (
          <li className="muted" key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
