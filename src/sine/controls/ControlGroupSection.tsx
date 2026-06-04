import { ChevronDown, Save } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

export function ControlGroupSection({
  title,
  saveTitle,
  saved,
  onSave,
  collapsible = false,
  defaultOpen = true,
  sectionId,
  children,
}: {
  title: string;
  saveTitle?: string;
  saved?: boolean;
  onSave?: () => void;
  collapsible?: boolean;
  defaultOpen?: boolean;
  sectionId?: string;
  children?: ReactNode;
}) {
  const fallbackId = useId();
  const contentId = `sine-control-group-${sectionId ?? fallbackId}`;
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`sine-control-group${collapsible ? " collapsible" : ""}${open ? "" : " collapsed"}`}>
      <div className="sine-control-group-head">
        {collapsible ? (
          <button
            type="button"
            className="sine-control-collapse-button"
            aria-expanded={open}
            aria-controls={contentId}
            onClick={() => setOpen((current) => !current)}
          >
            <ChevronDown size={15} />
            <span className="sine-control-group-title">{title}</span>
          </button>
        ) : (
          <div className="sine-control-group-title">{title}</div>
        )}
        {saved ? <div className="saved-defaults">Saved defaults</div> : null}
        {onSave ? (
          <button type="button" className="save-group-button" title={saveTitle ?? `Save ${title}`} onClick={onSave}>
            <Save size={16} />
          </button>
        ) : null}
      </div>
      <div id={contentId} className="sine-control-group-body" hidden={collapsible && !open}>
        {children}
      </div>
    </section>
  );
}
