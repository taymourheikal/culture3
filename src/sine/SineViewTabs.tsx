import { CircleHelp, FlaskConical } from "lucide-react";
import type { SineView } from "./SineApp";

export function SineViewTabs({ activeView, onViewChange }: { activeView: SineView; onViewChange: (view: SineView) => void }) {
  return (
    <div className="sine-view-tabs" aria-label="Toy market simulator view">
      <button type="button" className={activeView === "lab" ? "active" : ""} onClick={() => onViewChange("lab")}>
        Lab
      </button>
      <button type="button" className={activeView === "runs" ? "active" : ""} onClick={() => onViewChange("runs")}>
        <FlaskConical size={15} />
        Runs
      </button>
      <button type="button" className={activeView === "help" ? "active" : ""} onClick={() => onViewChange("help")} title="Help">
        <CircleHelp size={15} />
        Help
      </button>
    </div>
  );
}
