import type { ReactNode } from "react";

export function shortSessionId(sessionId: string) {
  return sessionId.slice(0, 8);
}

export function HistorySummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="sine-history-summary">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function HistorySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <div className="sine-history-section-title">{title}</div>
      {children}
    </section>
  );
}

export function SpawnerHistoryButton({ spawnerId, children, onInspect }: { spawnerId: number; children: ReactNode; onInspect: (spawnerId: number) => void }) {
  return (
    <button type="button" onClick={() => onInspect(spawnerId)}>
      {children}
    </button>
  );
}
