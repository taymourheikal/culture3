import { AppModeTabs, type AppMode } from "./AppModeTabs";

type Props = {
  activeMode: AppMode;
  onModeChange: (mode: AppMode) => void;
};

export function HelpPage({ activeMode, onModeChange }: Props) {
  return (
    <main className="help-shell">
      <header className="help-header">
        <div className="brand-cluster">
          <div>
            <span className="eyebrow">Emergent Ant World</span>
            <h1>Help</h1>
          </div>
          <AppModeTabs activeMode={activeMode} onChange={onModeChange} />
        </div>
      </header>

      <section className="help-content">
        <article className="panel help-panel help-panel-wide">
          <div className="panel-title">What You Are Watching</div>
          <p>
            <strong>This is a small artificial world where agents try to survive.</strong>
          </p>
          <ul>
            <li>Agents search for food, spend energy, age, reproduce, and sometimes attack.</li>
            <li>No one gives them a strategy. Behavior emerges from survival and reproduction.</li>
            <li>Each agent has inherited traits and a small neural network that chooses actions.</li>
          </ul>
        </article>

        <article className="panel help-panel help-panel-wide">
          <div className="panel-title">How Agents Decide</div>
          <p>
            <strong>Every tick, an agent senses the world and its neural network chooses what to do.</strong>
          </p>
          <div className="help-columns">
            <div>
              <p className="help-section-label">Neural network inputs</p>
              <ul>
                <li>Energy, health, and age.</li>
                <li>Direction toward nearby food and how close that food is.</li>
                <li>Direction toward the nearest agent and how close that agent is.</li>
                <li>Whether the nearby agent has more or less energy.</li>
                <li>How crowded the local area is.</li>
                <li>Recent damage, number of children, and aggression bias.</li>
              </ul>
            </div>
            <div>
              <p className="help-section-label">Neural network outputs</p>
              <ul>
                <li><strong>Move X / Move Y:</strong> which direction to move.</li>
                <li><strong>Attack:</strong> whether to attack a nearby agent.</li>
                <li><strong>Eat:</strong> how strongly to take food when close enough.</li>
                <li><strong>Reproduce:</strong> whether to try creating a child.</li>
                <li><strong>Rest:</strong> whether to suppress movement and conserve energy.</li>
              </ul>
            </div>
          </div>
          <div className="help-callout">
            <p>
              <strong>Bias</strong> is a built-in lean a neuron has before it looks at the world. A positive
              bias makes that neuron easier to activate; a negative bias makes it harder. Bias does not change
              while an agent is alive. It can only drift when a child is born.
            </p>
            <p>
              <strong>Weight norm</strong> is a rough size score for the network&apos;s weights. Larger values usually
              mean stronger reactions; smaller values usually mean gentler reactions. It does not say whether the
              behavior is good or bad by itself, and it is not a trait the agent carries. It is a summary calculated
              from the surviving lineage&apos;s neural network.
            </p>
          </div>
        </article>

        <article className="panel help-panel help-panel-wide">
          <div className="panel-title">How Attributes Shape Behavior</div>
          <p>
            <strong>The neural network chooses intent. Attributes change what that intent means in the world.</strong>
          </p>
          <div className="help-columns">
            <div>
              <p className="help-section-label">Attributes that affect decisions</p>
              <ul>
                <li><strong>Food Focus:</strong> strengthens the food-direction signal before it reaches the neural network.</li>
                <li><strong>Aggression:</strong> is included as an input and is also added to the attack output.</li>
                <li><strong>Energy, health, age, damage, and children:</strong> are sensed by the network each tick.</li>
              </ul>
            </div>
            <div>
              <p className="help-section-label">Attributes that affect outcomes</p>
              <ul>
                <li><strong>Speed:</strong> changes how far movement output carries the agent.</li>
                <li><strong>Attack Power and Attack Range:</strong> change whether attacks land and how much damage they do.</li>
                <li><strong>Metabolism:</strong> drains energy every tick, which changes survival pressure.</li>
                <li><strong>Reproduction Threshold:</strong> sets how much energy is needed before birth is possible.</li>
                <li><strong>Mutation Rate:</strong> affects how much traits and neural weights can drift in children.</li>
              </ul>
            </div>
          </div>
          <div className="help-callout">
            <p>
              <strong>Lineages do not currently start with separate trait presets.</strong> Founding agents all draw from
              the same starting trait ranges, but each individual draw is random. Over time, mutation and survival can
              make one lineage&apos;s average traits drift away from another&apos;s.
            </p>
          </div>
        </article>

        <article className="panel help-panel help-panel-wide">
          <div className="panel-title">How Mutation Works</div>
          <p>
            <strong>Children are similar to their parent, but not always identical.</strong>
          </p>
          <ul>
            <li>When an agent reproduces, the child inherits the parent&apos;s traits and neural network.</li>
            <li>Small random changes can be applied during birth.</li>
            <li>
              Mutations can change Speed, Attack Power, Attack Range, Metabolism, Food Focus,
              Aggression, Reproduction Threshold, and Mutation Rate.
            </li>
          </ul>
          <p>
            <strong>Mutation can also change neural-network weights and biases.</strong> These do not learn during
            an agent&apos;s life. They are copied from parent to child, then small random changes may happen at birth.
            Over many generations, surviving lineages may drift toward different weights, biases, and behaviors.
          </p>
        </article>

        <article className="panel help-panel">
          <div className="panel-title">Why Attributes Change</div>
          <p>
            <strong>Attributes change because survival filters variation.</strong>
          </p>
          <ul>
            <li>A faster agent may reach food sooner, but may also spend more energy.</li>
            <li>A high Food Focus agent may react more strongly to nearby food.</li>
            <li>A high Metabolism agent may need more food to stay alive.</li>
            <li>A more aggressive agent may win fights, but fighting costs energy.</li>
            <li>Traits spread only if their owners live long enough to reproduce.</li>
          </ul>
        </article>

        <article className="panel help-panel">
          <div className="panel-title">Live vs Batch</div>
          <p>
            <strong>Live shows one world. Batch compares many worlds.</strong>
          </p>
          <ul>
            <li><strong>Live:</strong> watch one simulation unfold on screen.</li>
            <li><strong>Batch:</strong> run many simulations in the backend and compare outcomes.</li>
            <li>
              Batch helps show whether similar lineages and neural networks survive repeatedly,
              or whether different starting conditions lead to different survivors.
            </li>
          </ul>
        </article>
      </section>
    </main>
  );
}
