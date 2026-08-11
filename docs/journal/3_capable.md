# Week 3 Technical Documentation

## Technical Goal

Make the agent capable of a hard game goal on a small model: find and kill the
Massive Minotaur, a strong monster somewhere in an unexplored world, without
spending most of the budget wandering or dying to basic game mechanics.

Week 3 tests three kinds of assistance:

- Survival handles recurring hazards such as exhaustion, darkness, and combat.
- Navigation executes bounded routes and exploration without a model call for
  every movement.
- Knowledge retains what earlier play discovered and presents useful state to
  the model.

The goal is not to enable every feature. It is to measure which assistance
makes the Claude Haiku 4.5 player more successful, cheaper, or safer, and to
understand why.

## Technical Uncertainty

- I do not know whether a small model can complete the Minotaur mission at all.
- I do not know whether location, survival, preparation, or model judgment is
  the binding constraint.
- Deterministic routines may reduce calls while optimizing the wrong behavior.
- More knowledge may improve decisions, or merely add information that competes
  for the model's attention.

## Technical Hypotheses

- Repeated cold attempts will fail in a stable pattern that identifies the
  first capability to build.
- Navigation and wandering will consume more of the budget than genuine choice
  points.
- Survival hazards will appear even in short runs before the model understands
  how to handle them.
- Knowledge retained across attempts will make later missions cheaper.

## Technical Observations

### 1. Thirteen cold Minotaur attempts spent every budget before finding the target

The baseline asked a fresh level-one character to "Find the minotaur and kill
it." No location hint or persistent knowledge was provided. Each attempt began
from a verified temple reset, used the same small model, and stopped after eight
minutes or about twenty cents. Success required a retained game message proving
the Minotaur died. The agent's own claim was not accepted as evidence.

Thirteen attempts cost $2.84 and used roughly 1,150 model calls.

- No attempt saw the Minotaur.
- Darkness appeared 79 times. The agent repeatedly entered areas it could not
  perceive and continued acting there.
- Aggressive monsters attacked 12 times and killed the character 3 times.
- The agent fled 4 times, but had no consistent escape policy.
- Exhaustion rejected movement 6 times. Hunger and thirst also appeared within
  the short attempts.
- An attempt averaged 86.3 model calls, usually ending near its spending limit.

The target-location problem dominated the mission. Combat preparation could
not matter while the agent never reached the monster. The evidence therefore
ranked bounded exploration first, darkness handling second, and the remaining
survival behavior after them.

### 2. Deterministic movement reduced calls, but did not make the agent competent

To test whether model calls were being wasted on individual steps, eleven cold
attempts enabled bounded navigation routines and survival reflexes. Five more
attempts retained their discovered map between runs. These attempts used the
same Minotaur goal and the same game-evidence judge as the baseline.

The cold capable attempts averaged 28.5 model calls, 67 percent fewer than the
baseline's 86.3. Their spread also fell from 21.4 calls to 0.5. No character
died, and none of the baseline's darkness, attack, or exhaustion signatures
appeared. The model used exploration routines instead of requesting every move.

The Minotaur was still never sighted. Reading a full transcript showed why the
call reduction overstated the improvement:

- The mission-status message always instructed the model to keep exploring
  because its readiness fields were not reaching the model correctly.
- A required state line at the end of every response was absent on all 27
  measured iterations. Tool-calling responses often contain no ordinary text,
  so the requirement conflicted with the response mechanism itself.
- The model repeated the same decision, continue sweeping, on almost every
  iteration.
- Exploration reports returned geometry, but omitted useful experience such as
  creatures, shops, objects, area changes, and warning signs passed en route.
- A routine could record the target and continue walking without telling the
  model it had seen it.

The measured improvement was real but narrow. Code made walking cheaper and
more repeatable. It did not supply preparation, strategy, or informed judgment.
An efficient agent can still pursue the wrong activity. The comparison also
used a slightly higher cost ceiling for the capable attempts, so the call
reduction is reported as movement evidence rather than a success comparison.

### 3. A persistent map needs stable room identity before it becomes memory

The five warm attempts appeared to grow one map to 235 rooms, compared with
about 35 rooms in one cold attempt. That looked like knowledge compounding
across runs.

The stored data disproved the interpretation. Room identities contained their
session of origin, so the same physical room became a new record in every run.
The store held 478 identities but only 114 distinct titles. Main Street alone
appeared 34 times, and no connection joined one session's map to another.

Room titles could not safely solve the problem. Several real rooms share the
same title, description, and exits, especially inside mazes. Room descriptions
also contained transient creatures, objects, and combat text, which made the
same place look different on later visits.

