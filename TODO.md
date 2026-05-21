  1. Random Baseline Agents
  Add non-learning food spawners that act randomly but obey the same costs, horizons, cooldowns, and population rules.

  Why: without this, we cannot tell whether evolved spawners are better than chance.

  Success metric:

  - evolved agents produce lower rolling loss, higher net payoff, or better survival than random agents across many seeds.

  2. Heuristic Baseline Agents
  Add simple hand-coded strategies:

  - momentum spawner: long after recent upward movement, short after downward movement
  - mean-reversion spawner: long after sharp drops, short after sharp rises
  - volatility filter: only spawn when recent volatility is above/below a threshold
  - random-direction but timing-aware spawner

  Why: random is too weak a benchmark. We need to know whether evolution beats simple rules.

  3. Batch Mode For Toy Market Simulator
  Like the ant world batch runner, run hundreds/thousands of market-spawner simulations headlessly.

  Outputs should include:

  - final population
  - cumulative net payoff
  - rolling loss distribution
  - survival rate
  - lineage count
  - average payoff per marker
  - hit rate
  - average strength/horizon/cooldown
  - surviving genome summaries

  Why: single runs are visually useful but statistically weak.

  4. Regime Generalization Tests
  Train/evolve on one generator setting, then test descendants on different settings:

  - higher noise
  - lower noise
  - positive trend
  - negative trend
  - choppy mean-reverting regime
  - momentum regime
  - regime shifts

  Why: this tests whether agents learned something general or overfit one generator.

  5. Hide More Simulator Truth
  We already removed direct generator amplitude/frequency/slope inputs. Next, make sure all future features are either:

  - observable directly from the chart, or
  - estimated from recent history

  No hidden state should reach agents unless we are deliberately testing privileged-information behavior.

  6. Add The Second Layer: Eating Agents
  This is the big conceptual next step.

  Food-spawners only propose opportunities. Ant-like trader agents decide whether to “eat” them.

  Spawner reward should eventually depend on whether trader agents benefit from its food, not just whether the raw marker payoff was good. That
  makes the ecology more realistic:

  - spawners compete to generate useful opportunities
  - traders compete to select good opportunities
  - bad spawners may be ignored even if they produce many markers
  - traders can evolve trust/distrust toward lineages

  7. Add Market Price From ROC
  Right now ROC is the displayed signal. Eventually we should generate price from it:

  - ROC / return signal
  - cumulative price path derived from returns
  - food markers shown on ROC and price
  - rewards based on realized return over horizon

  That gets visually and conceptually closer to real markets.

  8. Add Costs And Risk More Explicitly
  Trading realism needs:

  - transaction cost
  - slippage
  - position sizing
  - max exposure
  - stop-loss / take-profit equivalents
  - delayed execution
  - limited capital
  - drawdown penalty

  Otherwise agents can exploit unrealistic payoff mechanics.

  9. Add Statistical Comparison Views
  For hypotheses, we need charts like:

  - evolved vs random payoff distribution
  - evolved vs heuristic rolling loss
  - survival by architecture
  - payoff by regime
  - generalization matrix: trained-on regime vs tested-on regime
  - lineage convergence: do successful spawners end up with similar weights/behavior?

  The strongest next build, in my view: Toy Market Batch Runner + Random/Heuristic Baselines.
