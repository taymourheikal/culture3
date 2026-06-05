import type { ReactNode } from "react";

export function DiagnosticsPanel({ title, eyebrow, stat, children }: { title: string; eyebrow?: string; stat?: string; children: ReactNode }) {
  return (
    <section className="sine-workbench-panel">
      <div className="sine-workbench-panel-head">
        <div>
          {eyebrow ? <span className="sine-eyebrow">{eyebrow}</span> : null}
          <h2>{title}</h2>
        </div>
        {stat ? <strong>{stat}</strong> : null}
      </div>
      {children}
    </section>
  );
}