The lasting lesson is not the matching algorithm. Persistent world knowledge
requires three different kinds of information:

- Stable place identity, grounded in verified room numbers where available and
  graph consistency where they are not.
- Persistent facts about the place, such as exits, services, and signs.
- Transient facts about the visit, such as a creature present or a fight that
  happened there.

The 235-room result was therefore rejected. Counting stored records without
defining what one record represents can turn duplication into apparent learning.

The denominator also needed a definition. Walking outward from the starting
temple reaches 1,865 rooms in 33 areas, while the complete game contains 12,700
rooms in 189 areas. Ships, portals, scripted transport, and disconnected areas
account for much of the difference. Exploration should be judged against the
world the current agent can reach, not every room in the game files.

### 4. Current state changed behavior only when it supported an available action

An earlier agent received only its goal, tools, and the latest game response.
In one run, 109 of its 143 decisions were movement. It never fought, bought an
item, or consulted prior knowledge.

We then added a short state description before every decision. It included the
current room, exits already walked, visible entities, health, money, hunger,
thirst, and map coverage. The description was regenerated for the current call
and did not accumulate in conversation history.

The first run with this context behaved differently:

- Movement fell from about three quarters of actions to about one third.
- The agent assessed a creature, fought it, and fled when the fight worsened.
- It bought and ate food and queried its stored knowledge.
- The explored map grew from 8 rooms to 18.

The same context also trapped the agent. Every decision repeated that it was
hungry and thirsty, but the character had no money and no food. The agent kept
trying to solve conditions it could not change and abandoned its actual goal.

The request layout caused a second cost. The changing state was placed at the
provider's prompt-reuse boundary, making every request appear new. Cost per
decision increased by a factor of 29 until that boundary was moved back to the
stable prompt.

State earns space in a prompt only when it can change the current decision and
the agent has an available action for it. Truthful but unactionable advice is a
distraction, and prompt placement affects price as well as attention.

### 5. More knowledge made an easy mission slower

The first controlled capability experiment used an easy, evidence-verifiable
mission: a new character had to find the Midgaard bakery and read its menu.
Each of six configurations ran three times with a character the game had never
seen. Every attempt had a $0.30 and 120-iteration limit.

The capabilities had concrete meanings in this experiment:

- Survival enabled automatic game toggles and reflexes for recurring hazards.
- Knowledge added the current-state description and retained world knowledge.
- Navigation advertised bounded sweep and travel routines.

| Configuration | Successes | Mean calls on success | Mean cost |
|---|---:|---:|---:|
| No capabilities | 3/3 | 16.7 | $0.035 |
| Survival | 3/3 | 15.3 | $0.032 |
| Navigation | 3/3 | 18.0 | $0.036 |
| Survival and knowledge | 3/3 | 23.7 | $0.049 |
| Knowledge | 2/3 | 38.5 | $0.165 |
| Survival, knowledge, and navigation | 3/3 | 51.3 | $0.115 |

Zero characters died. Survival therefore had no relevant event to handle, and
the small difference from the control is route variance. The navigation-only
agent never invoked its navigation tools, so that arm measured tool adoption,
not tool quality.

Knowledge produced the clearest result. It used 2.3 times the control's calls,
cost 4.7 times as much, and caused the only censored attempt. In that failure,
the agent made 167 movements across 180 model calls.

The state summary included a global count of mapped rooms and unwalked exits.
Every new room revealed more exits, so the count grew instead of approaching
completion. The agent repeatedly acknowledged that number and converted an
errand into an open-ended coverage mission. The eight-call control instead read
the game's signs and room descriptions and followed them to the bakery.

The experiment does not prove that knowledge is harmful. It proves that a
frontier-heavy summary is harmful when the mission is not exploration. A
capability must be evaluated on the problem it is meant to solve, and global
progress indicators should not compete with the active goal.

Full measurements and per-attempt evidence are in the
[capability matrix report](../reports/week3_capability_matrix.md).

### 6. A controlled coverage mission exposed weak exploration efficiency

Because the bakery mission ended before survival and navigation mattered, a
second experiment asked each configuration to explore as much of Midgaard as
possible. Coverage counted distinct verified room numbers in the city, not
room titles, and movement counted commands actually sent to the game, including
steps executed inside a routine.

