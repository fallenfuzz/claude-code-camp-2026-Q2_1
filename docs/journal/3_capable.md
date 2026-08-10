# Week 3 Technical Documentation

## Technical Goal

Make the agent capable of a hard game goal on a small model: find and kill
the Massive Minotaur, a strong monster somewhere in the unexplored game
world, efficiently in steps and cost. Week 2 made the agent observable.
Week 3 uses that instrument to find out why missions fail and to build the
knowledge and machinery that make them succeed.

The design premise, argued before any evidence: a hard goal handed to a
fresh model is a failure before the mission starts. The game has survival
rules a language model cannot know from the goal text alone. Characters
tire after too many moves and must rest. Dark areas blind the player
without a light source. Some monsters attack on sight. Health, hunger,
thirst, equipment, and experience level all gate what is survivable. The
plan is therefore knowledge first: facts the agent earns by playing, rules
we author for it, and deterministic machinery (route planning, survival
reflexes, a preparation planner) that spends the model's attention only on
judgment. The full design is in
[the knowledge plan](../plans/week3_capable/knowledge.md).

## Technical Uncertainty

- I do not know whether a small model can complete this mission at all,
  even with good knowledge. The binding constraint could be model judgment
  rather than missing facts.
- I do not know which failure actually dominates: not knowing where the
  target is, dying to game mechanics, or burning the budget on wandering.
  Guessing wrong would spend the week building the wrong capability first.
- Moving decisions out of the model and into deterministic code risks
  hiding failures instead of fixing them, if the machinery is wrong.

## Technical Hypotheses

- Repeated identical attempts will fail in a stable, measurable pattern,
  and that pattern will rank the capabilities to build better than any
  design argument.
- Most of the budget will be lost to navigation and wandering, not to
  wrong decisions at genuine choice points.
- Survival mechanics (exhaustion, darkness, aggressive monsters, hunger)
  will fire inside even short runs, without the agent understanding them.
- Knowledge retained across runs will make repeat missions measurably
  cheaper, which is the claim the week should end by proving or refuting.

## Technical Observations
### 1. Thirteen cold missions, zero sightings: the autopsy ranked the work

Before building anything we ran the mission as-is, repeatedly, to let
recorded failures choose the build order. Method: the benchmark launches
the unmodified agent with the goal "Find the minotaur and kill it.", no
location hint, on the small model already in use. Every attempt is cold:
the player is reset to the temple at level 1 with baseline memory, and a
verified reset receipt is retained before the first model call. Each
attempt is capped at eight minutes of wall clock and about twenty cents of
model spend. Success is judged only from game evidence (the monster's
death message), never from the agent's own claim.

Thirteen attempts completed, costing $2.84 in total.

- No attempt ever saw the minotaur. Roughly 1,150 model calls produced
  zero sightings of the target. Every attempt spent its entire budget
  wandering, which confirms that locating the goal is its own problem, not
  a detail of movement.
- Darkness was the dominant hazard by an order of magnitude: 79 retained
  "it is pitch black" observations. The agent walks into dark areas it
  cannot perceive, keeps acting blindly inside them, and does not leave.
  In the design's failure inventory darkness was one hazard among many.
  The evidence promoted it to second place.
- Aggressive monsters attacked 12 times and killed the agent 3 times.
  The agent fled 4 times, so escape happens, but not by policy.
- Movement exhaustion rejected commands 6 times, and hunger and thirst
  appeared even within eight-minute runs.
- Attempt cost was stable near the ceiling (about $0.22, roughly 90 model
  calls) with two shorter self-ended runs, so the failure pattern is
  consistent rather than noisy.

One methodological result stands on its own: the observability stack paid
for itself here. A live map defect surfaced during the first manual
mission (the layout crashed on a world shape only deep exploration
produces), was reproduced from the retained session payload, fixed, and
pinned by a regression test, all while the mission kept running.

The consequence for the plan: build the locate machinery first, darkness
handling second, then the rest and flee reflexes. Combat interrupts
matter, but nothing else matters while every dollar goes to blind
wandering.

### 2. The before and after: fewer decisions, no deaths, a map that compounds

With credits restored, the same mission ran as three measured cohorts
against the retained thirteen-attempt baseline, all under the same reset
and the same evidence-based judge.

