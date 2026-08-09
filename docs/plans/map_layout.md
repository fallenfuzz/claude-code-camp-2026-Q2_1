# Plan: a fixed map, laid out once from the game's own world files

## Goal

Give every room in the world one position, computed once and kept, so
that every map screen places a room in the same square forever and
drawing becomes lookup rather than computation.

## The problem

Each map view derives positions by walking the rooms it happens to know,
outward from wherever the agent is standing.

- The same room lands somewhere different in each view.
- A room moves when a new neighbour is discovered, so the picture
  reflows as the agent walks.
- Gaps between drawn rooms mean nothing, so the shape of what has not
  been explored cannot be read.

The game itself knows the answer. The world files describe 1878 rooms
across 190 zones, each with its exits by direction. What they do not
carry is any coordinate: north and east are relationships, not
positions.

## What counts as correct

- A link's direction holds: east means the same row and a greater
  column, north means the same column and a lesser row.
- Distance does not matter. A corridor drawn with slack is still a
  corridor.
- Between rooms with no link there is no true relative position, so the
  layout never spends distortion deciding one.
- A link should not pass over a room or cross another link, but neither is
  a reason to refuse a placement. Both are drawn as an arc hopping over,
  and a room left off the map is worse than an arc.

## Levels, because a zone is not always one map

Rooms divide into pieces that only an up or a down exit joins. A flat
drawing cannot join those pieces without inventing a relationship the
world does not have, so each piece is laid out on its own grid and the
vertical exits are recorded as the way between them.

```
zone files ──parse──> rooms + exits by direction
                          │
                    split where only up or down joins
                          │
              level 1     level 2     level 3   ...
                 │           │           │
              grow each on its own grid
                 │           │           │
                 └───────────┴───────────┘
                          │
              vnum -> zone, level, x, y
```

An area built as several zone files is laid out as one thing. The
sewers are four files with exits running between them, and cutting at
the file boundary would draw an area nobody walks.

## The one operation

Everything is done by this:

    put a room on a square:
      if a room already holds the square, push it to the nearest square
        that keeps its own directions
      carry with the moved room every placed room its move would
        otherwise break, and nothing else
      refuse the whole thing if the result is unclean

The carrying is what makes a quarter of the map travel together while
the rest stays where it is. It follows the constraints, so the group is
discovered rather than fixed in advance.

## Placing a room

Rooms are placed outward from an anchor, one at a time, each one square
from the room that reached it. When that square is free and the result
is clean, it is taken and there is nothing to decide.

When it is not, three options are built and scored:

1. Take the square anyway, displacing whoever holds it.
2. Move the room it hangs off, making space, then seat it.
3. Sit further out, at the nearest square its direction still allows.

The option that leaves fewest rooms impossible wins, because a room left
off the map cannot be recovered later while an arc is only a line drawn
over something. Then fewest arcs, then the one that stretches the map
least, measured as the total length of every link, with the grid's size
settling a tie.

Ordering those first two the other way round costs rooms. Ranking arcs
ahead of placeability bends the map to stay tidy and leaves a later room
with nowhere to go.

## After every placement, pull links back

A room pushed aside to settle an earlier conflict has no reason to stay
there once the conflict is gone, and nothing else reclaims that space.
Every link longer than one square is tried again, longest first, using
the same one operation.

This is what stops a problem at one step being inherited by the next.

## Settling a conflict

- A leaf takes the square. It has one link, so this is the only place it
  can sit without stretching that link, and it can never push a problem
  outward.
- Between two rooms that both have further links, the one that would
  leave the smaller empty space keeps the square.
- When the loser has nowhere legal to go, the decision reverses: the
  winner gives way instead and takes its row with it.

## The rooms not placed yet

A room still to come ties its own neighbours together the moment the
first of them is seated. If it has one room to its east and another to
its west, those two share a row whether or not anything has noticed.
Left unchecked they are placed on rows that can never agree, and when
the room between them finally comes up no square in the world will do,
with nothing local left to repair.

This counts as a preference, not a rule. Enforced as a rule it refuses
placements the growing then cannot replace, and fewer rooms reach the
map, not more.

| the same rule | rooms placed | links over three squares |
| --- | ---: | ---: |
| not applied | 741 | 2 |
| as a rule | 738 | 2 |
| as a preference | 741 | 0 |

The same lesson settled the arcs. Refusing any placement that left a link
crossing something cost 18 rooms across fourteen zones to avoid 12 arcs.

| crossings | rooms placed | links arcing |
| --- | ---: | ---: |
| refused | 808 of 869 | 0 |
| accepted, and drawn as an arc | 826 of 869 | 12 |

