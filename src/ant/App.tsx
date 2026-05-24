import { BrainCircuit, Database, Pause, Play, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { AgentInspector } from "./client/AgentInspector";
import { AppModeTabs, type AppMode } from "./client/AppModeTabs";
import { AgentsPanel } from "./client/AgentsPanel";
import { BatchRunnerView } from "./client/BatchRunnerView";
import { HelpPage } from "./client/HelpPage";
import { LineagePanel } from "./client/LineagePanel";
import { ParameterPanel } from "./client/ParameterPanel";
import { PopulationGraph } from "./client/PopulationGraph";
import { loadSavedParameters, saveParameters } from "./client/parameterStorage";
import { useLiveWorld } from "./client/useLiveWorld";
import { cloneParameters } from "./sim/parameters";
import type { SimulationParameters } from "./sim/types";
import "./styles.css";

export default function App() {
  const [parameters, setParameters] = useState(loadSavedParameters);
  const [appMode, setAppMode] = useState<AppMode>(() => {
    const mode = new URLSearchParams(window.location.search).get("mode");
    return mode === "batch" || mode === "help" ? mode : "live";
  });
  const [sidebarTab, setSidebarTab] = useState<"overview" | "parameters" | "agents">(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return tab === "parameters" || tab === "agents" ? tab : "overview";
  });
  const live = useLiveWorld(parameters, appMode);

  const saveParameterGroup = <K extends keyof SimulationParameters>(key: K, value: SimulationParameters[K]) => {
    const next = cloneParameters(parameters);
    next[key] = structuredClone(value) as SimulationParameters[K];
    setParameters(saveParameters(next));
  };

  if (appMode === "batch") {
    return <BatchRunnerView parameters={parameters} activeMode={appMode} onModeChange={setAppMode} />;
  }

  if (appMode === "help") {
    return <HelpPage activeMode={appMode} onModeChange={setAppMode} />;
  }

  return (
    <main className="app-shell">
      <section className="world-stage">
        <canvas ref={live.canvasRef} className="world-canvas" onPointerDown={live.handleCanvasClick} />
        <div className="top-bar">
          <div className="brand-cluster">
            <div>
              <span className="eyebrow">Emergent Ant World</span>
              <h1>Live Evolution</h1>
            </div>
            <AppModeTabs activeMode={appMode} onChange={setAppMode} />
          </div>
          <div className="controls">
            <button type="button" onClick={() => live.setRunning((value) => !value)} title={live.running ? "Pause" : "Play"}>
              {live.running ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <label className="speed-control">
              <span>{live.speed.toFixed(1)}x</span>
              <input
                type="range"
                max={parameters.runtime.speedMax}
                step={parameters.runtime.speedStep}
                min={parameters.runtime.speedMin}
                value={live.speed}
                onChange={(event) => live.setSpeed(Number(event.target.value))}
              />
            </label>
            <button type="button" onClick={live.resetWorld} title="Reset with new seed">
              <RotateCcw size={18} />
            </button>
          </div>
        </div>
        <div className="status-strip">
          <Stat label="Tick" value={live.stats.tick.toLocaleString()} />
          <Stat label="Time" value={`${live.stats.seconds.toFixed(0)}s`} />
          <Stat label="Population" value={String(live.stats.population)} />
          <Stat label="Food" value={String(live.stats.food)} />
          <Stat label="Max Gen" value={String(live.stats.maxGeneration)} />
        </div>
      </section>
      <aside className="side-rail">
        <div className="sidebar-tabs">
          <button
            type="button"
            className={sidebarTab === "overview" ? "sidebar-tab active" : "sidebar-tab"}
            onClick={() => setSidebarTab("overview")}
          >
            <Database size={16} />
            Overview
          </button>
          <button
            type="button"
            className={sidebarTab === "parameters" ? "sidebar-tab active" : "sidebar-tab"}
            onClick={() => setSidebarTab("parameters")}
          >
            <SlidersHorizontal size={16} />
            Parameters
          </button>
          <button
            type="button"
            className={sidebarTab === "agents" ? "sidebar-tab active" : "sidebar-tab"}
            onClick={() => setSidebarTab("agents")}
          >
            <BrainCircuit size={16} />
            Agents
          </button>
        </div>
        {sidebarTab === "overview" ? (
          <>
            <section className="panel persistence-panel">
              <div className="panel-title">Persistence</div>
              <div className="save-state">
                <Database size={18} />
                <span>{live.persistStatus}</span>
              </div>
              <div className="event-counts">
                <span>{live.stats.births} births</span>
                <span>{live.stats.deaths} deaths</span>
              </div>
            </section>
            <PopulationGraph history={live.populationHistory} lineages={live.lineages} />
            <AgentInspector agent={live.selectedAgent} lineage={live.selectedLineage} />
            <LineagePanel lineages={live.lineages} />
          </>
        ) : sidebarTab === "parameters" ? (
          <ParameterPanel parameters={parameters} onSaveGroup={saveParameterGroup} />
        ) : (
          <AgentsPanel agents={parameters.agents} onSave={(agents) => saveParameterGroup("agents", agents)} />
        )}
      </aside>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
