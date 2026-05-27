import type { Lesson, ModelKind, ScenarioId } from "../model/types";
import { SCENARIOS } from "../model/scenarios";

export function LessonSidebar({
  lessons,
  activeLessonId,
  model,
  scenarioId,
  onLesson,
  onModel,
  onScenario,
}: {
  lessons: Lesson[];
  activeLessonId: string;
  model: ModelKind;
  scenarioId: ScenarioId;
  onLesson: (lesson: Lesson) => void;
  onModel: (model: ModelKind) => void;
  onScenario: (scenarioId: ScenarioId) => void;
}) {
  return (
    <aside className="panel sidebar">
      <div className="sidebar-section">
        <div className="section-title">Lesson Path</div>
        <div className="lesson-list">
          {lessons.map((lesson, index) => (
            <button
              key={lesson.id}
              type="button"
              className={`lesson-button${lesson.id === activeLessonId ? " active" : ""}`}
              onClick={() => onLesson(lesson)}
            >
              <span className="lesson-number">{index + 1}</span>
              <span>{lesson.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <div className="section-title">Model</div>
        <div className="model-tabs" aria-label="Model selector">
          {MODEL_TABS.map((tab) => (
            <button key={tab.model} type="button" className={model === tab.model ? "active" : ""} onClick={() => onModel(tab.model)}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <label className="select-label" htmlFor="scenario-select">
          Scenario
        </label>
        <select id="scenario-select" value={scenarioId} onChange={(event) => onScenario(event.target.value as ScenarioId)}>
          {SCENARIOS.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.name}
            </option>
          ))}
        </select>
      </div>

      <div className="side-note">
        <strong>Beginner rule</strong>
        <p>On every Step, blue input flows in, memory may flow back, gates may open or close, and purple output comes out.</p>
      </div>
    </aside>
  );
}

const MODEL_TABS: Array<{ model: ModelKind; label: string }> = [
  { model: "nn", label: "NN" },
  { model: "rnn", label: "RNN" },
  { model: "gru", label: "GRU" },
  { model: "lstm", label: "LSTM" },
  { model: "sine-gru", label: "Sine" },
];