- Cold, all capabilities on, eleven attempts: 28.5 model calls per
  attempt against the baseline's 86.3, a 67% reduction, and the spread
  collapsed from ±21.4 calls to ±0.5. Deterministic routines made
  attempts nearly identical where the baseline was noise. Zero deaths
  against three, and none of the baseline's hazard signatures (79
  darkness lines, 12 attacks, 6 exhaustion rejections) appeared at all.
  Two caveats stated: the per-attempt cost ceilings differed slightly,
  and bounded sweeps may avoid hazards partly by staying nearer safe
  ground.
- The tool mix explains the reduction: a capable attempt issues sweep
  routines and reads its state summary, with zero single-step move
  calls. The model spends its calls deciding, not walking.
- Warm, knowledge retained across five runs: call counts stay flat at
  the spend ceiling, but coverage compounds. The persistent map grew to
  235 distinct rooms where a cold attempt maps about 35, and every run
  pushed into new ground.
- The minotaur was never sighted in any cohort. The world is larger
  than the explored radius under these budgets, so the mission itself
  remains open. The honest claim is efficiency, survival, and compound
  coverage, not victory.

### 3. Reading the transcripts overturned the night's story

The batch numbers were reported before any transcript was read. Opening
one attempt's full log, message by message, changed the account.

- The mission-phase line the model received on every call was broken: a
  wiring fault fed it the wrong JSON layer, so every readiness field read
  "None" and the line always said "sweep them". The phase machinery's
  entire runtime effect was a constant instruction to explore.
- The required end-of-response state line was ignored on 27 of 27
  iterations even though the contract was verifiably in the prompt. The
  cause is structural: responses that call tools carry little or no
  text, so demanding a text line on every response fights the tool
  mechanism itself. The idea needs a different carrier, not a retry.
- A sweep died after four steps because the character was resting and
  the game refused to move it ("You feel too relaxed to do that"). The
  routine never checks posture before walking. Two earlier explanations
  for this stop were wrong until the journal was read.
- The model's own thoughts are 27 near-identical repetitions of
  "continue sweeping to find the minotaur". Nothing it ever saw
  mentioned its level, equipment, skills, or gold, so no other thought
  was possible.

The deeper findings are about the knowledge design itself. The store
holds only the structural skeleton of what the parser sees: room names,
exits, connections, creature and object names, own vitals. Everything
qualitative stays in the raw logs and never becomes knowledge: what
shops sell, what signs say, darkness, appraisals of monsters, doors and
keys. And the model has no way to read even the stored part: its only
window is a four-line count summary. Exploration reports pure geometry,
so the model cannot steer toward promising areas or notice a shop, a
corpse, or the target itself passing by. A swept-past minotaur would
have been recorded silently and never announced. The week 0 play skill,
with a plain text memory read before every action and a page of common
sense rules, understood the game better than this machinery does.

The call-count collapse from observation 3 stands as measured, but its
meaning shrinks: it measures cheap walking, not competent play. The
capability that matters, playing the game, was not built: no readiness
against a target, no preparation, no economy loop reached, no strategy.

### 4. The map that compounded was 235 copies of a small neighbourhood

Observation 3 reported that warm runs accumulated 235 rooms while a cold
run mapped about 35, and called it knowledge compounding. Checking that
number against the store before building anything on top of it showed
what it actually counts.

Every room the agent enters is recorded under an identity minted from
the session it was seen in. Enter the Armory in sixteen different runs
and the store holds sixteen unrelated rooms that happen to share a
title. Counting the main store: 478 room identities, 114 distinct
titles, 588 links between rooms, and not one link that crosses a
session boundary. Main Street exists thirty-four times.

So the map never joins. Five warm runs do not build one larger map, they
build five disconnected partial copies of the same small area, and the
frontier arithmetic that decides where to explore next counts the
unexplored exits of copies. Coverage, re-treading, and travelling to a
room by name are all undefined until a room means one thing.

The fix looked easy and was not. Matching rooms by title alone would
merge half the map, including a forest maze whose seven rooms share a
title, an exit list, and a description, and differ only in where their
exits lead. Merging them would invent doors that do not exist. A first
rule that refused to merge anything seen twice in one session failed
against the same store for the opposite reason: the position tracker
re-mints a room whenever it loses track of where it is, so Temple Square
and Market Square already appear several times inside a single run, and
refusing those merges splits precisely the hub rooms every route passes
through.

