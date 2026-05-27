import type { Scenario, TickResult } from "../model/types";

export function TickNarration({ result, scenario }: { result: TickResult | null; scenario: Scenario }) {
  return (
    <section className="panel narration">
      <div>
        <span className="eyebrow">Scenario Goal</span>
        <h3>{scenario.name}</h3>
        <p>{scenario.goal}</p>
      </div>
      <div>
        <span className="eyebrow">What Happened This Tick</span>
        <p>{result ? result.narration : "Press Step to move one tick and watch the signal travel through the model."}</p>
      </div>
      <ul>
        {scenario.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
