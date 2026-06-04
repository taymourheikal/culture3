import { CircleHelp } from "lucide-react";

export function SineHelpTooltip({ help }: { help: string }) {
  return (
    <span className="sine-help" tabIndex={0} aria-label={help}>
      <CircleHelp size={13} aria-hidden="true" />
      <span className="sine-help-tooltip" role="tooltip">
        {help}
      </span>
    </span>
  );
}