What survived is a rule that proposes matches by title, exits, and
description, then lets the graph decide: two candidates join only when
no exit contradicts, and preferably when a shared exit agrees. Because
no link crosses a session yet, agreement between two rooms can only be
defined through the matching being computed, so the resolver has to
iterate until it stops changing. Two readings of an earlier draft that
missed this produced 348 rooms and 288 rooms from identical data, which
is why the plan now carries predicates and a measurement script instead
of a headline number.

The wider lesson is the same one as observation 4, one level deeper. The
earlier number was not wrong because the measurement was careless. It
was wrong because nobody asked what the thing being counted was.

### 5. The room description was recording the moment, not the place

Room identity was missing joins it should have made, and the reason was
not the rule. A room's stored description was carrying whatever happened
to be in the room when it was looked at.

The parser treated every line it could not classify as part of the
description. A creature whose line it did not recognise, an item lying
on the floor, a combat message arriving mid-look, all became part of
what the room supposedly is. So the Dark Alley At The Levee had two
descriptions across two visits, differing by a fled combat line, and the
resolver correctly concluded they were different rooms. Measured cost:
27 pairs of places falsely proven different, and 188 pairs the game's own
room numbers say are the same held apart.

The fix is structural rather than another pattern to match. This game
prints a room as title, description, exits, then whatever is present. The
description therefore ends at the exits line, and everything after it
belongs to the moment. One flag in the parser.

It does not repair what is already recorded, since those descriptions
were stored with the pollution in them, so the measured recall on the
existing store is unchanged. It changes what every future run records,
and the recorded past can only be repaired by replaying the journals,
which is its own step.

The rule that came out of it merges only pairs that are truly the same
room, and catches 43 percent of them. The wiring taught more than the
rule did. Computing identity when a run starts joins everything earlier
runs saw, but every room this run enters is named fresh, so the agent
always stands in a place the joined map does not contain, and asking to
walk to a room known from yesterday returned unreachable every time.
Identity has to be computed where the map is built, not read from what
was written down, which makes the stored record a report and the live
computation the thing the agent walks.

### 6. Facts that were written where nobody was reading

Three facts landed this round, and each of them was written to the wrong
place, in a different way.

Cleaning the room description moved combat prose out of what a room is,
which was the point, but it moved it into the list of creatures present.
So the agent would have remembered "You flee head over heels" as
something living in the alley, and said so when asked what it had seen.
The line had stopped corrupting the map and started corrupting the
memory instead. Anything after the exits that looks like neither a
creature nor an object is now filed as something that happened.

The refusal fact was written against the joined room and read against
the observed place, so the one reader written for it never found it, and
worse, it would have orphaned every time identity was recomputed. Then
the claim that walking the way later replaced the refusal turned out to
be a sentence in a docstring: the successful walk wrote a different
predicate entirely, so a door found shut stayed shut in memory for good.
Chasing that produced the better idea. The store keeps a changed value as
a contradiction worth preserving, which is right for what was learned and
wrong for a door. Whether a way is open is how it stands now, so it
belongs with the other things that are true at the moment, where a newer
reading simply replaces an older one.

The third was the most dangerous, because it wrote confident nonsense. A
character that had just rested, or been knocked down, would fail to move
and have a permanent shut door recorded on a perfectly walkable exit. The
fix came from the contract we had already written for darkness: a way
that refuses costs nothing. Paying movement and arriving nowhere is
something else entirely, and when the cost cannot be established,
nothing is claimed at all.

The pattern across all three is one thing. Recording a fact and reading
it are two halves of the same feature, and I keep landing the first and
calling it done.

### 7. The agent was told what it could see, and it stopped wandering

Until this run the agent was handed a goal and a set of tools and left to
work out its situation from whatever the last command printed. Watching
it, the behaviour was always the same: it walked. Of 143 decisions in one
earlier run, 109 were a move. It never fought anything, never bought
anything, never consulted what it had already learned.

