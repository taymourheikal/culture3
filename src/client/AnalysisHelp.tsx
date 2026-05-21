import { CircleHelp } from "lucide-react";

export function AnalysisHelp({ label = "Analysis help", help }: { label?: string; help: string }) {
  return (
    <span className="analysis-help">
      <button type="button" className="analysis-help-button" aria-label={label}>
        <CircleHelp size={14} />
      </button>
      <span className="analysis-help-bubble" role="tooltip">
        {help}
      </span>
    </span>
  );
}
