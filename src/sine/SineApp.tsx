import { useState } from "react";
import { SineHelpPage } from "./SineHelpPage";
import { SineLabView } from "./SineLabView";
import { SineRunsView } from "./SineRunsView";

export type SineView = "lab" | "runs" | "help";

export function SineApp() {
  const [view, setView] = useState<SineView>("lab");
  if (view === "help") return <SineHelpPage activeView={view} onViewChange={setView} />;
  if (view === "runs") return <SineRunsView activeView={view} onViewChange={setView} />;
  return <SineLabView activeView={view} onViewChange={setView} />;
}
