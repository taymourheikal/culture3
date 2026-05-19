import { Activity, CircleHelp, FlaskConical } from "lucide-react";

export type AppMode = "live" | "batch" | "help";

type Props = {
  activeMode: AppMode;
  onChange: (mode: AppMode) => void;
};

export function AppModeTabs({ activeMode, onChange }: Props) {
  return (
    <div className="app-mode-tabs" aria-label="Application mode">
      <button
        type="button"
        className={activeMode === "live" ? "app-mode-tab active" : "app-mode-tab"}
        onClick={() => onChange("live")}
      >
        <Activity size={15} />
        Live
      </button>
      <button
        type="button"
        className={activeMode === "batch" ? "app-mode-tab active" : "app-mode-tab"}
        onClick={() => onChange("batch")}
      >
        <FlaskConical size={15} />
        Batch
      </button>
      <button
        type="button"
        className={activeMode === "help" ? "app-mode-tab active" : "app-mode-tab"}
        onClick={() => onChange("help")}
        title="Help"
      >
        <CircleHelp size={15} />
      </button>
    </div>
  );
}
