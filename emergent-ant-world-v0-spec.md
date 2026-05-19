# v0 Spec: Emergent Ant World

## 1. Product Goal

Build a shared public simulation where users can passively watch tiny neural-network agents survive, reproduce, mutate, attack, and form lineages.

The emotional target is:

> “I wonder what will happen next.”

The viewer should see individual creatures, not abstract population blobs. In 10 minutes, a viewer should be able to witness meaningful evolutionary turnover: at least ~20 generations in active lineages.

---

## 2. Core Concept

A persistent 2D world contains:

```text
food
agents
energy
attacks
death
asexual reproduction
mutation
lineage history
```

Each agent has a tiny neural-net brain. It senses its local environment and chooses an action every tick.

No LLMs in the simulation loop. No explicit RL training. No reward function updates.

The world selects through survival:

```text
good behavior → more food / less death → more reproduction
bad behavior → starvation / attack / extinction
```

---

## 3. Agent Model

Each agent has:

```ts
Agent {
  id
  lineageId
  parentId
  generation
  position
  velocity
  energy
  age
  health
  brain
  genome
  color
}
```

The **genome** stores inherited traits:

```ts
Genome {
  speed
  attackPower
  attackRange
  metabolism
  foodSensitivity
  aggressionBias
  reproductionThreshold
  mutationRate
  brainWeights
}
```

The **brain** is a tiny feed-forward neural net.

Recommended v0:

```text
inputs: 10–20 values
hidden layer: 8–16 neurons
outputs: 5–7 actions
```

Inputs could include:

```text
own energy
own health
age
food direction x/y
nearest agent direction x/y
nearest agent distance
nearest agent relative energy
local crowding
recent damage taken
```

Outputs:

```text
move x
move y
attack
eat
reproduce
rest
```

The highest output, or a weighted interpretation of outputs, determines the action.

---

## 4. Mutation

When an agent reproduces, its child inherits the parent genome with small random changes.

```ts
child.genome.speed += randomGaussian(0, mutationScale)
child.genome.attackPower += randomGaussian(0, mutationScale)
child.genome.metabolism += randomGaussian(0, mutationScale)

for each weight in child.brainWeights:
  weight += randomGaussian(0, mutationRate)
```

This is the core evolutionary mechanism.

There is no “changed reward function.” The environment is the reward function.

---

## 5. Reproduction

Asexual reproduction only.

An agent can reproduce when:

```text
energy >= reproductionThreshold
age >= minimumReproductionAge
cooldown expired
```

Reproduction cost:

```text
parent loses 40–60% energy
child spawns nearby
child generation = parent generation + 1
child lineageId = parent lineageId
```

To hit the 10-minute goal, tune the system so successful lineages reproduce roughly every 20–30 seconds.

---

## 6. Combat

Combat should exist in v0, but be simple.

An agent can attack if:

```text
nearest target within attackRange
attack output exceeds threshold
energy is sufficient
```

Attack result:

```text
target health decreases
attacker spends energy
if target dies, attacker may gain partial energy
```

Important balance rule:

> Fighting must be useful sometimes, but not always optimal.

So attacks should be costly. Otherwise the world becomes a pure deathmatch instead of an ecosystem.

---

## 7. Food System

Food spawns continuously in the world.

Start simple:

```text
food grows in patches
food respawns over time
food gives energy when consumed
food patches can become depleted
```

Food should not be evenly distributed. Uneven food creates territory, migration, clustering, and conflict.

---

## 8. World Loop

Core simulation loop:

```ts
while running:
  growFood()
  for each agent:
    inputs = sense(agent, world)
    outputs = brain.forward(inputs)
    action = interpret(outputs)
    applyAction(agent, action, world)
    spendMetabolism(agent)
    checkReproduction(agent)
    checkDeath(agent)
  recordLineageEvents()
  persistSnapshotPeriodically()
  render()
```

The simulation core should be separate from the renderer.

That matters because later you may want:

```text
browser rendering
server-authoritative simulation
replay mode
faster-than-real-time simulations
multiple worlds
offline experiments
LLM narrator
user interventions
```

---

## 9. Persistence

Persist:

```text
world state
agent state
lineage state
mutations
birth/death events
generation counts
major extinction events
```

Minimum data model:

```ts
WorldSnapshot {
  timestamp
  tick
  agents
  food
  lineages
}

Lineage {
  id
  founderAgentId
  color
  birthTick
  currentPopulation
  maxPopulation
  maxGeneration
  totalBorn
  totalKilled
  totalFoodConsumed
  extinctAt?
}

BirthEvent {
  tick
  parentId
  childId
  lineageId
  generation
  mutationSummary
}

DeathEvent {
  tick
  agentId
  lineageId
  cause: "starvation" | "attack" | "age"
  killedBy?
}
```

---

## 10. Architecture

Recommended structure:

```text
/sim
  world.ts
  agent.ts
  brain.ts
  genome.ts
  mutation.ts
  combat.ts
  food.ts
  lineage.ts
  events.ts

/render
  canvasRenderer.ts
  camera.ts
  overlays.ts

/server
  simulationRunner.ts
  snapshotStore.ts
  websocket.ts

/client
  worldView.tsx
  agentInspector.tsx
  lineagePanel.tsx
```

The important principle:

> The simulation should not know React exists.

Keep the simulation deterministic where possible:

```text
same seed + same initial state = same world
```

That will help debugging, replay, and future benchmarking.

---

## 11. Viewer UI

The v0 UI should have:

```text
main canvas
current tick/time
population count
top lineages
selected agent inspector
generation number
energy/health
parent/child info
```

When a user clicks an agent, they should see:

```text
Agent #4831
Lineage: Blue-7
Generation: 14
Age: 22s
Energy: 83
Health: 64
Kills: 2
Children: 3
Mutation: higher aggression, lower metabolism
```

This is what makes the simulation emotionally legible.

---

## 12. Success Criteria

v0 is working if:

```text
1. Agents move, eat, attack, reproduce, mutate, and die.
2. At least some lineages survive 20+ generations within 10 minutes.
3. Different lineages visibly diverge.
4. Some behaviors appear surprising to the viewer.
5. The world can run continuously without manual reset.
6. A user can click an agent and understand its ancestry.
7. The architecture can later support narration, user interventions, and multiple worlds.
```

The most important build principle:

> Make the world simple, but make the consequences visible.

That is where the “I need to see what happens next” feeling will come from.
