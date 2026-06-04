const agents = [
  { id: 1, name: "L1 / gen 0", note: "selected scout", tag: "wait", score: "+0.00%" },
  { id: 8, name: "L8 / gen 2", note: "top hit rate", tag: "good", score: "68%" },
  { id: 14, name: "L14 / gen 3", note: "most unique", tag: "unique", score: "92%" },
  { id: 6, name: "L6 / gen 1", note: "near death", tag: "risk", score: "18.4e" },
];

const runs = [
  { id: "6f05080a", detail: "20 spawners · 411 ticks · stopped", selected: true },
  { id: "4b7a2291", detail: "84 spawners · 1,204 ticks · paused" },
  { id: "83ca901e", detail: "45 spawners · 860 ticks · stopped" },
];

const tradeRows = [
  { id: 421, agent: "#8", dir: "long", entry: 229, horizon: 64, entrySignal: "+0.72", exitSignal: "+1.18", payoff: "+0.071", status: "win" },
  { id: 422, agent: "#14", dir: "short", entry: 232, horizon: 38, entrySignal: "+1.06", exitSignal: "+0.81", payoff: "+0.044", status: "open" },
  { id: 423, agent: "#6", dir: "long", entry: 235, horizon: 52, entrySignal: "+1.21", exitSignal: "+0.92", payoff: "-0.058", status: "loss" },
  { id: 424, agent: "#1", dir: "short", entry: 239, horizon: 24, entrySignal: "+0.98", exitSignal: "+0.74", payoff: "+0.039", status: "open" },
  { id: 425, agent: "#11", dir: "long", entry: 241, horizon: 80, entrySignal: "+0.56", exitSignal: "+1.34", payoff: "+0.102", status: "win" },
];

const lineageRows = [
  { id: "L14", founder: "#14", living: 7, born: 19, died: 12, hit: "62%", payoff: "+0.063", unique: "92%", note: "deeper-layer branch" },
  { id: "L8", founder: "#8", living: 5, born: 16, died: 11, hit: "68%", payoff: "+0.091", unique: "71%", note: "high hit-rate branch" },
  { id: "L6", founder: "#6", living: 2, born: 9, died: 7, hit: "43%", payoff: "-0.014", unique: "54%", note: "energy-stressed branch" },
  { id: "L1", founder: "#1", living: 6, born: 13, died: 7, hit: "51%", payoff: "+0.008", unique: "58%", note: "baseline branch" },
];

const mutationDiffRows = [
  { trait: "Spawn threshold", parent: "0.45", child: "0.39", delta: "-0.06", tone: "good" },
  { trait: "Min signal strength", parent: "0.31", child: "0.24", delta: "-0.07", tone: "warn" },
  { trait: "Payoff scale window", parent: "96", child: "128", delta: "+32", tone: "" },
  { trait: "New unit initial links", parent: "2", child: "3", delta: "+1", tone: "" },
  { trait: "Add connection rate", parent: "0.018", child: "0.021", delta: "+0.003", tone: "" },
  { trait: "Output bias · long", parent: "+0.12", child: "+0.18", delta: "+0.06", tone: "good" },
];

function appStatusBar() {
  return `
    <section class="app-status-bar" aria-label="Run controls and status">
      <div class="transport">
        <button type="button" class="primary">Play</button>
        <button type="button">Pause</button>
        <button type="button">Stop</button>
        <button type="button">New Run</button>
      </div>
      <div class="status-grid">
        ${statusCard("Run", "running")}
        ${statusCard("Tick", "248")}
        ${statusCard("Playback", "5.56 t/s")}
        ${statusCard("Brain eval", "parallel")}
        ${statusCard("Backlog", "0 ticks")}
      </div>
      <div class="panel-actions">
        <button type="button" class="drawer-button" data-open-modal="runtimeDiagnostics">Runtime</button>
        <button type="button" class="drawer-button">Settings</button>
      </div>
    </section>
  `;
}

function statusCard(label, value) {
  return `<article class="status-card"><span>${label}</span><strong>${value}</strong></article>`;
}

function chartShell({ title, value, id, main = false }) {
  return `
    <section class="chart-shell">
      <div class="chart-head">
        <div>
          <span class="label">${main ? "World view" : "Telemetry"}</span>
          <h2>${title}</h2>
        </div>
        <div class="panel-actions">
          ${main ? `<button type="button" class="mini-action" data-open-modal="trades">Trades</button>` : ""}
          <strong>${value}</strong>
        </div>
      </div>
      <div id="${id}" class="${main ? "main-chart" : "small-chart"}"></div>
    </section>
  `;
}

function populationPanel() {
  return `
    <section class="panel emphasis">
      <div class="panel-head">
        <div><span class="panel-label">Population Health</span><h3>Scarcity and survival</h3></div>
        <button type="button" class="mini-action" data-open-modal="populationComposition">Composition</button>
      </div>
      ${meter("Living population", "20 / 100", 20)}
      ${meter("Avg energy", "20.8", 62)}
      ${meter("Extinction risk", "low", 14)}
      <div class="mini-grid">
        ${statusCard("Births", "3")}
        ${statusCard("Deaths", "0")}
        ${statusCard("Pending food", "9")}
      </div>
    </section>
  `;
}

function runHealthPanel() {
  return `
    <section class="panel">
      <div class="panel-head">
        <div><span class="panel-label">Run Health</span><h3>Runtime pulse</h3></div>
        <button type="button" class="mini-action" data-open-modal="runtimeDiagnostics">Diagnostics</button>
      </div>
      <div class="health-grid">
        ${statusCard("Persistence", "synced")}
        ${statusCard("Packet", "45.6 KB")}
        ${statusCard("Roster", "18.8 KB")}
        ${statusCard("Worker", "ready")}
      </div>
    </section>
  `;
}