The idea was to put a short description of the situation in front of it
before every decision: the room and how often it had been there, each way
out and whether that way had been walked, what was standing in the room,
its own health and money and whether it was hungry, how much of the world
it had mapped, and anything it had noted itself. Written fresh each time,
never accumulated, so it can never describe a moment that has passed.

The first run with it reads differently from every run before it. Moves
fell from three quarters of all actions to about a third. It sized up a
creature before fighting, attacked, and fled when the fight turned. It
bought, it ate, and it asked itself what it already knew. None of those
had happened once in any earlier run. The world it had mapped grew from
eight rooms to eighteen.

It also failed, in a way worth keeping. Every one of the thirty eight
descriptions ended with the same two lines: you are hungry, you are
thirsty, and nothing recovers while that lasts. True, and useless. The
character had no money and nothing to eat, so there was no action that
would clear either line. The agent spent the run trying anyway, and its
last three thoughts are almost word for word the same sentence about
being stuck. It never looked for the guild it had been sent to find.

Advice that cannot be acted on is not advice, and repeating it thirty
eight times does not make it truer. What the description needs is a sense
of what the agent can actually do about what it is being told.

The second failure was in the bill. The run cost twenty nine times more
per decision than the one before it, and ended by hitting its money
ceiling after thirty seven decisions rather than running out of steps.
The cause is that the model provider charges much less for a request
whose opening is identical to the last one, and the description, being
different every time, was placed at the very end where the reuse marker
sits. Every request therefore looked new. The fix is to move the marker
to the last part that does not change, and the lesson is that where you
put something in a request is a cost decision as much as an attention
one.

### 8. The world the agent can walk is a seventh of the world

Every run starts in the temple at the centre of the main city. Walking
outward from it through the exits the world actually has reaches 1,865
rooms in 33 areas. The world has 12,700 rooms in 189 areas. The rest is
reached by ship, by portal, by being carried, or not at all. This matters
because we had been judging how much of the world the agent had explored
against the larger number, which was quietly telling us it had seen
almost nothing when the part it can walk to is about a seventh of what we
were counting.

Fresh evidence that observation 9 is still live: in one session the agent
knew six rooms, and one of them we could not match to any room in the
game's own files. Knowledge we cannot tie to a place in the world is
knowledge the agent cannot route with, cannot return to, and cannot carry
into the next run.

### 9. The knowledge we added made the agent worse at an easy errand

We turned the five capabilities into an experiment: six arms on one mission,
three attempts each, every attempt playing a character the game had never
seen so that nothing could carry over between them. The mission was to find
the bakery and read its menu, judged from the game's own output.

The agent with nothing switched on solved it in 16.7 model calls. The agent
carrying the situation summary we built for it took 38.5, cost four and a
half times as much, and was the only arm that failed an attempt at all,
running to its money ceiling after 103 calls. Adding route planning on top
made it worse again, at 51.3.

Reading the transcripts showed why, and it was not the price of the text.
The summary ends with a line counting how much of the map is known and how
many ways out have not been walked. That count grew for the whole run: one
room and one unwalked way at the start, then ten and eight, then forty and
thirty two, finishing at fifty five rooms with thirty four ways still open.
Every room entered opened more doors than it closed, so the only line
reporting progress never came close to finished and always asked for more
walking.

The agent answered it, once per turn, in its own words: "Thank you for the
state update. I'm on Elm Street with 56 movement points and 28 unexplored
exits across 34 rooms." Ninety three percent of everything it did was
walking. The errand had quietly become covering the map.

The run without the summary took eight calls, and did it by reading what the
game itself wrote on the walls: "I can see there's a market square to the
south. The bakery might be there", and two rooms later, "The description says
the bakery is to the north."

Reading the failure closely matters here, because it is easy to blame the
wrong thing. That run reached the market square on its fourth decision, and
the shop lay west while it went east. That first wrong turn is ordinary
variance and the summary had nothing to do with it. Another run carrying the
same summary finished in eight calls, like the one without. What the summary
did was decide what happened next. Instead of coming back to the street it
had been on, the agent spent another ninety decisions enlarging the map, and
never once tried to look at anything or ask a shopkeeper for a list, which is
the only evidence the errand is judged on.

