import { useState } from "react";
import { SineHelpPage } from "./SineHelpPage";
import { SineLabView } from "./SineLabView";

export type SineView = "lab" | "help";

export function SineApp() {
  const [view, setView] = useState<SineView>("lab");
  return view === "help" ? <SineHelpPage activeView={view} onViewChange={setView} /> : <SineLabView activeView={view} onViewChange={setView} />;
}
