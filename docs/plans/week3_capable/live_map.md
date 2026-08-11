# Plan: the map on precomputed positions

Give the map the positions worked out in
[`docs/plans/map_layout.md`](../map_layout.md), computed once for the
whole world and saved, and draw a room exactly the way the approved
mockups draw one. Everything else the map does keeps working.

## Why

The map derives a position for every room on every render, by walking
outward from wherever the agent is standing. Measured on session
`f4af972f`, whose 15 rooms span Midgaard and the Newbie Zone:

- Pressing Reflow on identical evidence moves 4 of the 15 rooms. Same
  evidence, different picture.
- A direction the agent does not know becomes a diagonal. The agent fled
  twice, so three rooms forming a straight corridor are drawn as a
  staircase.

## The positions are computed once, not per run

The world does not change between runs, so neither do the positions. A
build step reads the world files, grows every zone, and writes one file:
room number to zone, level, x and y. Nothing is laid out at runtime.

- The generator lives beside `backend/sources/atlas.py`, which already
  reads the same world files and already owns zone and sector for every
  room. The layout is the same kind of fact about the same world.
- Its output is committed, like `atlas_sector_overrides.json` beside it,
  and served as a static asset. The web fetches it once.
- Regenerating is a command, run when the world files change, which is
  never during ordinary work.

## What the map does with it

- A room's square is a lookup. Drawing is placement, not computation.
- The camera centres on the agent and follows it, on by default.
- Squares stop moving, so the gaps between drawn rooms become real and
  the shape of what has not been explored can be read.

The join key already exists: every node carries `atlas.vnum` and
`zone_id`, so no backend contract changes.

## One map, used everywhere

The map appears in Live, in Sessions, and in session replay, and the
knowledge page will want it too. The drawing is written once and used by
all of them.

- One module owns the room, the link, the way up or down, the agent and
  the camera. A view decides what to show and where the camera is. It
  does not decide what a room looks like.
- This is how the two mockups are already built, sharing one stylesheet
  and one drawing module, and it is why they cannot drift apart. The
  port keeps that shape rather than flattening it into each view.

## The visual is the mockup

The approved mockups are the definition and are read directly, not
reinterpreted. They are working material and are not part of this
repository, so what they settle is written out below rather than referred
to.

- A room the agent has stood in is filled with its terrain colour, from
  the tokens the map already uses. One seen only from next door is an
  outline with a name. One it knows nothing about is an outline and
  nothing else, and cannot be clicked, because there is nothing behind
  it to open.
- Links stop at the edges of the rooms they join. A link that has to
  cross another, or run over a room, is a dotted arc hopping over it.
- The agent is a figure that walks the link between rooms, eased at both
  ends, with the link lighting up behind it.
- The camera is the `viewBox`, not a scrollbar, and follows on a
  critically damped spring.
- One floor at a time. A way up or down leaves the floor as a dotted
  diagonal to its own circle, naming the floor it reaches, dashed while
  that floor is unopened, barred when there is no way back. Changing
  floor is walked, entered, swapped, and walked out of.

Three things stay as they are rather than coming from the mockup: the
map's background, which the views already own, and both themes, which
are checked for legibility rather than assumed. Transparency that
existing overlays rely on is preserved.

## What is kept

Every feature in the map viewport keeps working with the new drawing,
and each is proven by rendering rather than assumed: ghost rooms, follow
and manual camera, fit, lantern, the legend, agent planning, room detail
on click, the room inspector, zoom, pan, frontier markers, visit and
content badges, vertical markers, the combat treatment, objective
beacons, the replay scrubber, and Sessions sharing one selection with
Story.

## What is removed

**Reflow.** With fixed positions there is nothing to reflow. The button
and the second walk both go.

**Focus, and I recommend removing it.** Three reasons:

- It solves a problem that is gone. Focus exists because a computed
  layout of many rooms is unreadable. Fixed squares, a camera that
  follows, and zoom already frame the map.
- It duplicates the lantern. Both answer "show me what is near the
  agent", one by hiding and one by dimming, and the lantern does it
  without moving anything.
- It would now contradict the fixed positions. Focus re-lays its rooms
  into a pane, so a room would sit in one place in Focus and another in
  Grow, which is exactly the instability this change removes.

It is not a small button. `focusContinuation.ts` and
`LiveMapContinuation.tsx` exist only to serve it, with their tests, plus
six exports from `mapPresentation.ts` and the focus layout inside
`LiveMap.tsx`. `MapMode` becomes grow and lantern.

## Rooms with no square

Best effort first. A crossing is not a reason to leave a room off the
map, so a placement that leaves a link crossing something is taken and
the link is drawn as an arc. Over fourteen zones that recovered 18 rooms
for 12 arcs, and nine of the fourteen still come out with no arcs at
all.

What remains is a room no square can hold, because several rooms reach
it all going the same way. `Mid-Air` in the sewers is reached by walking
east off five different ledges. It is not a place, it is what happens
after the last step, and it is drawn as one shape off the floor with the
ways into it, never as a square.

## How a person checks it

- Open a recorded session. The rooms do not move, and there is no Reflow
  to press.
- Walk the replay. The agent travels the links, the trail lights behind
  it, the camera trails without jumping.
- Take a way down in the newbie zone. The floor changes through the
  circle rather than cutting.
- Turn ghosts on. The unvisited rooms of the floor appear faintly.
- Compare side by side with `mockup_room.html` and `mockup_levels.html`.
  A visible difference in the map is a defect.
- Both themes, every kept feature, each rendered.

## Quality bar

- Approved visual mockups are binding for hierarchy, spacing,
  typography, colour and interaction. A deviation is a change to the
  design and is decided before it is built, not discovered after.
- UI changes are verified by rendering the result, never by reading the
  code that produces it.
- Styling stays in the three layers: tokens for every named value,
  utilities on components, no parallel stylesheets and no selectors
  reaching into markup at a distance.
- One responsibility per module, and one definition of the drawing
  shared by every view that has a map.
- Public interfaces typed, including the shape of the layout file.
- Tests: Vitest for the projection and the components, Playwright for
  the walk and the change of floor.

## Not in this plan

- Any use of the layout by the agent. It is observer truth, served to
  the browser and nowhere else. An agent handed a map of a world it has
  not walked is reading rather than exploring.
- The knowledge page's own content. It gains the shared map when it is
  reworked.
