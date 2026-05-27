# Emergent Ant World Experience

Emergent Ant World is a local evolutionary simulation. The screen shows a small ecosystem of colored agents moving through uneven food patches, eating, reproducing, mutating, fighting, and dying. The main feeling should be simple: watch for a few minutes and wonder which lineages will survive.

This is an artificial world where agents try to survive. No one gives them a strategy. Behavior emerges from inherited traits, small neural networks, mutation, and the pressure to live long enough to reproduce.

## What You See

The main canvas is the world. Small colored triangular agents move across it. Green dots are food. Faint green regions are food-rich patches. Each agent belongs to a lineage, shown by color.

The bottom-left status strip shows:

- current tick
- elapsed simulation time
- live population
- available food
- highest generation reached

The simulation starts immediately and runs locally in the browser.

## Live And Batch

**Live** shows one world. It is for watching individual movement, ancestry, births, deaths, and lineage competition unfold on screen.

**Batch** compares many worlds. It is for asking whether similar lineages and neural networks survive repeatedly, or whether different starting conditions lead to different survivors.

## Main Controls

At the top of the world view:

- **Pause/Play** stops or resumes the simulation.
- **Speed slider** changes how fast simulated time advances.
- **Reset** starts a new world using the saved defaults.

Resetting does not directly edit the current world. It creates a fresh run with the current saved configuration.

## Overview Tab

The right sidebar opens on **Overview**.

This tab shows persistence status, birth/death event counts, the selected agent inspector, and top lineages. Click any visible agent in the world to inspect it.

The selected agent panel shows:

- agent ID
- lineage
- generation
- age
- energy and health
- kills and children
- parent/founder status
- latest mutation summary

This is the main way to make the simulation emotionally legible: individual agents are not just dots, they have ancestry and consequences.

## Parameters Tab

The **Parameters** tab controls environment and behavior defaults for future worlds.

It includes groups for world size, food, mutation, movement, eating, combat, metabolism, reproduction, lineage colors, and runtime. Each group has its own save button. Saved values are stored locally in the browser and apply on the next reset.

These settings shape the ecosystem. For example, attack thresholds affect how violent the world becomes, food settings affect clustering and migration, and reproduction settings affect generational turnover.

## Agents Tab

The **Agents** tab controls starting lineages and neural-network defaults.

The **Initial lineages** value decides how many starting lineages appear in a new world. Total starter agents are divided evenly across those lineages:

```text
agents per lineage = floor(initial agents / initial lineages)
```

Each lineage has its own neural-network settings:

- activation function
- hidden neuron count
- optional second hidden layer
- second hidden layer neuron count
- initial weight mean
- initial weight standard deviation

Input and output counts are fixed by the simulation contract. The world always supplies the same sensory inputs and expects the same action outputs.

## What Drives the Agents

Each agent has a small neural network. Every tick, the agent senses the world and the network chooses what to do.

The neural network inputs include:

- energy, health, and age
- direction toward nearby food and how close that food is
- direction toward the nearest agent and how close that agent is
- whether the nearby agent has more or less energy
- local crowding
- recent damage, number of children, and aggression bias

The neural network outputs are:

- **Move X / Move Y:** which direction to move
- **Attack:** whether to attack a nearby agent
- **Eat:** how strongly to take food when close enough
- **Reproduce:** whether to try creating a child
- **Rest:** whether to suppress movement and conserve energy

The network chooses intent. The world then decides what actually happens. For example, an attack output only becomes a real attack if the target is close enough, the agent has enough energy, and the agent's aggression clears the attack threshold.

There is no explicit reward score and no training loop. Agents do not learn during their lifetime. Evolution happens through survival: agents that eat, survive, and reproduce pass mutated genomes and neural weights to children.

## How Attributes Shape Behavior

Attributes change what a neural-network decision means in the world.

Some attributes affect the decision directly:

- **Food Focus** strengthens the food-direction signal before it reaches the neural network.
- **Aggression** is included as an input and is also added to the attack output.
- **Energy, health, age, damage, and children** are sensed by the network each tick.

Other attributes affect outcomes:

- **Speed** changes how far movement output carries the agent.
- **Attack Power** and **Attack Range** change whether attacks land and how much damage they do.
- **Metabolism** drains energy every tick, which changes survival pressure.
- **Reproduction Threshold** sets how much energy is needed before birth is possible.
- **Mutation Rate** affects how much traits and neural weights can drift in children.

Lineages do not currently start with separate trait presets. Founding agents all draw from the same starting trait ranges, but each individual draw is random. Over time, mutation and survival can make one lineage's average traits drift away from another's.

## How Mutation Works

Children are similar to their parent, but not always identical. When an agent reproduces, the child inherits the parent's traits and neural network. Small random changes can be applied during birth.

Mutations can change Speed, Attack Power, Attack Range, Metabolism, Food Focus, Aggression, Reproduction Threshold, and Mutation Rate.

Mutation can also change neural-network weights and biases. These do not learn during an agent's life. They are copied from parent to child, then small random changes may happen at birth. Over many generations, surviving lineages may drift toward different weights, biases, and behaviors.

Attributes change because survival filters variation. A faster agent may reach food sooner, but may spend more energy. A high Food Focus agent may react more strongly to nearby food. A high Metabolism agent may need more food to stay alive. A more aggressive agent may win fights, but fighting costs energy. Traits spread only if their owners live long enough to reproduce.

## Bias And Weight Norm

**Bias** is a built-in lean a neuron has before it looks at the world. A positive bias makes that neuron easier to activate; a negative bias makes it harder. Bias does not change while an agent is alive. It can only drift when a child is born.