The game's own directions were never taken away, and saying they were would
be too strong. They sat in the same conversation the whole time. What we
added was a second instruction that competed with them, and a progress bar
that only ever counts up is a very insistent one. Survival came out best on paper at 15.3 calls, but the
per-attempt spread overlapped the control completely and nothing died in any
arm, so the reflex it exists for never fired. At three attempts that is an
observation and not a result.

The lesson is about the shape of the evidence rather than the numbers. A
capability is not good or bad on its own, it is good or bad for a problem,
and we had been measuring ones built for a long hunt against an errand with
none of the hunt's difficulty. The honest conclusion is not that the
knowledge work is wrong. It is that this mission cannot rank it, and that
anything which helps a lost agent looks like pure overhead to one that is not
lost. The measurements are in
[the capability matrix report](../reports/week3_capability_matrix.md).

### 10. The week we built more knowledge, and the week nothing needed it

The mission this week exists to solve was solved once already, in week 0,
before any of this machinery was written. That run found the monster and
killed it. Setting the two side by side is the most useful thing the
measurements produced, because the difference is not how much the agent knew.

The early version kept two memory files and gave the model a way to search
them, a plan with steps the code could check for itself (be level seven, be
carrying a light), and a short list of recent events. When the model wanted
something it asked for it. Everything else stayed out of the way.

The version we built this week pushes a summary of the situation in front of
the model before every decision and keeps the entire conversation besides. In
the runs measured here, nothing was ever compacted, so a room description read
on the fourth decision was still being resent on the hundredth. Two thirds of
what the model was reading by the end was old ground and its own earlier
remarks.

That is the finding, and it is not what we expected to find. We spent the week
adding information on the assumption that the agent failed for want of it. The
transcripts say it failed for want of attention. On the errand, an agent given
the summary walked four times as far as one given nothing and did worse, and
the one line it kept answering was a count of unexplored exits that grows all
run and never finishes. On the coverage mission, the arm with every capability
enabled covered the least ground per step of any arm.

Two qualifications keep this honest. The early success was not a cold start:
the character was already level seven with a map of 163 rooms, it had died
twice getting there, and the location of the target was supplied by a human
rather than discovered. So it shows that the model can prepare, travel and
fight when the few facts that matter are in front of it. It does not show that
it can find the target alone.

The lesson we would act on with more time is to stop measuring how much the
agent is told and start measuring how much of what it is told bears on the
next decision. A working set of a dozen lines, the mission, the phase, what
would end the phase, where the agent is, what it just did and what came of it,
with everything else available on request. The measurements in
[the capability matrix report](../reports/week3_capability_matrix.md) are what
turned that from an opinion into a conclusion.

## Technical Conclusions

- Repeated identical attempts did fail in a stable pattern, and that
  pattern ranked the build order better than argument: confirmed.
- Most of the budget was lost to navigation, not decisions: confirmed,
  and moving navigation into deterministic routines removed two thirds
  of all model calls.
- Survival mechanics fired inside short runs without the agent
  understanding them: confirmed at baseline, and the reflex layer plus
  bounded routines reduced observed hazard events to zero in the
  measured cohorts, with the safer-ground caveat retained.
- Knowledge retained across runs makes repeat missions cheaper:
  refuted for the knowledge we built. Measured against a control on the
  same errand, the situation summary cost 2.3 times the calls and 4.7
  times the money, and was the only arm that failed to finish. Coverage
  does compound across runs, but nothing yet turns that into a cheaper
  mission.
- Moving decisions into deterministic machinery risks hiding failures
  instead of fixing them: confirmed the hard way. Aggregate numbers
  looked like progress while the transcripts showed a blind explorer
  driven by a broken instruction. Machinery without transcript-level
  verification, and without a success metric tied to the actual game
  goal, optimizes the wrong thing efficiently.
- Room identity is a prerequisite nobody planned for. Knowledge that
  cannot be joined across runs is not memory, and the compounding-map
  result was an artifact of counting identities instead of rooms.
- Open: the knowledge contract needs a revision before more capability
  work: completeness (qualitative observations must become facts),
  access (the model must be able to read what it knows), and feedback
  (exploration must return experience, not geometry). The game strategy
  layer that week 0 held in prose has no carrier yet.

## Key Takeaway

We spent the week adding what the agent knows, and the measurements say
it was failing for want of attention rather than information: the same
summary that helped a lost agent made a found one walk four times as far
for nothing.
