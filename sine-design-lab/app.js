const directions = {
  terminal: {
    label: "Trading Terminal",
    summary: "Dense, sharp, high-contrast market instrumentation with chart-first hierarchy.",
  },
  lab: {
    label: "Scientific Lab",
    summary: "More spacious, research-oriented, with warmer surfaces and calmer inspection panels.",
  },
  control: {
    label: "Control Room",
    summary: "Bolder cockpit hierarchy, sticky command panel, stronger status rails, and higher chart contrast.",
  },
  observatory: {
    label: "Neural Observatory",
    summary: "Richer, more alive, with luminous neural surfaces and stronger agent/uniqueness presence.",
  },
};

const signalSeries = Array.from({ length: 90 }, (_, index) => {
  const x = index / 89;
  return {
    tick: 200 + index,
    value:
      1.1 * Math.sin(x * Math.PI * 2.25) +
      0.42 * Math.sin(x * Math.PI * 7.1 + 0.8) -
      0.2 * Math.cos(x * Math.PI * 12.4),
  };
});

const noiseSeries = Array.from({ length: 70 }, (_, index) => {
  const x = index / 69;
  return {
    tick: index,
    value: 0.23 * Math.sin(x * Math.PI * 9.3) + 0.12 * Math.sin(x * Math.PI * 21.2 + 1.4),
  };
});

const parameterSeries = [
  { label: "Amplitude", colorClass: "chart-line", values: [0.31, 0.32, 0.34, 0.37, 0.4, 0.42, 0.44] },
  { label: "Frequency", colorClass: "chart-line-third", values: [0.12, 0.13, 0.13, 0.14, 0.14, 0.15, 0.16] },
  { label: "Noise amp", colorClass: "chart-line-secondary", values: [0.21, 0.22, 0.24, 0.27, 0.3, 0.29, 0.31] },
];

const populationSeries = [
  { tick: 1, value: 20 },
  { tick: 4, value: 22 },
  { tick: 8, value: 29 },
  { tick: 12, value: 38 },
  { tick: 16, value: 46 },
  { tick: 20, value: 42 },
  { tick: 24, value: 55 },
  { tick: 28, value: 62 },
];

const uniquenessSeries = [
  { tick: 1, value: 4.2 },
  { tick: 4, value: 4.4 },
  { tick: 8, value: 4.1 },
  { tick: 12, value: 4.9 },
  { tick: 16, value: 4.6 },
  { tick: 20, value: 5.2 },
  { tick: 24, value: 4.8 },
  { tick: 28, value: 5.5 },
];

const spawners = [
  { id: 1, energy: 69, health: 100, action: "WAIT", selected: true },
  { id: 2, energy: 72, health: 100, action: "LONG" },
  { id: 3, energy: 66, health: 96, action: "WAIT" },
  { id: 4, energy: 82, health: 100, action: "SHORT" },
  { id: 5, energy: 74, health: 94, action: "WAIT" },
  { id: 6, energy: 61, health: 100, action: "REPRO" },
  { id: 7, energy: 58, health: 91, action: "WAIT" },
  { id: 8, energy: 88, health: 100, action: "LONG" },
];

function setDirection(direction) {
  const config = directions[direction] ?? directions.terminal;
  document.body.className = `theme-${direction}`;
  document.querySelector("#direction-label").textContent = config.label;
  document.querySelector("#direction-summary").textContent = config.summary;
  document.querySelectorAll("[data-direction]").forEach((button) => {
    button.classList.toggle("active", button.dataset.direction === direction);
  });
}

