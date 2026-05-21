import { SineViewTabs } from "./SineViewTabs";
import type { SineView } from "./SineApp";

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

      <section className="sine-help-content">
        <article className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">What This Simulator Is</div>
          <p>
            <strong>This is a toy market generator plus a population of food-spawning agents.</strong> The chart is not a real
            price. It is a simulated rate-of-change signal that trends, cycles, and changes its noise regime over time.
          </p>
          <ul>
            <li>The market generator creates the moving ROC line.</li>
            <li>Food-spawner agents watch that signal and decide when it looks like an opportunity.</li>
            <li>When an agent acts, it drops a food marker on the chart: long if it expects ROC to rise, short if it expects ROC to fall.</li>
            <li>The marker resolves after the agent&apos;s chosen horizon, then the agent gains or loses energy and health.</li>
          </ul>
          <div className="sine-system-map" aria-label="Simulation system map">
            <div className="sine-map-node source">
              <span>1</span>
              <strong>Market generator</strong>
              <small>Creates the ROC line and changing regimes.</small>
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
              <small>Long or short marker with size, horizon, and cooldown.</small>
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

        <article className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">How Food-Spawning Agents Work</div>
          <p>
            <strong>Agents do not know the future.</strong> They only see recent market conditions, their own energy and health,
            and how crowded the chart already is with unresolved opportunities.
          </p>
          <div className="sine-rnn-schematic" aria-label="Food spawner RNN schematic">
            <div className="sine-rnn-node">
              <span>Market history</span>
              <strong>15 inputs</strong>
            </div>
            <div className="sine-rnn-arrow">-&gt;</div>
            <div className="sine-rnn-node primary">
              <span>Sparse GRU-like RNN</span>
              <strong>Evolving units</strong>
            </div>
            <div className="sine-rnn-arrow">-&gt;</div>
            <div className="sine-rnn-node">
              <span>Decision layer</span>
              <strong>5 outputs</strong>
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
                <span>Short changes</span>
                <span>Average ROC</span>
                <span>Volatility</span>
                <span>Range estimate</span>
                <span>Cycle estimate</span>
                <span>Trend estimate</span>
                <span>Residual roughness</span>
                <span>Open marker density</span>
                <span>Energy</span>
                <span>Health</span>
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
        </article>

        <article className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">Neural Network Inputs And Outputs</div>
          <p>
            <strong>The spawner NNs do not receive the generator&apos;s hidden settings.</strong> Amplitude, frequency, slope,
            and noise are estimated from recent observed ROC history, because a real market would not reveal those values directly.
          </p>
          <div className="sine-help-columns">
            <div>
              <p className="sine-help-section-label">Inputs</p>
              <ul>
                <li>Current ROC value.</li>
                <li>Recent ROC changes across short lag windows.</li>
                <li>Recent average ROC and recent volatility.</li>
                <li>Estimated signal shape: local range, cycle rate, trend slope, residual volatility, and roughness.</li>
                <li>Pending opportunity density, meaning how crowded the chart is with unresolved food markers.</li>
                <li>The agent&apos;s energy ratio and health ratio.</li>
              </ul>
            </div>
            <div>
              <p className="sine-help-section-label">Outputs</p>
              <ul>
                <li><strong>Long score:</strong> whether to spawn a long opportunity.</li>
                <li><strong>Short score:</strong> whether to spawn a short opportunity.</li>
                <li><strong>Strength:</strong> how large the opportunity should be.</li>
                <li><strong>Horizon:</strong> how long to wait before judging the opportunity.</li>
                <li><strong>Cooldown:</strong> how long the agent waits before it can act again.</li>
              </ul>
            </div>
          </div>
        </article>

        <article className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">Architecture Rules</div>
          <p>
            <strong>Inputs and outputs are fixed; the hidden memory graph can evolve.</strong> A child may gain one new unit,
            lose one unit, or change one connection at birth. Layers emerge one unit at a time when a new unit is placed deeper
            than the existing active units.
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
          <div className="sine-rule-grid">
            <div className="sine-rule-card allowed">
              <strong>Allowed to mutate</strong>
              <ul>
                <li>Weights and biases can drift randomly.</li>
                <li>One hidden memory unit can be added or disabled.</li>
                <li>One connection can be added, disabled, or re-enabled.</li>
                <li>A new unit can appear in a deeper layer by chance.</li>
                <li>Each agent can end up with a different hidden graph.</li>
              </ul>
            </div>
            <div className="sine-rule-card blocked">
              <strong>Not allowed</strong>
              <ul>
                <li>The 15 input meanings do not change.</li>
                <li>The 5 output meanings do not change.</li>
                <li>Connections cannot point backward from deeper layers to earlier layers.</li>
                <li>Hidden units cannot form same-tick cycles.</li>
                <li>Outputs cannot feed back into the hidden memory.</li>
              </ul>
            </div>
          </div>
        </article>

        <article className="sine-help-panel">
          <div className="sine-help-panel-title">Reward And Loss</div>
          <p>
            <strong>There is no training loss function in the usual machine-learning sense.</strong> The RNN weights are not
            updated by backpropagation while an agent is alive.
          </p>
          <p>
            A marker&apos;s payoff is based on whether ROC moved in the predicted direction before the horizon ended. Long
            markers benefit from ROC rising. Short markers benefit from ROC falling. The payoff is scaled by marker strength
            and reduced by transaction cost.
          </p>
          <ul>
            <li>Positive payoff adds energy and can restore some health.</li>
            <li>Negative payoff removes energy and damages health.</li>
            <li>The chart&apos;s loss line is the recent average negative payoff from resolved markers.</li>
          </ul>
        </article>

        <article className="sine-help-panel">
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

        <article className="sine-help-panel sine-help-panel-wide">
          <div className="sine-help-panel-title">Evolution And Mutation</div>
          <p>
            <strong>Agents evolve by surviving long enough to reproduce.</strong> An agent can clone itself when it has enough
            energy, enough resolved trades, and a good enough recent average payoff.
          </p>
          <p>
            <strong>Energy is spendable fuel; health is damage tolerance.</strong> Newborn agents inherit the parent&apos;s
            brain, but they start with configured starting energy and health rather than copying the parent&apos;s current values.
          </p>
          <ul>
            <li>Children inherit the parent&apos;s RNN units, connections, weights, biases, horizons, cooldown, and mutation size.</li>
            <li>Small random mutations can change weights and biases at birth.</li>
            <li>Structural mutations can add or disable one memory unit, or add, disable, or re-enable one connection.</li>
            <li>Layers are not added as full blocks. They emerge when a new unit appears deeper than the current deepest active layer.</li>
            <li>Bad entry behavior tends to lose energy or health, which prevents reproduction or kills the agent.</li>
            <li>Useful entry behavior tends to create more energy, which gives that lineage more chances to spread.</li>
          </ul>
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
              <small>The later ROC move becomes a payoff after cost.</small>
            </div>
            <div className="sine-life-arrow">-&gt;</div>
            <div className="sine-life-step">
              <span>3</span>
              <strong>Energy changes</strong>
              <small>Good entries feed reproduction; bad entries damage health.</small>
            </div>
            <div className="sine-life-arrow">-&gt;</div>
            <div className="sine-life-step">
              <span>4</span>
              <strong>Child is born</strong>
              <small>The brain is copied, then weights, biases, units, or links may mutate.</small>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