| Configuration | Mean Midgaard rooms | Rooms per step | Mean steps | Deaths |
|---|---:|---:|---:|---:|
| Survival | 31.3 | 0.33 | 95 | 1 |
| No capabilities | 28.0 | 0.33 | 86 | 1 |
| Knowledge | 24.3 | 0.29 | 114 | 0 |
| Survival and knowledge | 23.3 | 0.30 | 95 | 0 |
| Survival, knowledge, and navigation | 19.7 | 0.21 | 113 | 1 |
| Navigation | 17.7 | 0.22 | 89 | 1 |

The instruction asked the agent to use 100 movements, but the harness did not
enforce a hard stop at 100. Coverage scoring used only the first 100 movements,
while eleven of eighteen agents stopped before reaching that point and others
continued beyond it. Mean rooms therefore mixes exploration quality with the
model's decision to continue. Rooms per actual step is the fairer comparison.

Survival tied the control at 0.33 rooms per step, so its higher room count came
from walking farther rather than exploring better. Navigation and the fully
stacked configuration were least efficient at 0.22 and 0.21 rooms per step.
One stacked attempt took 148 steps to find 13 rooms and stopped at the cost
limit. Batching movement made it possible to walk hard while learning little.

The result does not establish a best configuration at three attempts. It does
show that route executors need a mission-relevant coverage strategy and a
binding budget. Faster movement alone is not better exploration.

### 7. The decisive difference from the Week 0 success was attention, not volume

The Minotaur had already been killed once during the Week 0 architecture
experiments. That agent used two readable memory files, a searchable world
record, a six-stage plan with verified conditions, and about thirty recent
events. When it needed information, it retrieved it instead of carrying the
whole play history in every request.

The comparison has important limits. The successful character was already
level seven, had mapped 163 rooms, and had died twice while preparing. A human
also supplied the Minotaur's location. The run proves that the small model can
prepare, travel, and fight when the decisive facts are available. It does not
prove that the model can discover those facts from a cold start.

Week 3's agent retained the entire conversation. No Minotaur attempt reached
the configured compaction threshold, so early room descriptions and the
agent's own acknowledgements were still being resent near the end. Across the
capability experiment, the metadata envelope around tool results consumed
27 to 31 percent of accumulated history. In the longest knowledge attempt,
agent prose and the current instruction reached about 37 percent.

The state description itself was short and nonpersistent. Its larger cost was
behavioral: it encouraged four times as much walking, and each extra move added
another result to a history paid for again on every later request.

The next knowledge design should therefore separate three layers:

- An evidence journal retains everything for verification.
- A searchable archive holds durable facts and past experience.
- A small working set contains only the mission, current phase, phase exit
  condition, verified current state, last action and outcome, and relevant
  memories.

The question is no longer how much information the agent can be given. It is
whether each item changes the decision the agent must make now.

### 8. What this project taught

About building an agent:

- Anything put in front of a model becomes an instruction. A coverage count
  meant as a readout became the objective, and the agent walked until its
  budget ran out.
- Attention is scarcer than information. The same summary that helped a lost
  agent made a found one four times slower.
- Automation makes whatever it is pointed at efficient. The best explorer
  built here was the worst at the mission.
- Aggregates cannot show whether an agent understood. Two thirds fewer calls
  and zero deaths described a blind explorer circling one neighbourhood.
- Memory needs identity before it needs volume. Knowledge that cannot be tied
  to the same place across runs is a pile rather than a map.

About building with agents:

Working with LLM harnesses from first principles proved hard to keep in
check, and hard to keep control of the code as it unfolds and grows into a
monster. Leaving the work to agents created a great deal of mess and cost
about five days in total, restarted at different points. It also revealed
that having one model review another's work is crucial for catching
problems, even when both are the same model. Building agents, and keeping
orchestration, evaluation and observability coherent at every level of
detail, is a major challenge. The experience of this project was worth it.

## Technical Conclusions

- Repeated cold attempts produced a stable failure: the target was never seen,
  while wandering and darkness consumed nearly every budget.
- Deterministic movement reduced model calls by 67 percent and removed observed
  hazards in its cohort, but transcript review showed that it automated
  exploration rather than solving the mission.
- Persistent knowledge did not yet compound. Session-scoped room identities
  turned repeated visits into false growth.
- A current-state summary changed the model's behavior, but global frontier and
  unactionable survival advice competed with the mission.
- The knowledge configuration was substantially worse than the control on the
  bakery mission. The coverage mission also found no improvement in exploration
  efficiency from the stacked capabilities.
- The Minotaur remained unsolved from a cold start. Location discovery,
  preparation, and attention are still open problems.

## Key Takeaway

The agent did not fail because it lacked information. It failed because the
right information was not isolated for the current decision, while irrelevant
history and progress signals kept pulling its attention toward more walking.