Nine of the fourteen zones still come out with no arcs at all, so
accepting them costs nothing where nothing is needed.

## Coming back to a room

A room that cannot be seated is not abandoned. Once its surroundings
have settled it is tried again, and from every side that reaches it
rather than only from the room that happened to reach it first.

## What it reaches

Fourteen zones, laid out from the world files with no human input:

| | rooms | placed | levels | links arcing |
| --- | ---: | ---: | ---: | ---: |
| all fourteen | 869 | 826 | 79 | 12 |
| Midgaard | 58 | 58 | 3 | 0 |
| the chessboard | 67 | 67 | 3 | 0 |
| the newbie zone | 41 | 41 | 4 | 5 |
| the sewers, four files as one | 175 | 172 | 10 | 1 |

The chessboard is the check against a shape known in advance. Its 65
playable rooms come out as an 8 by 8 grid of alternating white and black
squares with the entrance hanging off the east edge, every link exactly
one square, from exit directions alone.

## What it cannot place

- A room no flat exit reaches, which has nothing to be positioned
  against. In Midgaard that is four: two behind an up exit, and two shop
  store rooms with no exits at all, which the shop code loads goods into
  and no player can walk to.
- A zone built to disorient. Two of the fourteen account for 41 of the
  43 rooms left out, and for those the honest answer on screen is to say
  no layout exists rather than to draw something wrong.
- A room reached by several rooms all going the same way, which no square
  can be. `Mid-Air` in the sewers is reached by walking east off five
  different ledges. It is not a place, it is what happens after the last
  step, and the map says so rather than inventing a square for it.

## What the Observatory map does today

Positions are derived every time, by walking the rooms the agent knows
outward from where it is standing. `buildMapGraph` picks between two
walks, `placeRooms` for evidence order and `reflowRooms` for topology,
and both return the same shape: a grid point per room.

Two things follow, both measured on session `f4af972f`, whose 15 rooms
span Midgaard and the Newbie Zone.

- The picture is not stable. Pressing Reflow on identical evidence moves
  4 of the 15 rooms. The Bakery and Main Street shift a whole column,
  and the Nexus shifts a row.
- A direction the agent does not know becomes a diagonal. The agent fled
  twice, so `#18601`, `#18602` and `#18603` are drawn as a staircase.
  Those three rooms are a straight corridor running east.

The second is honest about what the agent knows, which is the right
default for a map of its knowledge. It is also exactly what an observer
already knows better.

## How the map would use the layout

The seam is one call. Everything downstream of it, connections, bounds,
camera, focus, lantern and the frontier markers, consumes the grid
points and needs no change.

```
nodes + edges ──> placeRooms / reflowRooms ─┐
                                            ├─> grid point per room ──> the rest
world layout  ──> fixedRooms ───────────────┘
```

- The join key already exists. Every node carries `atlas.vnum` and
  `zone_id`, so nothing changes in the backend or the contract. All 15
  rooms of that session have a fixed position, on two levels.
- A room the layout does not have keeps today's walk and is drawn in a
  visibly different state, so the difference is never hidden.
- One level is shown at a time, because the agent occupies exactly one.
  The up and down markers already drawn on a room become the way across,
  and taking one switches the level.
- A level strip says which level is shown and which the agent has
  reached, in the toolbar group the camera and mode controls already
  use.
- Reflow goes. With fixed positions there is nothing to reflow, and the
  button exists only because the layout was unstable.
- Squares stop moving, so the gaps between drawn rooms become real and
  the shape of what has not been explored can be read for the first
  time.

Nothing else about the map changes. The tokens, the room shape, the
toolbar grouping and the evidence drill-down stay as they are, because
what is wrong with the map is what it draws, not how it looks.

## Showing rooms the agent has not seen

The layout knows every room in a level, so unvisited ones could be drawn
faintly around the visited ones. It would make the map far more
readable, and it would also end the map being a picture of what the
agent knows. Kept as a toggle, off by default, so the two readings never
get confused.

## The boundary that does not move

This is observer truth, the same as room numbers. The layout is served
to the browser and nowhere else. It never enters the knowledge store,
never appears in a tool response, and never reaches the agent. An agent
handed a map of a world it has not walked is reading rather than
exploring, and every exploration measurement stops meaning anything.

## Quality bar

- Best practice is the default: the layout is derived from the game's
  own world files rather than hand maintained, and correctness is
  measured rather than eyeballed.
- One responsibility per module: parsing the world files, growing a
  level, and splitting a zone into levels are separate.
- UI changes are verified by rendering the result. The layout is checked
  against the chessboard, whose shape is known before it is drawn.
- Typed boundaries: the layout file has one shape, room to zone, level,
  x and y.
