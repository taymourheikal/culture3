import { Save } from "lucide-react";
import type { ReactNode } from "react";

export function ControlGroupSection({
  title,
  saveTitle,
  saved,
  onSave,
  children,
}: {
  title: string;
  saveTitle?: string;
  saved?: boolean;
  onSave?: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="sine-control-group">
      <div className="sine-control-group-head">
        <div className="sine-control-group-title">{title}</div>
        {onSave ? (
          <button type="button" className="save-group-button" title={saveTitle ?? `Save ${title}`} onClick={onSave}>
            <Save size={16} />
          </button>
        ) : null}
      </div>
      {children}
      {saved ? <div className="saved-defaults">Saved defaults</div> : null}
    </section>
  );
}
