import { useEffect, useMemo, useState } from "react";
import { ControlPanel } from "./components/ControlPanel";
import { LessonSidebar } from "./components/LessonSidebar";
import { NetworkDiagram } from "./components/NetworkDiagram";
import { TickNarration } from "./components/TickNarration";
import { TimelineTable } from "./components/TimelineTable";
import { LESSONS } from "./model/lessons";
import { scenarioById } from "./model/scenarios";
import { applyTick, createInitialState, DEFAULT_CONTROLS, stepModel } from "./model/simulation";
import type { Controls, Lesson, ModelKind, ScenarioId } from "./model/types";

export function App() {
  const [lesson, setLesson] = useState<Lesson>(LESSONS[0]);
  const [scenarioId, setScenarioId] = useState<ScenarioId>(LESSONS[0].scenario);
  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS);
  const [simulation, setSimulation] = useState(() => createInitialState(DEFAULT_CONTROLS));
  const [playing, setPlaying] = useState(false);
  const [explanation, setExplanation] = useState("Click any arrow or node to see what it means.");
  const result = simulation.history.at(-1) ?? null;
  const scenario = useMemo(() => scenarioById(scenarioId), [scenarioId]);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setSimulation((previous) => applyTick(previous, stepModel(lesson.model, scenarioId, previous, controls)));
    }, 1150);
    return () => window.clearInterval(timer);
  }, [controls, lesson.model, playing, scenarioId]);

  const reset = (nextControls = controls) => {
    setSimulation(createInitialState(nextControls));
    setPlaying(false);
  };

  const step = () => {
    setSimulation((previous) => applyTick(previous, stepModel(lesson.model, scenarioId, previous, controls)));
  };

  const chooseLesson = (nextLesson: Lesson) => {
    setLesson(nextLesson);
    setScenarioId(nextLesson.scenario);
    setExplanation("Click any arrow or node to see what it means.");
    setSimulation(createInitialState(controls));
    setPlaying(false);
  };

  const chooseModel = (model: ModelKind) => {
    const nextLesson = LESSONS.find((candidate) => candidate.model === model && candidate.id !== "time") ?? LESSONS.find((candidate) => candidate.model === model);
    if (nextLesson) chooseLesson(nextLesson);
  };

  const chooseScenario = (nextScenarioId: ScenarioId) => {
    setScenarioId(nextScenarioId);
    reset();
  };

  const updateControl = (key: keyof Controls, value: number) => {
    const next = { ...controls, [key]: value };
    setControls(next);
    if (key === "startingMemory") setSimulation(createInitialState(next));
  };

  const applyPreset = (name: "remember" | "forget" | "ignore") => {
    const next: Controls =
      name === "remember"
        ? { ...controls, memoryWeight: 1.2, updateGate: 0.18, forgetGate: 0.92, writeGate: 0.32, outputGate: 0.9 }
        : name === "forget"
          ? { ...controls, memoryWeight: 0.35, updateGate: 0.82, forgetGate: 0.18, writeGate: 0.7, outputGate: 0.9 }
          : { ...controls, memoryWeight: 0, resetGate: 0, updateGate: 1, forgetGate: 0, writeGate: 1, outputGate: 1 };
    setControls(next);
    reset(next);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <span className="eyebrow">Interactive Teaching Simulation</span>
          <h1>RNN Memory Lab</h1>
          <p>
            Step through NN, RNN, GRU, LSTM, and Sine-style sparse GRU models. Watch signals move, gates open, memory persist,
            and outputs change over time.
          </p>
        </div>
        <div className="tick-card">
          <span>Current Tick</span>
          <strong>{simulation.tick}</strong>
        </div>
      </header>

      <main className="layout">
        <LessonSidebar
          lessons={LESSONS}
          activeLessonId={lesson.id}
          model={lesson.model}
          scenarioId={scenarioId}
          onLesson={chooseLesson}
          onModel={chooseModel}
          onScenario={chooseScenario}
        />

        <section className="workspace">
          <section className="panel lesson-hero">
            <div>
              <span className="eyebrow">{lesson.model.toUpperCase()}</span>
              <h2>{lesson.title}</h2>
              <p>{lesson.summary}</p>
            </div>
            <div className="teaching-grid">
              <div className="teaching-card">
                <strong>Plain English</strong>
                <p>{lesson.plain}</p>
              </div>
              <div className="teaching-card">
                <strong>Watch for</strong>
                <ul>
                  {lesson.watch.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="sim-grid">
            <ControlPanel
              controls={controls}
              visibleControls={lesson.controls}
              playing={playing}
              tryText={scenario.goal}
              onControl={updateControl}
              onPreset={applyPreset}
              onStep={step}
              onPlay={() => setPlaying((value) => !value)}
              onReset={() => reset()}
            />

            <section className="panel stage">
              <div className="readouts">
                <Metric label="Input now" value={result?.input ?? scenario.inputAt(simulation.tick + 1)} />
                <Metric label="Previous memory" value={result?.previousMemory ?? simulation.memory} />
                <Metric label="Cell / memory" value={lesson.model === "lstm" ? simulation.cell : simulation.memory} />
                <Metric label="Output now" value={result?.output ?? 0} />
              </div>
              <NetworkDiagram model={lesson.model} result={result} tick={simulation.tick} onExplain={setExplanation} />
              <div className="explain-box">
                <strong>Clicked Explanation</strong>
                <p>{explanation}</p>
              </div>
              <div className="formula-box">
                <strong>Small Formula</strong>
                <code>{result?.formula ?? "Press Step to run this model for one tick."}</code>
              </div>
            </section>
          </section>

          <TickNarration result={result} scenario={scenario} />
          <TimelineTable rows={simulation.history} />
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value.toFixed(2)}</strong>
    </div>
  );
}
