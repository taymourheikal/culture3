# Emergent Ant World Experience

Emergent Ant World is a live evolutionary simulation. The screen shows a small ecosystem of colored agents moving through uneven food patches, eating, reproducing, mutating, fighting, and dying. The main feeling should be simple: watch for a few minutes and wonder which lineages will survive.

## What You See

The main canvas is the world. Small colored triangular agents move across it. Green dots are food. Faint green regions are food-rich patches. Each agent belongs to a lineage, shown by color.

The bottom-left status strip shows:

- current tick
- elapsed simulation time
- live population
- available food
- highest generation reached

The simulation starts immediately and runs locally in the browser.

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

Each agent has a small neural network. It senses its own state, nearby food, nearby agents, crowding, recent damage, and lineage traits. The network outputs movement, attack intent, eating intensity, reproduction tendency, and rest.

There is no explicit reward score and no training loop. Agents do not learn during their lifetime. Evolution happens through survival: agents that eat, survive, and reproduce pass mutated genomes and neural weights to children.

## Persistence

The local backend stores world snapshots and birth/death events in SQLite while the app is running. This is not a public multiplayer server; it is local persistence for the current machine.

## Current Shape

This is a v0 experience. It is built to make emergence visible first: simple rules, visible consequences, readable lineages, and enough controls to tune the world into interesting behavior.