function runPerformancePanel({ compact = false } = {}) {
  return `
    <section class="panel performance">
      <div class="panel-head">
        <div><span class="panel-label">Run Performance</span><h3>Last 10,000 ticks</h3></div>
        <strong>${compact ? "57.8% hit" : "+0.036 avg payoff"}</strong>
      </div>
      <div class="performance-grid">
        ${performanceCard("Hit rate", "57.8%", "good")}
        ${performanceCard("Avg payoff", "+0.036", "good")}
        ${performanceCard("Trade count", "1,284")}
        ${performanceCard("Long / Short", "54% / 46%")}
        ${performanceCard("Payoff vol", "0.41", "warn")}
        ${performanceCard("Birth / Death", "0.018 / 0.011")}
      </div>
    </section>
  `;
}

function performanceCard(label, value, tone = "") {
  return `<article class="performance-card ${tone}"><span>${label}</span><strong>${value}</strong></article>`;
}

function evolutionPanel() {
  return `
    <section class="panel">
      <div class="panel-head">
        <div><span class="panel-label">Evolution</span><h3>Diversity and lineages</h3></div>
        <button type="button" class="mini-action" data-open-modal="lineage">Lineages</button>
      </div>
      <div id="evolution-chart" class="small-chart"></div>
      <div class="lineage-list">
        ${lineageRow("L14", "highest uniqueness", "unique")}
        ${lineageRow("L8", "best hit rate", "good")}
        ${lineageRow("L6", "energy stress", "risk")}
      </div>
    </section>
  `;
}

function agentPanel({ compact = false } = {}) {
  return `
    <section class="panel agent-intelligence">
      <div class="panel-head">
        <div><span class="panel-label">Agent Intelligence</span><h3>${compact ? "Watchlist" : "Selected, best, risky, unique"}</h3></div>
        <button type="button" class="mini-action" data-open-modal="architecture">Inspect #1</button>
      </div>
      <div class="agent-list">
        ${agents.map(agentRow).join("")}
      </div>
    </section>
  `;
}

function selectedAgentPanel() {
  return `
    <section class="panel inspector-panel">
      <div class="panel-head">
        <div><span class="panel-label">Selected Agent</span><h3>Spawner #1</h3></div>
        <div class="panel-actions">
          <button type="button" class="mini-action" data-open-modal="architecture">RNN</button>
          <button type="button" class="mini-action" data-open-modal="uniqueness">Unique</button>
          <button type="button" class="mini-action" data-open-modal="agentTimeline">Timeline</button>
          <button type="button" class="mini-action" data-open-modal="mutationDiff">Mutation</button>
        </div>
      </div>
      <div class="selected-agent-card">
        <div class="trait-grid">
          <span><b>19.7</b> energy</span>
          <span><b>100</b> health</span>
          <span><b>0</b> pending</span>
          <span><b>58%</b> unique pct</span>
        </div>
        <div class="neural-map" id="neural-map"></div>
      </div>
    </section>
  `;
}

function settingsDrawerPreview() {
  return `
    <section class="drawer-preview collapsed">
      <div>
        <span class="panel-label">Settings</span>
        <h3>Market, genome, mutation, runtime</h3>
      </div>
      <button type="button" class="drawer-button">Open tuning</button>
    </section>
  `;
}

function experimentReviewPanel() {
  return `
    <section class="panel review-panel">
      <div class="panel-head">
        <div><span class="panel-label">Experiment Review</span><h3>SQLite saved runs</h3></div>
        <button type="button" class="mini-action" data-open-modal="history">Open browser</button>
      </div>
      <div class="run-list">${runs.map(runRow).join("")}</div>
      <div id="review-chart" class="small-chart"></div>
    </section>
  `;
}

function meter(label, value, amount) {
  return `<div class="health-meter"><span><b>${label}</b><b>${value}</b></span><i class="bar" style="--value:${amount}%"></i></div>`;
}

function agentRow(agent) {
  return `
    <article class="agent-row ${agent.id === 1 ? "selected" : ""}">
      <b class="badge">${agent.id}</b>
      <div><strong>${agent.name}</strong><br /><span class="label">${agent.note} · ${agent.score}</span></div>
      <button type="button" class="tag ${agent.tag}" data-open-modal="${agent.tag === "unique" ? "uniqueness" : "architecture"}">${agent.tag}</button>
    </article>
  `;
}

function lineageRow(name, detail, tag) {
  return `<article class="lineage-row"><b class="badge">${name.replace("L", "")}</b><div><strong>${name}</strong><br /><span class="label">${detail}</span></div><button type="button" class="tag ${tag}" data-open-modal="lineage">${tag}</button></article>`;
}

function runRow(run) {
  return `<article class="run-row ${run.selected ? "selected" : ""}"><b class="badge">${run.id.slice(0, 2)}</b><div><strong>run ${run.id}</strong><br /><span class="label">${run.detail}</span></div><button type="button" class="tag" data-open-modal="history">load</button></article>`;
}

