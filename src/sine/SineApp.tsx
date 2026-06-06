import { useState } from "react";
import { SineHelpPage } from "./SineHelpPage";
import { SineLabView } from "./SineLabView";
import { SineRunsView } from "./SineRunsView";
import { SineSeedBankView } from "./SineSeedBankView";

export type SineView = "lab" | "runs" | "seedBank" | "help";

export function SineApp() {
  const [view, setView] = useState<SineView>("lab");
  if (view === "help") return <SineHelpPage activeView={view} onViewChange={setView} />;
  if (view === "seedBank") return <SineSeedBankView activeView={view} onViewChange={setView} />;
  if (view === "runs") return <SineRunsView activeView={view} onViewChange={setView} />;
  return <SineLabView activeView={view} onViewChange={setView} />;
}
