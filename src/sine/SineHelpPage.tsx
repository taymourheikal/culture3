import { SineViewTabs } from "./SineViewTabs";
import { SPAWNER_INPUT_METADATA } from "./spawner/inputMetadata";
import type { SineView } from "./SineApp";

const HELP_SECTIONS = [
  { id: "simulator", label: "Simulator" },
  { id: "agents", label: "Agents" },
  { id: "rnn-wiring", label: "RNN wiring" },
  { id: "io", label: "Inputs & outputs" },
  { id: "architecture", label: "Architecture" },
  { id: "reward", label: "Reward" },
  { id: "rolling-loss", label: "Rolling loss" },
  { id: "uniqueness", label: "Uniqueness" },
  { id: "evolution", label: "Evolution" },
  { id: "runtime", label: "Runtime" },
] as const;

export function SineHelpPage({ activeView, onViewChange }: { activeView: SineView; onViewChange: (view: SineView) => void }) {
  return (
    <main className="sine-help-shell">
      <header className="sine-help-header">
        <div>
          <span className="sine-eyebrow">Toy Market Simulator</span>
          <h1>Help</h1>
        </div>
        <SineViewTabs activeView={activeView} onViewChange={onViewChange} />
      </header>

      <nav className="sine-help-nav" aria-label="Help sections">
        {HELP_SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`}>
            {section.label}
          </a>
        ))}
      </nav>

      <section className="sine-help-content">
        <article id="simulator" className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">What This Simulator Is</div>
          <p>
            <strong>This is a toy market source plus a population of food-spawning agents.</strong> In generated mode, the
            chart is a simulated rate-of-change signal that trends, cycles, and changes its noise regime over time. In BTC
            mode, the simulator derives the same kind of signal from candle data; agents still read signal features rather
            than future prices.
          </p>
          <ul>
            <li>The market source creates or loads the moving signal line.</li>
            <li>Food-spawner agents watch that signal and decide when it looks like an opportunity.</li>
            <li>When an agent acts, it drops a food marker on the chart: long if it expects ROC to rise, short if it expects ROC to fall.</li>
            <li>The marker resolves after the agent&apos;s chosen horizon in ticks, then the agent gains or loses energy and health.</li>
          </ul>
          <p>
            <strong>The simulator measures its own world in ticks.</strong> In generated mode, one tick is one generated bar.
            In BTC mode, one tick is one candle. Seconds only describe playback speed, such as ticks per second or bars per second.
          </p>
          <div className="sine-system-map" aria-label="Simulation system map">
            <div className="sine-map-node source">
              <span>1</span>
              <strong>Market source</strong>
              <small>Creates or loads the signal path and changing regimes.</small>
            </div>
            <div className="sine-map-arrow">-&gt;</div>
            <div className="sine-map-node">
              <span>2</span>
              <strong>Observed features</strong>
              <small>Recent returns, trend, range, volatility, roughness, crowding.</small>
            </div>
            <div className="sine-map-arrow">-&gt;</div>
            <div className="sine-map-node brain">
              <span>3</span>
              <strong>Spawner RNNs</strong>
              <small>Each agent decides whether this looks like an entry.</small>
            </div>
            <div className="sine-map-arrow">-&gt;</div>
            <div className="sine-map-node food">
              <span>4</span>
              <strong>Food marker</strong>
              <small>Long or short marker with size, horizon ticks, and cooldown ticks.</small>
            </div>
            <div className="sine-map-arrow">-&gt;</div>
            <div className="sine-map-node outcome">
              <span>5</span>
              <strong>Payoff</strong>
              <small>Resolved later as energy gain, loss, or health damage.</small>
            </div>
            <div className="sine-map-arrow">-&gt;</div>
            <div className="sine-map-node mutation">
              <span>6</span>
              <strong>Reproduction</strong>
              <small>Successful agents clone with weight and topology mutations.</small>
            </div>
          </div>
        </article>

        <article id="agents" className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">How Food-Spawning Agents Work</div>
          <p>
            <strong>Agents do not know the future.</strong> They only see recent market conditions, their own energy and health,
            and how crowded the chart already is with unresolved opportunities.
          </p>
          <p>
            <strong>Spawner inputs are relative to recent local scale.</strong> A market moving from -2% to +2% and a market
            moving from -10% to +10% should look similar to the RNN when their shapes match.
          </p>
          <div className="sine-rnn-schematic" aria-label="Food spawner RNN schematic">
            <div className="sine-rnn-node">
              <span>Market history</span>
              <strong>17 inputs</strong>
            </div>
            <div className="sine-rnn-arrow">-&gt;</div>
            <div className="sine-rnn-node primary">
              <span>Sparse GRU-like RNN</span>
              <strong>Evolving units</strong>
            </div>
            <div className="sine-rnn-arrow">-&gt;</div>
            <div className="sine-rnn-node">
              <span>Decision layer</span>
              <strong>6 outputs</strong>
            </div>
            <div className="sine-rnn-arrow">-&gt;</div>
            <div className="sine-rnn-node outcome">
              <span>Food marker</span>
              <strong>Reward or loss</strong>
            </div>
          </div>
          <div className="sine-io-grid" aria-label="Spawner input and output summary">
            <div className="sine-io-panel">
              <span className="sine-help-section-label">What the RNN can see</span>
              <div className="sine-chip-list">
                <span>ROC now</span>
                <span>Relative changes</span>
                <span>Relative mean</span>
                <span>Relative volatility</span>
                <span>Range position</span>
                <span>Relative cycle</span>
                <span>Relative trend</span>
                <span>Residual roughness</span>
                <span>Open marker density</span>
                <span>Energy</span>
                <span>Health</span>
                <span>Population room</span>
              </div>
            </div>
            <div className="sine-io-panel outputs">
              <span className="sine-help-section-label">What the RNN can choose</span>
              <div className="sine-chip-list">
                <span>Long</span>
                <span>Short</span>
                <span>Strength</span>
                <span>Horizon</span>
                <span>Cooldown</span>
                <span>Reproduce</span>
              </div>
            </div>
          </div>
          <p>
            <strong>GRU-like RNN</strong> means the agent has a small memory that updates every tick. An update gate decides
            how much new information to write, a reset gate decides how much old memory to ignore, and a candidate memory
            proposes the next internal state. This lets an agent react to sequences, not just the current point on the chart.
          </p>
          <p>
            <strong>The architecture can now evolve.</strong> Children can gain or disable individual memory units, and units
            can appear in deeper layers. Connections can also appear or disappear. Inputs and outputs stay fixed, lower layers
            can feed deeper layers, and recurrent links use previous-tick memory so there are no same-tick loops.
          </p>
          <p>
            <strong>Perception can evolve too.</strong> The fixed input slots keep the same broad meanings, but each agent can
            inherit and mutate the tick windows used to calculate its relative changes, trend, roughness, cycle, and pending
            density inputs. Population room is a fixed context input where 1 means open/empty and 0 means the population cap is full.
          </p>
          <div className="sine-help-columns">
            <div>
              <p className="sine-help-section-label">Trading policy genes</p>
              <p>
                <strong>Spawn threshold</strong> is the long or short score an agent must reach before it can place a marker.
                Higher values make the agent more selective. <strong>Min signal strength</strong> is the minimum marker size
                used when the strength output is small. Both values are inherited traits and can mutate at birth.
              </p>
            </div>
            <div>
              <p className="sine-help-section-label">Payoff scale genes</p>
              <p>
                Each agent also inherits a payoff-scale window and sample step. When it places food, the simulator snapshots
                that local scale onto the marker, so a later mutation does not rewrite the old marker&apos;s payoff rules.
              </p>
            </div>
          </div>
          <p>
            <strong>Evolvability can also evolve.</strong> Each agent carries its own mutation profile: how likely its children
            are to gain units, change links, shift weights, alter perception windows, or drift their own mutation settings.
            These are inherited values, not a global training schedule.
          </p>
        </article>

        <article id="rnn-wiring" className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">RNN Wiring And GRU-Like Memory</div>
          <p>
            <strong>Each hidden unit is a gated memory cell, but the wiring is sparse and evolvable.</strong> A traditional
            dense GRU layer usually has full input and recurrent matrices feeding every gate of every hidden unit. Sine stores
            individual connection genes instead. A connection points from one source to one target, and if the target is a
            hidden unit, it targets exactly one gate: update, reset, or candidate.
          </p>
          <p>
            <strong>That gate target matters.</strong> If an input connects to a unit&apos;s candidate gate, that does not mean
            it also connects to the unit&apos;s update or reset gate. Those would be separate connection genes with separate
            weights, and they may or may not exist in that agent.
          </p>
          <div className="sine-rnn-explainer-grid">
            <div className="sine-rnn-explainer-card">
              <p className="sine-help-section-label">One hidden memory unit</p>
              <GateMemorySvg />
              <p>
                The update gate controls how much of the new candidate state is written. The reset gate only changes how
                previous hidden memory contributes to the candidate calculation. The final hidden state blends old memory
                with the candidate.
              </p>
            </div>
            <div className="sine-rnn-explainer-card">
              <p className="sine-help-section-label">Sparse gate-specific links</p>
              <GateTargetSvg />
              <p>
                The same source can feed one gate, two gates, all three gates, or none. Mutation adds these links one at a
                time, so a brain can become denser over generations without being forced into a dense GRU matrix.
              </p>
            </div>
          </div>
          <div className="sine-help-columns">
            <div>
              <p className="sine-help-section-label">What matches a GRU</p>
              <ul>
                <li>Hidden units have update, reset, and candidate gates.</li>
                <li>Previous hidden memory can affect all three gates.</li>
                <li>The new hidden value blends previous memory with candidate memory.</li>
                <li>Recurrent links read previous-tick state, so the brain can remember sequences.</li>
              </ul>
            </div>
            <div>
              <p className="sine-help-section-label">What is modified</p>
              <ul>
                <li>The graph is sparse: missing connections really mean zero contribution.</li>
                <li>Connections are explicit genes instead of full dense matrices.</li>
                <li>Outputs are separate linear decision heads, not hidden cells.</li>
                <li>Additional hidden layers can emerge one unit at a time through mutation.</li>
              </ul>
            </div>
          </div>
          <p>
            <strong>An agent can evolve toward dense GRU-like wiring, but dense wiring is not automatic.</strong> Mutation can
            eventually add every legal input-to-gate and previous-hidden-to-gate link, but selection has to keep those links
            useful enough for the lineage to survive. The default founders start sparse on purpose.
          </p>
        </article>

        <article id="io" className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">Neural Network Inputs And Outputs</div>
          <p>
            <strong>The spawner NNs do not receive absolute amplitude as a decision input.</strong> Market inputs are divided
            by recent local scale so agents learn the shape of the ROC movement, not whether the same shape happens to be
            happening at a small or large absolute percent range.
          </p>
          <div className="sine-help-columns">
            <div>
              <p className="sine-help-section-label">Inputs</p>
              <ul className="sine-input-metadata-list">
                {SPAWNER_INPUT_METADATA.map((input) => (
                  <li key={input.index}>
                    <strong>I{input.index + 1}: {input.label}</strong>
                    <span>{input.description}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="sine-help-section-label">Outputs</p>
              <ul>
                <li><strong>Long score:</strong> whether to spawn a long opportunity.</li>
                <li><strong>Short score:</strong> whether to spawn a short opportunity.</li>
                <li><strong>Strength:</strong> how large the opportunity should be.</li>
                <li><strong>Horizon:</strong> how many ticks to wait before judging the opportunity.</li>
                <li><strong>Cooldown:</strong> how many ticks the agent waits before it can act again.</li>
                <li><strong>Reproduce:</strong> the probability of trying to make a child this tick.</li>
              </ul>
            </div>
          </div>
          <p>
            <strong>Reproduction is the sixth output.</strong> The RNN does not trigger birth with a hard yes/no command.
            Its reproduce output becomes a probability. The world still requires enough energy and room below the population
            cap; if those are true, the probability decides whether a child is created on that tick.
            Founders start with a conservative reproduction bias so the initial population does not instantly fill to the cap,
            but that bias is part of the inherited brain and can mutate over generations.
          </p>
          <p>
            <strong>Population room is the seventeenth input.</strong> It tells the brain how much space remains under the
            population cap. The reproduction energy gate stays fixed, but the energy cost of a successful birth rises from
            the base cost to a higher multiplier as population room disappears.
          </p>
        </article>

        <article id="architecture" className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">Architecture Rules</div>
          <p>
            <strong>Inputs and outputs are fixed; the hidden memory graph can evolve.</strong> At birth, several mutation
            gates can fire independently. Each can attempt one small structural change, such as adding, disabling, or
            re-enabling a unit or connection. Layers emerge one unit at a time when a new unit is placed deeper than the
            existing active units.
          </p>
          <div className="sine-layer-diagram" aria-label="Allowed and blocked neural architecture connections">
            <div className="sine-layer-stack">
              <div className="sine-layer input">Inputs</div>
              <div className="sine-layer hidden">Layer 1 memory</div>
              <div className="sine-layer hidden deep">Layer 2 memory</div>
              <div className="sine-layer output">Outputs</div>
            </div>
            <div className="sine-connection-board">
              <div className="sine-connection allowed">Inputs -&gt; hidden units</div>
              <div className="sine-connection allowed">Lower layer -&gt; deeper layer</div>
              <div className="sine-connection allowed">Hidden units -&gt; outputs</div>
              <div className="sine-connection allowed">Previous memory -&gt; same unit next tick</div>
              <div className="sine-connection blocked">Higher layer -&gt; lower layer</div>
              <div className="sine-connection blocked">Same-tick hidden loops</div>
              <div className="sine-connection blocked">Previous memory -&gt; output directly</div>
              <div className="sine-connection blocked">Outputs -&gt; hidden units</div>
            </div>
          </div>
          <div className="sine-architecture-svg-card">
            <p className="sine-help-section-label">Legal graph directions</p>
            <ArchitectureRulesSvg />
            <p>
              Current hidden values can feed deeper hidden layers or outputs in the same tick. Same-layer recurrence uses
              previous hidden values, not current values, which prevents instant hidden-to-hidden loops inside one tick.
            </p>
          </div>
          <div className="sine-rule-grid">
            <div className="sine-rule-card allowed">
              <strong>Allowed to mutate</strong>
              <ul>
                <li>Weights and biases can drift randomly.</li>
                <li>One hidden memory unit can be added, disabled, or re-enabled by a structural mutation.</li>
                <li>A connection can be added, disabled, or re-enabled by a structural mutation.</li>
                <li>A new unit can appear in a deeper layer by chance.</li>
                <li>Each agent can end up with a different hidden graph.</li>
                <li>Perception windows, payoff scale, trading policy, plasticity settings, and mutation tendencies can drift from parent to child.</li>
              </ul>
            </div>
            <div className="sine-rule-card blocked">
              <strong>Not allowed</strong>
              <ul>
                <li>The 17 input slots do not disappear or change order.</li>
                <li>The 6 output meanings do not change.</li>
                <li>Connections cannot point backward from deeper layers to earlier layers.</li>
                <li>Hidden units cannot form same-tick cycles.</li>
                <li>Outputs cannot feed back into the hidden memory.</li>
                <li>Energy and health input scales do not mutate in this version.</li>
              </ul>
            </div>
          </div>
        </article>

        <article id="reward" className="sine-help-panel">
          <div className="sine-help-panel-title">Reward And Loss</div>
          <p>
            <strong>There is still no backpropagation or training loss in the usual machine-learning sense.</strong> Instead,
            agents now have a small lifetime learning overlay. Profitable resolved markers can nudge the connections and
            biases that contributed to the decision; losing markers can nudge them the other way.
          </p>
          <p>
            A marker&apos;s payoff is based on the signal move from entry to exit. Long markers benefit from the signal rising.
            Short markers benefit from the signal falling. The predicted-direction move is reduced by transaction cost,
            divided by the entry payoff scale captured when the marker was spawned, then multiplied by marker strength.
          </p>
          <div className="sine-help-formula" aria-label="Food payoff formula">
            payoff = ((direction * (exitSignal - entrySignal) - transactionCost) / entryPayoffScale) * strength
          </div>
          <p>
            <strong>Direction is +1 for long and -1 for short.</strong> Transaction cost is subtracted before scale
            normalization, so the same raw cost is more punishing when the entry payoff scale is small and less punishing
            when the local signal amplitude is large.
          </p>
          <ul>
            <li>Positive payoff adds energy and can restore some health.</li>
            <li>Negative payoff removes energy and damages health.</li>
            <li>During life, reward feedback changes learned deltas, not the base genome itself.</li>
            <li>Markers from agents that have already died still count in world outcomes, but they do not train or mutate the dead agent.</li>
            <li>At reproduction, current neural learned deltas are folded into the child&apos;s inherited neural seed before mutation.</li>
            <li>Those learned deltas can fade over time through experience decay.</li>
            <li>The chart&apos;s loss line is the recent average negative payoff from resolved markers.</li>
          </ul>
          <div className="sine-help-columns">
            <div>
              <p className="sine-help-section-label">Food lifecycle</p>
              <ul>
                <li>Spawned markers start as pending food with entry signal, strength, horizon, and payoff-scale snapshot.</li>
                <li>At resolve tick, each marker resolves once as a win or loss and updates world payoff statistics.</li>
                <li>If the creator is still alive, it also receives energy, health, per-agent stats, and learning feedback.</li>
              </ul>
            </div>
            <div>
              <p className="sine-help-section-label">Learning overlay</p>
              <ul>
                <li>Resolved food turns payoff into a bounded learning signal with tanh.</li>
                <li>Learning can change connection-weight deltas, output-bias deltas, and hidden gate-bias deltas.</li>
                <li>The base genome is unchanged during life; inherited neural seed is materialized only when a child is born.</li>
              </ul>
            </div>
          </div>
        </article>

        <article id="rolling-loss" className="sine-help-panel">
          <div className="sine-help-panel-title">Rolling Loss</div>
          <p>
            <strong>Rolling loss is the average recent damage from resolved food markers.</strong> The simulator keeps a
            recent payoff window. For each payoff in that window, wins are converted to <strong>0</strong> and losses are
            converted to their positive loss size.
          </p>
          <p>
            In plain terms: <strong>Rolling loss = average of max(0, -payoff) across recent resolved markers.</strong> A
            payoff of +0.20 adds 0 to rolling loss. A payoff of -0.20 adds 0.20. A higher line means recent opportunities
            have been more harmful. A lower line means recent resolved markers have been less harmful, or mostly profitable.
          </p>
          <p>
            <strong>If trading were completely random,</strong> rolling loss would not fall to zero. It would usually hover
            around the average downside of random entries after transaction costs, with more wobble when few markers resolve
            and a steadier line when many markers resolve.
          </p>
          <p>
            <strong>Population affects how much evidence is flowing into the metric.</strong> A large population can create
            more markers, so rolling loss updates more often and may reflect the crowd&apos;s current behavior quickly. A small
            population creates fewer markers, so the line can look quieter, stale, or jumpy because it is based on fewer
            recent outcomes.
          </p>
        </article>

        <article id="uniqueness" className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">Uniqueness Percentile</div>
          <p>
            <strong>Uniqueness asks how unusual one spawner&apos;s RNN design is compared with the living population.</strong>{" "}
            The score uses one versioned vector that summarizes the brain&apos;s layer shape, active wiring, recurrence,
            input usage, output usage, weights, biases, horizon ticks, cooldown ticks, perception settings, selected
            mutation-profile traits, plasticity-profile traits, and reachable graph structure.
          </p>
          <p>
            <strong>For living agents, uniqueness uses the effective brain.</strong> That means temporary learned weight and
            bias deltas are included, so an agent can become more or less unusual during its own lifetime.
          </p>
          <p>
            <strong>The visible number is a percentile.</strong> Higher means farther from the current population center
            than more of the living peers at that comparison tick. Clicking it also shows the raw distance, nearest similar
            spawners, and the vector dimensions that look most typical or most different.
          </p>
          <p>
            <strong>Uniqueness is descriptive, not fitness.</strong> It does not directly reward an agent, kill it, or make it
            reproduce. It is an inspection metric for comparing the current effective brain and inherited traits against the
            living population.
          </p>
          <p>
            <strong>The Uniqueness population limit setting controls when this calculation pauses.</strong> Raising it keeps
            the chart active with more living spawners, but it asks the browser to compare more RNNs.
          </p>
        </article>

        <article id="evolution" className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">Evolution And Mutation</div>
          <p>
            <strong>Agents evolve by surviving long enough to reproduce.</strong> An agent can clone itself when it has enough
            energy and the population is below the max population setting.
          </p>
          <p>
            <strong>The brain controls reproduction probabilistically.</strong> Its reproduce output sets the chance of birth
            on each eligible tick. Good food decisions still matter because they create the energy needed to become eligible.
            Successful births also create a positive lifetime learning signal for the reproduce decision that caused them.
          </p>
          <p>
            <strong>Energy is spendable fuel; health is damage tolerance.</strong> Newborn agents inherit the parent&apos;s
            brain, but they start with configured starting energy and health rather than copying the parent&apos;s current values.
            Toy Market also has an energy drain per tick; that is upkeep for spawner agents, separate from Ant World's energy model.
          </p>
          <ul>
            <li>Children inherit a neural seed made from the parent&apos;s base RNN plus current learned neural deltas.</li>
            <li>Small random mutations can change weights, biases, units, connections, perception windows, payoff scale, trading policy, plasticity settings, and mutation profile values at birth.</li>
            <li>The child&apos;s own learned overlay starts empty, so it must build its own lifetime experience.</li>
            <li>Only neural learned deltas fold into children: connection weights, output biases, and hidden gate biases.</li>
            <li>Perception, trading policy, horizons, cooldown, threshold bias, mutation profile, and plasticity profile remain inherited and mutated genes, not lifetime learned deltas.</li>
            <li>Perception mutations can change which tick windows are used to read market shape.</li>
            <li>Mutation-profile drift can make one lineage&apos;s descendants more or less exploratory than another&apos;s.</li>
            <li>Plasticity-profile drift can make descendants learn faster, slower, forget faster, or keep learned changes longer.</li>
            <li>Structural mutations can add or disable one memory unit, or add, disable, or re-enable one connection.</li>
            <li>Layers are not added as full blocks. They emerge when a new unit appears deeper than the current deepest active layer.</li>
            <li>Bad entry behavior tends to lose energy or health, which prevents reproduction or kills the agent.</li>
            <li>Useful entry behavior tends to create more energy, which gives that lineage more chances to spread.</li>
          </ul>
          <p>
            <strong>This change does not add backpropagation or new trading risk rules.</strong> Reward, payoff, death and
            reproduction eligibility stay as world rules. Brain costs remain optional world/config rules and default to zero.
            Action thresholds and minimum position sizing are inherited trading-policy genes. Bad perception or overly chaotic
            mutation is allowed to fail naturally through poor opportunities, lost energy, and death.
          </p>
          <div className="sine-lifecycle" aria-label="Spawner agent mutation lifecycle">
            <div className="sine-life-step">
              <span>1</span>
              <strong>Agent acts</strong>
              <small>It places long or short food when its outputs pass the action threshold.</small>
            </div>
            <div className="sine-life-arrow">-&gt;</div>
            <div className="sine-life-step">
              <span>2</span>
              <strong>Marker resolves</strong>
              <small>The later signal move becomes scale-normalized payoff after cost.</small>
            </div>
            <div className="sine-life-arrow">-&gt;</div>
            <div className="sine-life-step">
              <span>3</span>
              <strong>Energy changes</strong>
              <small>Positive payoff adds energy; negative payoff damages health.</small>
            </div>
            <div className="sine-life-arrow">-&gt;</div>
            <div className="sine-life-step">
              <span>4</span>
              <strong>Child is born</strong>
              <small>The brain is copied, then weights, biases, units, or links may mutate.</small>
            </div>
          </div>
        </article>

        <article id="runtime" className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">Runtime And Performance</div>
          <p>
            <strong>Most tick cost comes from evaluating living brains, building per-agent inputs, resolving markers, and
            computing inspection telemetry.</strong> Larger populations create more RNN forward passes, more possible food
            markers, and more data for charts and sidebars to summarize.
          </p>
          <div className="sine-help-columns">
            <div>
              <p className="sine-help-section-label">Brain evaluation mode</p>
              <p>
                The codebase has a browser-worker brain evaluation pool with genome caching, shard timeouts, and sync
                fallback. Current automatic selection stays on sync evaluation because the object-payload worker path was
                slower in browser performance tests through 500 agents.
              </p>
            </div>
            <div>
              <p className="sine-help-section-label">Correctness safeguards</p>
              <p>
                If parallel evaluation is enabled later and a shard fails, times out, or returns stale results, the batch can
                fall back to sync evaluation or be rejected before decisions are applied. Pause, stop, and reset invalidate
                in-flight brain batches so stale ticks do not mutate the active run.
              </p>
            </div>
          </div>
          <p>
            <strong>Performance settings trade detail for speed.</strong> High max population, active uniqueness scoring,
            long perception/payoff windows, many open markers, and nonzero brain complexity costs all add per-tick work.
            Lowering those settings reduces CPU load without changing the core agent rules.
          </p>
        </article>
      </section>
    </main>
  );
}

function GateMemorySvg() {
  return (
    <svg className="sine-help-svg" viewBox="0 0 520 260" role="img" aria-label="GRU-like hidden unit gate calculation">
      <defs>
        <marker id="gate-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" />
        </marker>
      </defs>
      <g className="sine-svg-muted">
        <rect x="18" y="30" width="92" height="42" rx="8" />
        <text x="64" y="56">inputs</text>
        <rect x="18" y="132" width="92" height="42" rx="8" />
        <text x="64" y="157">prev h</text>
      </g>
      <g className="sine-svg-gate">
        <rect x="188" y="24" width="104" height="42" rx="8" />
        <text x="240" y="50">update z</text>
        <rect x="188" y="108" width="104" height="42" rx="8" />
        <text x="240" y="134">reset r</text>
        <rect x="188" y="190" width="104" height="42" rx="8" />
        <text x="240" y="216">candidate n</text>
      </g>
      <g className="sine-svg-output">
        <rect x="388" y="96" width="110" height="54" rx="10" />
        <text x="443" y="119">new hidden</text>
        <text x="443" y="139">h(t)</text>
      </g>
      <g className="sine-svg-edge allowed" markerEnd="url(#gate-arrow)">
        <path d="M 110 51 C 138 51 152 45 188 45" />
        <path d="M 110 51 C 146 70 154 129 188 129" />
        <path d="M 110 51 C 154 84 154 211 188 211" />
        <path d="M 110 153 C 150 153 150 45 188 45" />
        <path d="M 110 153 C 144 153 154 129 188 129" />
        <path d="M 110 153 C 150 164 154 211 188 211" />
        <path d="M 292 45 C 340 55 356 92 388 113" />
        <path d="M 292 211 C 340 200 356 150 388 134" />
      </g>
      <g className="sine-svg-edge reset" markerEnd="url(#gate-arrow)">
        <path d="M 292 129 C 324 139 324 191 292 211" />
      </g>
      <g className="sine-svg-caption">
        <text x="260" y="254">Formula: h(t) = (1 - z) * h(t-1) + z * candidate</text>
      </g>
    </svg>
  );
}

function GateTargetSvg() {
  return (
    <svg className="sine-help-svg" viewBox="0 0 520 260" role="img" aria-label="Sparse connections can target individual gates">
      <defs>
        <marker id="target-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" />
        </marker>
      </defs>
      <g className="sine-svg-muted">
        <rect x="22" y="38" width="112" height="42" rx="8" />
        <text x="78" y="64">input I3</text>
        <rect x="22" y="168" width="112" height="42" rx="8" />
        <text x="78" y="194">hidden A prev</text>
      </g>
      <g className="sine-svg-unit">
        <rect x="326" y="24" width="158" height="212" rx="14" />
        <text x="405" y="52">hidden unit B</text>
        <rect x="356" y="72" width="98" height="34" rx="8" />
        <text x="405" y="94">update</text>
        <rect x="356" y="116" width="98" height="34" rx="8" />
        <text x="405" y="138">reset</text>
        <rect x="356" y="160" width="98" height="34" rx="8" />
        <text x="405" y="182">candidate</text>
      </g>
      <g className="sine-svg-edge allowed" markerEnd="url(#target-arrow)">
        <path d="M 134 59 C 214 58 270 88 356 89" />
        <path d="M 134 189 C 220 188 270 177 356 177" />
      </g>
      <g className="sine-svg-edge blocked dashed" markerEnd="url(#target-arrow)">
        <path d="M 134 59 C 210 86 272 132 356 133" />
        <path d="M 134 189 C 218 162 272 89 356 89" />
      </g>
      <g className="sine-svg-legend">
        <circle cx="44" cy="232" r="5" className="allowed-dot" />
        <text x="60" y="236">existing connection gene</text>
        <circle cx="44" cy="250" r="5" className="blocked-dot" />
        <text x="60" y="254">not connected unless a separate gene exists</text>
      </g>
    </svg>
  );
}

function ArchitectureRulesSvg() {
  return (
    <svg className="sine-help-svg sine-help-svg-wide" viewBox="0 0 760 320" role="img" aria-label="Allowed and blocked Sine RNN graph directions">
      <defs>
        <marker id="rules-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" />
        </marker>
      </defs>
      <g className="sine-svg-layer">
        <rect x="30" y="54" width="128" height="76" rx="10" />
        <text x="94" y="87">Inputs</text>
        <text x="94" y="109">fixed slots</text>
        <rect x="244" y="38" width="148" height="108" rx="12" />
        <text x="318" y="75">Layer 1</text>
        <text x="318" y="97">memory gates</text>
        <text x="318" y="119">prev h allowed</text>
        <rect x="462" y="38" width="148" height="108" rx="12" />
        <text x="536" y="75">Layer 2</text>
        <text x="536" y="97">deeper memory</text>
        <text x="536" y="119">optional</text>
        <rect x="646" y="54" width="84" height="76" rx="10" />
        <text x="688" y="87">Outputs</text>
        <text x="688" y="109">6 heads</text>
      </g>
      <g className="sine-svg-edge allowed" markerEnd="url(#rules-arrow)">
        <path d="M 158 92 C 190 92 210 92 244 92" />
        <path d="M 392 92 C 424 92 430 92 462 92" />
        <path d="M 610 92 C 624 92 632 92 646 92" />
        <path d="M 318 146 C 356 204 278 206 318 146" />
      </g>
      <g className="sine-svg-edge blocked dashed" markerEnd="url(#rules-arrow)">
        <path d="M 462 62 C 418 18 316 14 244 62" />
        <path d="M 318 38 C 350 7 386 8 392 56" />
        <path d="M 646 118 C 548 254 300 252 244 126" />
      </g>
      <g className="sine-svg-legend">
        <circle cx="208" cy="260" r="5" className="allowed-dot" />
        <text x="224" y="264">green: legal input, forward, output, or previous-tick recurrent path</text>
        <circle cx="208" cy="286" r="5" className="blocked-dot" />
        <text x="224" y="290">red dashed: blocked same-tick loop, backward link, or output feedback</text>
      </g>
    </svg>
  );
}
