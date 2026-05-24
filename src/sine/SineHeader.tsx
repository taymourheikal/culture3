import type { SineView } from "./SineApp";
import { formatSignedPercent } from "./charts/format";
import { SineViewTabs } from "./SineViewTabs";

export function SineHeader({
  activeView,
  currentSignal,
  showReadout,
  onViewChange,
}: {
  activeView: SineView;
  currentSignal: number;
  showReadout: boolean;
  onViewChange: (view: SineView) => void;
}) {
  return (
    <div className="sine-header">
      <div>
        <span className="sine-eyebrow">Toy Market Simulator</span>
        <h1>ROC Signal Lab</h1>
      </div>
      <SineViewTabs activeView={activeView} onViewChange={onViewChange} />
      {showReadout ? (
        <div className="sine-readout">
          <span>Current ROC</span>
          <strong>{formatSignedPercent(currentSignal)}</strong>
        </div>
      ) : null}
    </div>
  );
}