function workbenchLayout() {
  return `
    <div class="workbench-layout">
      <aside class="workbench-left">
        ${appStatusBar()}
        ${agentPanel()}
        ${settingsDrawerPreview()}
      </aside>
      <section class="workbench-center">
        ${chartShell({ title: "Market Signal + Active Trades", value: "selection-aware", id: "main-signal", main: true })}
        ${selectedAgentPanel()}
      </section>
      <aside class="workbench-right">
        ${populationPanel()}
        ${runPerformancePanel()}
        ${evolutionPanel()}
        ${experimentReviewPanel()}
      </aside>
    </div>
  `;
}

const signalSeries = Array.from({ length: 80 }, (_, index) => {
  const x = index / 79;
  return 1.08 * Math.sin(x * Math.PI * 2.4) + 0.35 * Math.sin(x * Math.PI * 7.5 + 0.9) - 0.16 * Math.cos(x * Math.PI * 12);
});

const simpleSeries = [20, 22, 27, 35, 44, 52, 48, 61, 69];
const diversitySeries = [4.4, 4.6, 4.1, 5.1, 4.9, 5.6, 5.2, 5.9];

function renderCharts() {
  drawSignal("main-signal");
  drawLine("population-chart", simpleSeries, { min: 0, max: 75, colorClass: "svg-line" });
  drawLine("uniqueness-chart", diversitySeries, { min: 0, max: 6.5, colorClass: "svg-line-violet" });
  drawLine("evolution-chart", diversitySeries, { min: 0, max: 6.5, colorClass: "svg-line-violet" });
  drawLine("review-chart", simpleSeries, { min: 0, max: 75, colorClass: "svg-line-gold" });
  drawNeuralMap("neural-map");
}

