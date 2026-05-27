import type { TickResult } from "../model/types";

export function TimelineTable({ rows }: { rows: TickResult[] }) {
  return (
    <section className="panel timeline-panel">
      <div className="timeline-head">
        <div>
          <span className="eyebrow">Timeline</span>
          <h3>Tick Record</h3>
        </div>
        <span>{rows.length} rows</span>
      </div>
      <div className="timeline-scroll">
        <table>
          <thead>
            <tr>
              <th>Tick</th>
              <th>Input</th>
              <th>Prev Mem</th>
              <th>Candidate</th>
              <th>Gate A</th>
              <th>Gate B</th>
              <th>Cell</th>
              <th>Output</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9}>Press Step to create the first row.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.model}-${row.tick}`}>
                  <td>{row.tick}</td>
                  <td>{row.input.toFixed(2)}</td>
                  <td>{row.previousMemory.toFixed(2)}</td>
                  <td>{row.candidate.toFixed(2)}</td>
                  <td>{formatGate(row.resetGate ?? row.forgetGate)}</td>
                  <td>{formatGate(row.updateGate ?? row.writeGate)}</td>
                  <td>{row.cell.toFixed(2)}</td>
                  <td>{row.output.toFixed(2)}</td>
                  <td>{row.target === null ? "--" : row.target.toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatGate(value: number | null) {
  return value === null ? "--" : value.toFixed(2);
}