**Weight norm** is a rough size score for the network's weights. Larger values usually mean stronger reactions; smaller values usually mean gentler reactions. It does not say whether the behavior is good or bad by itself, and it is not a trait the agent carries. It is a summary calculated from the surviving lineage's neural network.

## Persistence

The local backend stores world snapshots and birth/death events in SQLite while the app is running. This is not a public multiplayer server; it is local persistence for the current machine.

## Batch Experiments

The **Batch** tab runs many worlds on the local backend and saves the results. It is for answering a different question than Live: not "what happened in this one world?" but "what tends to happen across many worlds?"

The top of the Batch page controls run count, stop tick, and base seed. Saved batch runs can be loaded later. Once loaded, the page shows aggregate outcomes, run-by-run results, survivor distributions, and selected lineage details.

The weight analysis area helps compare surviving neural networks:

- **Convergence Summary** compares how similar surviving lineages are within the same NN architecture.
- **Pairwise NN Distance** shows how far apart survivor neural weights are.
- **Behavioral Similarity Test** runs survivors through the same fixed situations and compares their action outputs.
- **Clustered Weight Heatmap** groups similar survivor weight patterns visually.

These tools are meant to show whether survivors tend to converge toward similar agents, or whether different successful strategies remain meaningfully different.

## Toy Market Simulator

The Toy Market Simulator is separate from Emergent Ant World. It can play either a generated rate-of-change market signal or BTC/USD candle data, and it shows a population of food-spawner RNNs that try to mark possible long or short opportunities on that signal.

The main chart shows the signal and the opportunity markers. A marker becomes green when the later move would have paid off, and red when it would have lost. The lower charts show noise, changing generator parameters, and the spawner population/loss history.

Toy Market time is measured in **ticks**. In generated mode, one tick is one generated bar. In BTC mode, one tick is one candle. The only seconds-based controls are playback controls such as ticks per second or bars per second.

Food-spawner agents do not trade directly. They are scouts. Each one reads recent market-shape inputs, keeps a small recurrent memory, and decides whether to spawn a long or short opportunity. The RNN also outputs a reproduction probability, horizon ticks, and cooldown ticks. If the spawner has enough energy and the population is below the cap, that probability can create a child. Founders start with a conservative reproduction bias so a new run does not instantly fill to the cap, but that bias can mutate in descendants. Good opportunities give the spawner energy and health. Bad opportunities drain them.

Each spawner also has inherited **perception settings**. The 16 input slots stay fixed, but the tick windows used inside those inputs can vary by agent. One spawner may compare very recent ROC movement, while another may look across a longer window. Children inherit these settings, and mutation can shift them.

Each spawner has an inherited **mutation profile** too. This controls how likely its children are to gain units, change connections, drift weights or biases, mutate perception windows, or change their own mutation profile.

Spawners also have **lifetime learning**. This is not backpropagation. When a marker resolves, the payoff creates a bounded learning signal that nudges temporary learned deltas on the weights and biases involved in that decision. Successful reproduction can also create a positive learning signal. These learned deltas affect the agent's future decisions during life, can fade through experience decay, and are shown separately from the inherited genome. When a spawner reproduces, its current neural learned deltas are folded into the child's inherited neural seed before mutation. The child starts with an empty learned overlay, so it still has to build its own lifetime experience. Only neural deltas fold in; perception settings, horizon/cooldown genes, threshold bias, mutation profile, and plasticity profile remain ordinary inherited and mutated genes.

## Toy Market RNN Inspection

Every live food spawner can be inspected by ID. The roster includes an **Inspect spawner ID** field, so a spawner does not need to be visible in the capped roster to open its RNN. The same live inspection is also available programmatically from the browser console:

```js
await window.inspectFoodSpawner(471)
```

The response includes the spawner's genome, hidden state, gates, weights, active/disabled links, recent payoffs, recent food outcomes, and the current uniqueness score when available.

The visible **Uniqueness** number is a population-relative percentile. It compares the spawner's effective functional RNN against the current living population using a versioned vector of architecture, wiring, effective weights, effective biases, output controls, recurrence, input/output usage, reachable graph structure, perception settings, selected mutation-profile traits, and plasticity-profile traits. Higher means farther from the current population center than more living peers at that comparison tick. Clicking the score shows the raw distance, nearest similar spawners, and the most typical and most unusual vector dimensions. The **Uniqueness population limit** setting controls when automatic uniqueness scoring pauses to protect responsiveness.

## Toy Market Persistence

Toy Market runs can now persist to the local SQLite backend when the server is running. The UI shows **Persistence: online/offline**. If persistence is offline, the simulation and live inspection still work, but historical inspection is unavailable.

SQLite records Toy Market sessions, spawner births, deaths, genome snapshots, lightweight state snapshots, uniqueness snapshots, and food events. Full RNN genomes are saved at meaningful moments such as initial birth and child birth. Periodic state snapshots save changing values like energy, health, hidden state, last action, and payoff stats.

Historical inspection uses a session ID plus spawner ID. This matters because spawner `#471` only identifies one agent inside one Toy Market session. The historical inspector can load a past or dead spawner from SQLite at the latest saved state or at a requested tick. When a requested tick falls between saved state snapshots, the inspector uses the nearest saved state at or before that tick and reports which tick was actually loaded.

## Help Page

The question-mark tab opens a short in-app version of these explanations. It is there for quick reference while running Live or Batch.

## Current Shape

This is a v0 experience. It is built to make emergence visible first: simple rules, visible consequences, readable lineages, and enough controls to tune the world into interesting behavior.