function drawFrame(width, height, children, labels = ["High", "Mid", "Low"]) {
  const xs = Array.from({ length: 9 }, (_, index) => 54 + index * ((width - 92) / 8));
  const ys = [38, height / 2, height - 36];
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Mock chart">
      <rect width="${width}" height="${height}" fill="var(--chart)" />
      ${xs.map((x) => `<line class="svg-grid-minor" x1="${x}" y1="26" x2="${x}" y2="${height - 30}" />`).join("")}
      ${ys.map((y, index) => `<line class="svg-grid-major" x1="52" y1="${y}" x2="${width - 30}" y2="${y}" /><text class="svg-axis" x="16" y="${y + 4}">${labels[index]}</text>`).join("")}
      ${children}
    </svg>
  `;
}

function seriesPath(values, { width, height, min, max, left = 64, right = 34, top = 32, bottom = 34 }) {
  return values
    .map((value, index) => {
      const x = left + index * ((width - left - right) / (values.length - 1));
      const y = height - bottom - ((value - min) / (max - min)) * (height - top - bottom);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function pointFor(values, index, { width, height, min, max, left = 64, right = 34, top = 32, bottom = 34 }) {
  const x = left + index * ((width - left - right) / (values.length - 1));
  const y = height - bottom - ((values[index] - min) / (max - min)) * (height - top - bottom);
  return { x, y };
}

function drawSignal(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const width = 1040;
  const height = 520;
  const path = seriesPath(signalSeries, { width, height, min: -2.5, max: 2.5, left: 70, right: 48, top: 42, bottom: 54 });
  const current = pointFor(signalSeries, 45, { width, height, min: -2.5, max: 2.5, left: 70, right: 48, top: 42, bottom: 54 });
  const trades = [18, 21, 25, 29, 34, 38]
    .map((index, offset) => {
      const p = pointFor(signalSeries, index, { width, height, min: -2.5, max: 2.5, left: 70, right: 48, top: 42, bottom: 54 });
      const endX = p.x + 120 + offset * 18;
      const endY = p.y - 8 + offset * 7;
      const result = offset % 3 === 0 ? "loss" : "win";
      return `
        <line class="trade-horizon" x1="${p.x}" y1="${p.y}" x2="${endX}" y2="${endY}" />
        <circle class="trade-dot" cx="${p.x}" cy="${p.y}" r="7" />
        <circle class="${result}" cx="${endX}" cy="${endY}" r="4.5" />
      `;
    })
    .join("");
  target.innerHTML = drawFrame(
    width,
    height,
    `
      <path class="svg-line-glow" d="${path}" stroke-width="12" />
      <path class="svg-line" d="${path}" stroke-width="3.5" />
      <line class="current-tick" x1="${current.x}" y1="40" x2="${current.x}" y2="${height - 54}" />
      <text class="svg-axis" x="${current.x + 8}" y="58">current tick</text>
      ${trades}
    `,
    ["+2.5%", "0.0%", "-2.5%"],
  );
}

function drawLine(id, values, { min, max, colorClass }) {
  const target = document.getElementById(id);
  if (!target) return;
  const width = 560;
  const height = 190;
  const path = seriesPath(values, { width, height, min, max, left: 50, right: 28, top: 30, bottom: 32 });
  target.innerHTML = drawFrame(
    width,
    height,
    `<path class="svg-line-glow" d="${path}" stroke-width="8" /><path class="${colorClass}" d="${path}" stroke-width="2.7" />`,
    [String(max), String(((min + max) / 2).toFixed(1)), String(min)],
  );
}

function drawNeuralMap(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const links = [
    [80, 70, 260, 110, "var(--cyan)", 3],
    [80, 160, 260, 150, "var(--cyan)", 2],
    [80, 250, 260, 190, "var(--red)", 2.6],
    [294, 118, 492, 92, "var(--gold)", 3],
    [294, 156, 492, 178, "var(--cyan)", 2],
    [294, 196, 492, 252, "var(--red)", 2.8],
  ];
  const nodes = [
    [50, 48, "I1", "input"],
    [50, 138, "I6", "input"],
    [50, 228, "I13", "input"],
    [236, 90, "U1", ""],
    [236, 168, "U2", ""],
    [468, 70, "O1", "output"],
    [468, 156, "O2", "output"],
    [468, 232, "O6", "output"],
  ];
  target.innerHTML = `
    <svg viewBox="0 0 620 340" role="img" aria-label="Mock selected agent RNN map">
      <rect width="620" height="340" fill="var(--chart)" />
      ${links.map(([x1, y1, x2, y2, color, width]) => `<path class="link" d="M ${x1} ${y1} C ${x1 + 92} ${y1}, ${x2 - 92} ${y2}, ${x2} ${y2}" stroke="${color}" stroke-width="${width}" />`).join("")}
      ${nodes.map(([x, y, label, type]) => `<rect class="node ${type}" x="${x}" y="${y}" width="66" height="44" rx="10" /><text class="node-label" x="${x + 33}" y="${y + 27}">${label}</text>`).join("")}
    </svg>
  `;
}

function renderWorkbench() {
  const root = document.querySelector("#layout-root");
  root.className = "layout-root workbench-root";
  root.innerHTML = workbenchLayout();
  renderCharts();
}

const modalContent = {
  architecture: architectureModal,
  uniqueness: uniquenessModal,
  history: historyModal,
  trades: tradeLedgerModal,
  lineage: lineageExplorerModal,
  agentTimeline: agentTimelineModal,
  mutationDiff: mutationDiffModal,
  populationComposition: populationCompositionModal,
  runtimeDiagnostics: runtimeDiagnosticsModal,
};

function openModal(kind) {
  const render = modalContent[kind];
  if (!render) return;
  const modalRoot = document.querySelector("#modal-root");
  modalRoot.innerHTML = render();
  modalRoot.classList.add("active");
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => {
    modalRoot.querySelector("[data-modal-close]")?.focus();
    drawModalRnn("modal-rnn-map");
    drawGatePanel("gate-panel");
    drawHistorySparkline("history-telemetry");
    drawHistorySparkline("history-payoff", true);
    drawHistorySparkline("agent-energy-chart");
    drawHistorySparkline("agent-payoff-chart", true);
    drawCompositionChart("composition-chart");
    drawRuntimeBars("runtime-bars");
  });
}

function closeModal() {
  const modalRoot = document.querySelector("#modal-root");
  modalRoot.classList.remove("active");
  modalRoot.innerHTML = "";
  document.body.classList.remove("modal-open");
}

function architectureModal() {
  return `
    <div class="lab-modal-backdrop" data-modal-backdrop>
      <section class="lab-modal architecture-inspector-modal" role="dialog" aria-modal="true" aria-label="Spawner RNN architecture inspector">
        <header class="lab-modal-header">
          <button type="button" class="modal-close" data-modal-close aria-label="Close modal">x</button>
          <div>
            <span class="eyebrow">RNN Architecture Inspector</span>
            <h2>Spawner #1 · L1 / gen 0</h2>
          </div>
          <div class="modal-stat-strip">
            ${statusCard("Action", "WAIT")}
            ${statusCard("Energy", "19.7")}
            ${statusCard("Unique pct", "58%")}
            ${statusCard("Learned norm", "0.143")}
            ${statusCard("Horizon", "18-72")}
          </div>
        </header>
        <div class="modal-toolbar">
          <label><input type="checkbox" checked /> Active connections</label>
          <label><input type="checkbox" /> Disabled genes</label>
          <label>Min abs weight <input type="number" value="0.05" /></label>
          <button type="button" data-open-modal="uniqueness">Open uniqueness</button>
        </div>
        <div class="architecture-modal-grid">
          <section class="modal-chart-card primary">
            <div class="modal-section-head">
              <div><span class="panel-label">Brain Map</span><h3>Inputs, gated hidden units, outputs</h3></div>
              <strong>gate-aware links</strong>
            </div>
            <div id="modal-rnn-map" class="modal-rnn-map"></div>
          </section>
          <aside class="modal-side-card">
            <div class="modal-section-head">
              <div><span class="panel-label">Decision Context</span><h3>Why this agent matters</h3></div>
            </div>
            ${detailRow("Spawn threshold", "0.41 effective")}
            ${detailRow("Min signal strength", "0.24 effective")}
            ${detailRow("Payoff scale window", "128 ticks")}
            ${detailRow("Population room input", "0.80")}
            ${detailRow("Last payoff", "+0.084")}
            <div class="modal-divider"></div>
            <div class="modal-section-head tight">
              <div><span class="panel-label">Selected Unit</span><h3>U7 gate state</h3></div>
            </div>
            <div id="gate-panel" class="gate-panel"></div>
          </aside>
          <section class="modal-bottom-card">
            <div class="modal-section-head">
              <div><span class="panel-label">Selected Connection</span><h3>Innovation #204 · U7 update gate → long output</h3></div>
              <strong>weight +0.62</strong>
            </div>
            <div class="connection-detail-grid">
              ${detailRow("Target gate", "update")}
              ${detailRow("Base weight", "+0.51")}
              ${detailRow("Learned delta", "+0.11")}
              ${detailRow("Enabled", "yes")}
              ${detailRow("Plasticity", "reward-modulated")}
            </div>
          </section>
        </div>
      </section>
    </div>
  `;
}

function uniquenessModal() {
  return `
    <div class="lab-modal-backdrop" data-modal-backdrop>
      <section class="lab-modal uniqueness-detail-modal" role="dialog" aria-modal="true" aria-label="Spawner uniqueness detail">
        <header class="lab-modal-header compact">
          <button type="button" class="modal-close" data-modal-close aria-label="Close modal">x</button>
          <div>
            <span class="eyebrow">Spawner #14</span>
            <h2>Uniqueness Detail</h2>
          </div>
          <strong class="modal-score">92%</strong>
        </header>
        <p class="modal-explainer">Percentile compares this spawner with the current living population. Feature rows show the largest deviations from the population median.</p>
        <div class="uniqueness-score-wall">
          ${performanceCard("Percentile", "92%", "good")}
          ${performanceCard("Raw distance", "5.842")}
          ${performanceCard("Population", "20")}
          ${performanceCard("Features", "61 / 68")}
        </div>
        <section class="modal-side-card full">
          <div class="modal-section-head">
            <div><span class="panel-label">Comparison</span><h3>tick 248 · population vector v3</h3></div>
          </div>
          ${detailRow("Nearest neighbors", "#8, #11, #2")}
          ${detailRow("Most different", "Payoff window, new layer chance, reset-gate bias")}
          ${detailRow("Most typical", "Cooldown, health, active outputs")}
        </section>
        <div class="feature-comparison-grid">
          ${featureRow("Payoff scale window", "192", "96", "+2.84")}
          ${featureRow("New layer chance", "0.28", "0.11", "+2.11")}
          ${featureRow("Reset gate bias", "-0.44", "-0.08", "-1.73")}
          ${featureRow("Spawn threshold", "0.39", "0.42", "-0.22")}
        </div>
      </section>
    </div>
  `;
}

function historyModal() {
  return `
    <div class="lab-modal-backdrop" data-modal-backdrop>
      <section class="lab-modal history-browser-modal" role="dialog" aria-modal="true" aria-label="SQLite run browser">
        <header class="lab-modal-header">
          <button type="button" class="modal-close" data-modal-close aria-label="Close modal">x</button>
          <div>
            <span class="eyebrow">Saved Runs</span>
            <h2>SQLite Run Browser</h2>
          </div>
          <div class="modal-actions">
            <button type="button">Refresh</button>
            <button type="button">Load</button>
            <button type="button">Delete selected</button>
          </div>
        </header>
        <div class="history-browser-grid">
          <aside class="history-run-list">
            <div class="modal-section-head">
              <div><span class="panel-label">Run List</span><h3>50 most recent</h3></div>
            </div>
            ${runs.map(runHistoryRow).join("")}
          </aside>
          <section class="history-analysis">
            <div class="history-summary-grid">
              ${statusCard("Status", "stopped")}
              ${statusCard("Ticks", "1,204")}
              ${statusCard("Final pop", "84")}
              ${statusCard("Hit rate · 10k", "57.8%")}
              ${statusCard("Avg payoff · 10k", "+0.036")}
              ${statusCard("Extinctions", "0")}
            </div>
            <div class="history-chart-grid">
              <section class="modal-chart-card">
                <div class="modal-section-head">
                  <div><span class="panel-label">Telemetry</span><h3>Population and loss</h3></div>
                </div>
                <div id="history-telemetry" class="history-modal-chart"></div>
              </section>
              <section class="modal-chart-card">
                <div class="modal-section-head">
                  <div><span class="panel-label">Performance</span><h3>Rolling payoff and hit rate</h3></div>
                </div>
                <div id="history-payoff" class="history-modal-chart"></div>
              </section>
            </div>
            <div class="history-tables-grid">
              <section class="modal-side-card">
                <div class="modal-section-head tight">
                  <div><span class="panel-label">Top Lineages</span><h3>Outcomes</h3></div>
                </div>
                ${detailRow("L8", "68% hit · +0.091 avg payoff")}
                ${detailRow("L14", "92% unique · +0.063 avg payoff")}
                ${detailRow("L6", "18.4 energy stress")}
              </section>
              <section class="modal-side-card">
                <div class="modal-section-head tight">
                  <div><span class="panel-label">Historical RNN Lookup</span><h3>Inspect a specific agent</h3></div>
                </div>
                <div class="lookup-row">
                  <input value="14" aria-label="Spawner ID" />
                  <input value="1000" aria-label="Tick" />
                  <button type="button" data-open-modal="architecture">Inspect RNN</button>
                </div>
              </section>
            </div>
          </section>
        </div>
      </section>
    </div>
  `;
}

function tradeLedgerModal() {
  return `
    <div class="lab-modal-backdrop" data-modal-backdrop>
      <section class="lab-modal data-window-modal" role="dialog" aria-modal="true" aria-label="Trade ledger">
        ${modalHeader("Trade Ledger", "Open positions and resolved food")}
        <div class="data-window-body">
          <section class="modal-side-card">
            <div class="modal-section-head">
              <div><span class="panel-label">Current Window</span><h3>Last 250 ticks</h3></div>
              <strong>9 pending</strong>
            </div>
            <div class="metric-wall">
              ${performanceCard("Win rate", "57.8%", "good")}
              ${performanceCard("Avg payoff", "+0.036", "good")}
              ${performanceCard("Open risk", "0.42", "warn")}
              ${performanceCard("Cost drag", "0.010")}
            </div>
            <div class="modal-divider"></div>
            ${detailRow("Best active creator", "#8 · +0.091 avg payoff")}
            ${detailRow("Worst active creator", "#6 · -0.014 avg payoff")}
            ${detailRow("Median horizon", "52 ticks")}
          </section>
          <section class="modal-chart-card">
            <div class="modal-section-head">
              <div><span class="panel-label">Ledger</span><h3>Recent entries</h3></div>
            </div>
            <div class="data-table trade-table">
              <div class="data-table-head">${["ID", "Agent", "Dir", "Entry", "Horizon", "Entry", "Exit", "Payoff", "Status"].map(tableHead).join("")}</div>
              ${tradeRows.map(tradeTableRow).join("")}
            </div>
          </section>
        </div>
      </section>
    </div>
  `;
}

function lineageExplorerModal() {
  return `
    <div class="lab-modal-backdrop" data-modal-backdrop>
      <section class="lab-modal data-window-modal" role="dialog" aria-modal="true" aria-label="Lineage explorer">
        ${modalHeader("Lineage Explorer", "Ancestry, survival, and branch fitness")}
        <div class="data-window-body lineage-window">
          <section class="modal-chart-card primary">
            <div class="modal-section-head">
              <div><span class="panel-label">Family Tree</span><h3>Founder #14 branch</h3></div>
              <button type="button" data-open-modal="mutationDiff">Open child diff</button>
            </div>
            <div class="lineage-tree">
              ${lineageNode("#14", "founder · gen 0", "selected")}
              <div class="tree-branch">
                ${lineageNode("#21", "gen 1 · +0.044")}
                ${lineageNode("#22", "gen 1 · died")}
                ${lineageNode("#27", "gen 2 · unique 92%", "good")}
              </div>
              <div class="tree-branch lower">
                ${lineageNode("#31", "gen 3 · open")}
                ${lineageNode("#34", "gen 3 · +0.071", "good")}
                ${lineageNode("#38", "gen 4 · pending")}
              </div>
            </div>
          </section>
          <aside class="modal-side-card">
            <div class="modal-section-head">
              <div><span class="panel-label">Lineage Table</span><h3>Living branches</h3></div>
            </div>
            <div class="compact-table">
              ${lineageRows.map(lineageTableRow).join("")}
            </div>
          </aside>
        </div>
      </section>
    </div>
  `;
}

function agentTimelineModal() {
  return `
    <div class="lab-modal-backdrop" data-modal-backdrop>
      <section class="lab-modal data-window-modal" role="dialog" aria-modal="true" aria-label="Agent performance timeline">
        ${modalHeader("Agent Performance Timeline", "Spawner #1 over time")}
        <div class="history-summary-grid modal-summary-pad">
          ${statusCard("Age", "248 ticks")}
          ${statusCard("Resolved trades", "31")}
          ${statusCard("Hit rate", "51%")}
          ${statusCard("Avg payoff", "+0.008")}
          ${statusCard("Learned norm", "0.143")}
          ${statusCard("Births", "3")}
        </div>
        <div class="history-chart-grid modal-chart-pad">
          <section class="modal-chart-card">
            <div class="modal-section-head"><div><span class="panel-label">Energy</span><h3>Survival pressure</h3></div></div>
            <div id="agent-energy-chart" class="history-modal-chart"></div>
          </section>
          <section class="modal-chart-card">
            <div class="modal-section-head"><div><span class="panel-label">Payoff</span><h3>Recent outcomes</h3></div></div>
            <div id="agent-payoff-chart" class="history-modal-chart"></div>
          </section>
        </div>
        <div class="event-timeline">
          ${timelineEvent("tick 188", "spawned long", "entry +0.72 · horizon 64 · pending")}
          ${timelineEvent("tick 204", "learning update", "positive payoff nudged long output bias")}
          ${timelineEvent("tick 226", "reproduced", "child #21 inherited effective genome")}
          ${timelineEvent("tick 241", "waited", "signal below min strength")}
        </div>
      </section>
    </div>
  `;
}

function mutationDiffModal() {
  return `
    <div class="lab-modal-backdrop" data-modal-backdrop>
      <section class="lab-modal data-window-modal" role="dialog" aria-modal="true" aria-label="Mutation diff viewer">
        ${modalHeader("Mutation Diff Viewer", "Parent #14 → Child #27")}
        <div class="data-window-body primary-first">
          <section class="modal-chart-card">
            <div class="modal-section-head">
              <div><span class="panel-label">Trait Diffs</span><h3>Inherited settings and mutated knobs</h3></div>
              <strong>6 changed traits</strong>
            </div>
            <div class="data-table diff-table">
              <div class="data-table-head">${["Trait", "Parent", "Child", "Delta"].map(tableHead).join("")}</div>
              ${mutationDiffRows.map(diffTableRow).join("")}
            </div>
          </section>
          <aside class="modal-side-card">
            <div class="modal-section-head">
              <div><span class="panel-label">Topology Changes</span><h3>Brain structure</h3></div>
            </div>
            ${detailRow("New hidden unit", "U12 in layer 2")}
            ${detailRow("New connection", "Room input → U12 reset gate")}
            ${detailRow("Disabled connection", "U7 → short output")}
            ${detailRow("Weight shifts", "11 active links changed")}
            <div class="modal-divider"></div>
            <button type="button" data-open-modal="architecture">Open child RNN</button>
          </aside>
        </div>
      </section>
    </div>
  `;
}

function populationCompositionModal() {
  return `
    <div class="lab-modal-backdrop" data-modal-backdrop>
      <section class="lab-modal data-window-modal" role="dialog" aria-modal="true" aria-label="Population composition">
        ${modalHeader("Population Composition", "Cohorts, strategies, and scarcity response")}
        <div class="data-window-body primary-first">
          <section class="modal-chart-card primary">
            <div class="modal-section-head">
              <div><span class="panel-label">Composition</span><h3>Living population by cohort</h3></div>
              <strong>20 / 100 living</strong>
            </div>
            <div id="composition-chart" class="composition-chart"></div>
          </section>
          <aside class="modal-side-card">
            <div class="modal-section-head">
              <div><span class="panel-label">Cohort Facts</span><h3>What dominates now</h3></div>
            </div>
            ${detailRow("Largest generation", "gen 2 · 8 agents")}
            ${detailRow("Dominant lineage", "L14 · 35% living")}
            ${detailRow("Common strategy", "short horizon · high strength")}
            ${detailRow("Crowding signal", "room ratio 0.80")}
            <div class="modal-divider"></div>
            <div class="metric-wall">
              ${performanceCard("Median age", "74")}
              ${performanceCard("Median energy", "20.8")}
              ${performanceCard("Strategy entropy", "0.71", "good")}
              ${performanceCard("Birth pressure", "1.08x")}
            </div>
          </aside>
        </div>
      </section>
    </div>
  `;
}

function runtimeDiagnosticsModal() {
  return `
    <div class="lab-modal-backdrop" data-modal-backdrop>
      <section class="lab-modal data-window-modal" role="dialog" aria-modal="true" aria-label="Runtime diagnostics">
        ${modalHeader("Runtime Diagnostics", "Worker, packet, and persistence health")}
        <div class="history-summary-grid modal-summary-pad">
          ${statusCard("Tick time", "18.4 ms")}
          ${statusCard("Brain eval", "parallel")}
          ${statusCard("Workers", "4")}
          ${statusCard("Timeouts", "0")}
          ${statusCard("Packet total", "45.6 KB")}
          ${statusCard("DB outbox", "synced")}
        </div>
        <div class="data-window-body primary-first">
          <section class="modal-chart-card">
            <div class="modal-section-head">
              <div><span class="panel-label">Runtime Cost</span><h3>Where the tick budget goes</h3></div>
              <strong>target 16.7 ms</strong>
            </div>
            <div id="runtime-bars" class="runtime-bars"></div>
          </section>
          <aside class="modal-side-card">
            <div class="modal-section-head">
              <div><span class="panel-label">Operational Risks</span><h3>What could slow the run</h3></div>
            </div>
            ${detailRow("Brain shards", "4 completed")}
            ${detailRow("Fallback mode", "not active")}
            ${detailRow("Persistence latency", "38 ms")}
            ${detailRow("Roster cadence", "250 ms")}
            ${detailRow("Inspection payload", "on demand only")}
          </aside>
        </div>
      </section>
    </div>
  `;
}

function modalHeader(eyebrow, title) {
  return `
    <header class="lab-modal-header">
      <button type="button" class="modal-close" data-modal-close aria-label="Close modal">x</button>
      <div>
        <span class="eyebrow">${eyebrow}</span>
        <h2>${title}</h2>
      </div>
    </header>
  `;
}

function tableHead(label) {
  return `<strong>${label}</strong>`;
}

function tradeTableRow(row) {
  return `
    <div class="data-table-row ${row.status}">
      <span>${row.id}</span>
      <button type="button" data-open-modal="agentTimeline">${row.agent}</button>
      <span>${row.dir}</span>
      <span>${row.entry}</span>
      <span>${row.horizon}</span>
      <span>${row.entrySignal}</span>
      <span>${row.exitSignal}</span>
      <strong>${row.payoff}</strong>
      <b class="tag ${row.status}">${row.status}</b>
    </div>
  `;
}

function lineageTableRow(row) {
  return `
    <article class="lineage-record">
      <div>
        <strong>${row.id}</strong>
        <span>${row.note}</span>
      </div>
      <div class="lineage-record-stats">
        <span>${row.living} living</span>
        <span>${row.hit} hit</span>
        <span>${row.payoff}</span>
        <span>${row.unique} unique</span>
      </div>
      <button type="button" data-open-modal="mutationDiff">Diff</button>
    </article>
  `;
}

function diffTableRow(row) {
  return `
    <div class="data-table-row diff-row ${row.tone}">
      <span>${row.trait}</span>
      <span>${row.parent}</span>
      <span>${row.child}</span>
      <strong>${row.delta}</strong>
    </div>
  `;
}

function lineageNode(name, detail, tone = "") {
  return `<article class="lineage-node ${tone}"><strong>${name}</strong><span>${detail}</span></article>`;
}

function timelineEvent(tick, title, detail) {
  return `<article class="timeline-event"><span>${tick}</span><strong>${title}</strong><p>${detail}</p></article>`;
}

function detailRow(label, value) {
  return `<div class="detail-row"><span>${label}</span><strong>${value}</strong></div>`;
}

function featureRow(label, value, median, zScore) {
  return `<article class="feature-row"><strong>${label}</strong><span>value ${value} · median ${median} · z ${zScore}</span></article>`;
}

function runHistoryRow(run) {
  return `
    <article class="history-run-row ${run.selected ? "selected" : ""}">
      <b class="badge">${run.id.slice(0, 2)}</b>
      <div><strong>run ${run.id}</strong><span>${run.detail}</span></div>
      <input type="checkbox" ${run.selected ? "checked" : ""} aria-label="Select run ${run.id}" />
    </article>
  `;
}

function drawModalRnn(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const links = [
    [76, 78, 304, 88, "var(--cyan)", 2.2, "candidate"],
    [76, 158, 304, 176, "var(--gold)", 4.2, "update"],
    [76, 238, 304, 256, "var(--blue)", 2.8, "reset"],
    [338, 92, 592, 78, "var(--cyan)", 3.4, "long"],
    [338, 180, 592, 174, "var(--red)", 2.4, "short"],
    [338, 260, 592, 268, "var(--gold)", 1.8, "repro"],
    [338, 180, 338, 92, "var(--violet)", 2.2, "recurrent"],
  ];
  const nodes = [
    [38, 54, "ROC", "input", "input"],
    [38, 134, "Scale", "input", "input"],
    [38, 214, "Room", "input", "input"],
    [282, 66, "U7", "unit", "cand/update/reset"],
    [282, 154, "U9", "unit", "sparse GRU-like"],
    [282, 234, "U12", "unit", "memory"],
    [560, 54, "Long", "output", "trade"],
    [560, 150, "Short", "output", "trade"],
    [560, 246, "Birth", "output", "reproduce"],
  ];
  target.innerHTML = `
    <svg viewBox="0 0 720 360" role="img" aria-label="Gate-aware RNN architecture diagram">
      <rect width="720" height="360" fill="var(--chart)" />
      <text class="svg-axis" x="44" y="28">inputs</text>
      <text class="svg-axis" x="286" y="28">hidden units</text>
      <text class="svg-axis" x="566" y="28">outputs</text>
      ${links.map(([x1, y1, x2, y2, color, width, label]) => `<path class="modal-rnn-link" d="M ${x1} ${y1} C ${x1 + 120} ${y1}, ${x2 - 120} ${y2}, ${x2} ${y2}" stroke="${color}" stroke-width="${width}" /><text class="svg-axis" x="${(x1 + x2) / 2 - 18}" y="${(y1 + y2) / 2 - 5}">${label}</text>`).join("")}
      ${nodes.map(([x, y, label, type, sub]) => `<g class="modal-rnn-node ${type}"><rect x="${x}" y="${y}" width="84" height="48" rx="9" /><text x="${x + 42}" y="${y + 22}">${label}</text><text class="node-sub" x="${x + 42}" y="${y + 36}">${sub}</text></g>`).join("")}
    </svg>
  `;
}

function drawGatePanel(id) {
  const target = document.getElementById(id);
  if (!target) return;
  target.innerHTML = `
    ${meter("Candidate mix", "0.63", 63)}
    ${meter("Update carry", "0.71", 71)}
    ${meter("Reset openness", "0.28", 28)}
    ${meter("Hidden state", "-0.18", 42)}
  `;
}

function drawHistorySparkline(id, alternate = false) {
  const target = document.getElementById(id);
  if (!target) return;
  const values = alternate ? [0.01, 0.02, -0.01, 0.04, 0.03, 0.07, 0.05, 0.08] : simpleSeries;
  const min = alternate ? -0.04 : 0;
  const max = alternate ? 0.1 : 75;
  const width = 760;
  const height = 210;
  const path = seriesPath(values, { width, height, min, max, left: 52, right: 32, top: 28, bottom: 34 });
  target.innerHTML = drawFrame(
    width,
    height,
    `<path class="svg-line-glow" d="${path}" stroke-width="9" /><path class="${alternate ? "svg-line-gold" : "svg-line"}" d="${path}" stroke-width="3" />`,
    [String(max), String(((min + max) / 2).toFixed(2)), String(min)],
  );
}

function drawCompositionChart(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const cohorts = [
    ["gen 0", 3, "var(--cyan)"],
    ["gen 1", 5, "var(--gold)"],
    ["gen 2", 8, "var(--green)"],
    ["gen 3+", 4, "var(--violet)"],
  ];
  const bars = cohorts
    .map(([label, value, color], index) => {
      const x = 80 + index * 136;
      const height = Number(value) * 28;
      return `
        <rect x="${x}" y="${260 - height}" width="78" height="${height}" rx="8" fill="${color}" opacity="0.78" />
        <text class="svg-axis" x="${x + 39}" y="288" text-anchor="middle">${label}</text>
        <text class="node-label" x="${x + 39}" y="${246 - height}" text-anchor="middle">${value}</text>
      `;
    })
    .join("");
  target.innerHTML = `
    <svg viewBox="0 0 640 330" role="img" aria-label="Population composition chart">
      <rect width="640" height="330" fill="var(--chart)" />
      <line class="svg-grid-major" x1="54" y1="260" x2="592" y2="260" />
      <line class="svg-grid-minor" x1="54" y1="148" x2="592" y2="148" />
      <text class="svg-axis" x="20" y="152">4</text>
      <text class="svg-axis" x="20" y="264">0</text>
      ${bars}
    </svg>
  `;
}

function drawRuntimeBars(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const rows = [
    ["Brain eval", 8.4, "var(--cyan)"],
    ["World actions", 3.1, "var(--gold)"],
    ["Food resolve", 2.3, "var(--green)"],
    ["Packets", 1.8, "var(--violet)"],
    ["Persistence", 2.8, "var(--blue)"],
  ];
  target.innerHTML = `
    <div class="runtime-bar-list">
      ${rows
        .map(
          ([label, value, color]) => `
            <div class="runtime-bar-row">
              <span>${label}</span>
              <i class="bar" style="--value:${Math.min(100, Number(value) * 5.6)}%; --bar-color:${color}"></i>
              <strong>${value} ms</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

document.addEventListener("click", (event) => {
  const openButton = event.target.closest("[data-open-modal]");
  if (openButton) {
    openModal(openButton.dataset.openModal);
    return;
  }
  if (event.target.closest("[data-modal-close]") || event.target.matches("[data-modal-backdrop]")) {
    closeModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

renderWorkbench();
