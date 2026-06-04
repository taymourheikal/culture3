import { HELP_SECTIONS, SineHelpContent } from "./help/SineHelpContent";
import { SineViewTabs } from "./SineViewTabs";
import type { SineView } from "./SineApp";

export function SineHelpPage({ activeView, onViewChange }: { activeView: SineView; onViewChange: (view: SineView) => void }) {
  return (
    <main className="sine-help-shell">
      <header className="sine-help-header">
        <div>
          <span className="sine-eyebrow">Toy Market Simulator</span>
          <h1>Help</h1>
        </div>
        <SineViewTabs activeView={activeView} onViewChange={onViewChange} />
      </header>

      <nav className="sine-help-nav" aria-label="Help sections">
        {HELP_SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`}>
            {section.label}
          </a>
        ))}
      </nav>

      <SineHelpContent />
    </main>
  );
}