function svgFrame({ width = 960, height = 420, children = "", yLabels = ["+2.5%", "0.0%", "-2.5%"] }) {
  const majorYs = [48, height / 2, height - 48];
  const minorYs = [height * 0.26, height * 0.74];
  const xLines = Array.from({ length: 10 }, (_, index) => 58 + index * ((width - 112) / 9));
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Mock Sine chart">
      <rect width="${width}" height="${height}" fill="var(--chart-bg)" />
      ${xLines.map((x) => `<line class="chart-grid-minor" x1="${x.toFixed(1)}" y1="28" x2="${x.toFixed(1)}" y2="${height - 36}" />`).join("")}
      ${minorYs.map((y) => `<line class="chart-grid-minor" x1="54" y1="${y.toFixed(1)}" x2="${width - 36}" y2="${y.toFixed(1)}" />`).join("")}
      ${majorYs.map((y, index) => `<line class="chart-grid-major" x1="54" y1="${y.toFixed(1)}" x2="${width - 36}" y2="${y.toFixed(1)}" /><text class="chart-axis-text" x="18" y="${(y + 4).toFixed(1)}">${yLabels[index]}</text>`).join("")}
      ${children}
    </svg>
  `;
}

function pathFromSeries(series, { width = 960, height = 420, min = -2.5, max = 2.5, left = 70, right = 46, top = 34, bottom = 44 } = {}) {
  return series
    .map((point, index) => {
      const x = left + index * ((width - left - right) / (series.length - 1));
      const normalized = (point.value - min) / (max - min);
      const y = height - bottom - normalized * (height - top - bottom);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function pointAt(series, index, options) {
  const width = options?.width ?? 960;
  const height = options?.height ?? 420;
  const min = options?.min ?? -2.5;
  const max = options?.max ?? 2.5;
  const left = options?.left ?? 70;
  const right = options?.right ?? 46;
  const top = options?.top ?? 34;
  const bottom = options?.bottom ?? 44;
  const point = series[index];
  const x = left + index * ((width - left - right) / (series.length - 1));
  const y = height - bottom - ((point.value - min) / (max - min)) * (height - top - bottom);
  return { x, y };
}

function renderMainChart() {
  const line = pathFromSeries(signalSeries);
  const current = pointAt(signalSeries, 48);
  const trades = [18, 21, 24, 27, 31, 35].map((index, offset) => {
    const start = pointAt(signalSeries, index);
    const length = 110 + offset * 18;
    const y = start.y - 12 + offset * 7;
    const cls = offset % 3 === 0 ? "loss-marker" : "win-marker";
    return `
      <line class="trade-horizon" x1="${start.x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(start.x + length).toFixed(1)}" y2="${(y - 4).toFixed(1)}" />
      <circle class="trade-marker" cx="${start.x.toFixed(1)}" cy="${start.y.toFixed(1)}" r="7" />
      <path d="M ${start.x - 4} ${start.y} L ${start.x + 2} ${start.y + 5} L ${start.x + 8} ${start.y - 7}" fill="none" stroke="var(--accent-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <circle class="${cls}" cx="${(start.x + length).toFixed(1)}" cy="${(y - 4).toFixed(1)}" r="4.5" />
    `;
  }).join("");

  document.querySelector("#main-chart").innerHTML = svgFrame({
    children: `
      <path class="chart-line-glow" d="${line}" stroke-width="10" />
      <path class="chart-line" d="${line}" stroke-width="3.5" />
      <line class="current-tick" x1="${current.x.toFixed(1)}" y1="34" x2="${current.x.toFixed(1)}" y2="376" />
      <text class="chart-axis-text" x="${current.x + 8}" y="54" fill="var(--accent-2)">current tick</text>
      ${trades}
    `,
  });
}

function renderSmallLine(selector, series, options = {}) {
  const width = options.width ?? 620;
  const height = options.height ?? 210;
  const min = options.min ?? -1;
  const max = options.max ?? 1;
  const line = pathFromSeries(series, { width, height, min, max, top: 28, bottom: 32, left: 42, right: 28 });
  document.querySelector(selector).innerHTML = svgFrame({
    width,
    height,
    yLabels: options.yLabels ?? ["High", "Mid", "Low"],
    children: `
      <path class="chart-line-glow" d="${line}" stroke-width="8" />
      <path class="${options.className ?? "chart-line-secondary"}" d="${line}" stroke-width="2.8" />
    `,
  });
}

function renderMultiLine(selector) {
  const width = 620;
  const height = 210;
  const children = parameterSeries
    .map((series) => {
      const points = series.values.map((value, index) => ({ tick: index, value }));
      return `<path class="${series.colorClass}" d="${pathFromSeries(points, { width, height, min: 0, max: 0.55, top: 34, bottom: 36, left: 42, right: 28 })}" stroke-width="2.6" />`;
    })
    .join("");
  document.querySelector(selector).innerHTML = svgFrame({
    width,
    height,
    yLabels: ["High", "Mid", "Low"],
    children,
  });
}

function renderArchitectureGraph() {
  const links = [
    [92, 58, 292, 88, "var(--accent)", 3],
    [92, 138, 292, 128, "var(--accent)", 2],
    [92, 218, 292, 168, "var(--negative)", 2.5],
    [326, 96, 514, 78, "var(--accent-2)", 3],
    [326, 156, 514, 154, "var(--accent)", 2],
    [326, 186, 514, 222, "var(--negative)", 2.8],
  ];
  const nodes = [
    [60, 38, "I1", "input"],
    [60, 118, "I6", "input"],
    [60, 198, "I13", "input"],
    [270, 70, "U1", ""],
    [270, 150, "U2", ""],
    [492, 58, "O1", "output"],
    [492, 138, "O2", "output"],
    [492, 202, "O6", "output"],
  ];
  document.querySelector("#architecture-graph").innerHTML = `
    <svg viewBox="0 0 620 280" role="img" aria-label="Mock sparse GRU-like architecture">
      <rect width="620" height="280" fill="var(--chart-bg)" />
      ${links.map(([x1, y1, x2, y2, color, width]) => `<path class="architecture-link" d="M ${x1} ${y1} C ${x1 + 90} ${y1}, ${x2 - 90} ${y2}, ${x2} ${y2}" stroke="${color}" stroke-width="${width}" />`).join("")}
      ${nodes.map(([x, y, label, type]) => `<rect class="architecture-node ${type}" x="${x}" y="${y}" width="64" height="42" rx="10" /><text class="architecture-label" x="${x + 32}" y="${y + 26}">${label}</text>`).join("")}
    </svg>
  `;
}

function renderSpawners() {
  document.querySelector("#spawner-grid").innerHTML = spawners
    .map((spawner) => `
      <article class="spawner-card ${spawner.selected ? "selected" : ""}">
        <header><b>${spawner.id}</b><span>${spawner.action}</span></header>
        <div class="meter">Energy ${spawner.energy}<i style="--value: ${spawner.energy}%"></i></div>
        <div class="meter">Health ${spawner.health}<i style="--value: ${spawner.health}%"></i></div>
      </article>
    `)
    .join("");
}

function renderAllCharts() {
  renderMainChart();
  renderSmallLine("#noise-chart", noiseSeries, { min: -0.55, max: 0.55 });
  renderMultiLine("#parameter-chart");
  renderSmallLine("#telemetry-chart", populationSeries, { min: 0, max: 70, className: "chart-line", yLabels: ["70", "35", "0"] });
  renderSmallLine("#uniqueness-chart", uniquenessSeries, { min: 0, max: 6, className: "chart-line-secondary", yLabels: ["6", "3", "0"] });
  renderSmallLine("#history-chart", populationSeries, { width: 760, height: 150, min: 0, max: 70, className: "chart-line-third", yLabels: ["70", "35", "0"] });
  renderArchitectureGraph();
  renderSpawners();
}

document.querySelectorAll("[data-direction]").forEach((button) => {
  button.addEventListener("click", () => setDirection(button.dataset.direction));
});

renderAllCharts();
