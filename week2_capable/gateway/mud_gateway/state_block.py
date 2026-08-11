"""What the agent is told about its situation, every turn.

A tool has to be chosen before it helps. This block is not chosen: it is
put in front of the agent on every decision, so what it holds is what the
agent can be relied on to know. Everything here is therefore something a
player would keep in their head while playing: where they are, what they
can see leads where, what is with them, how they are doing, and the
handful of habits worth keeping.

Rendered fresh from the store each time and never accumulated, so it can
never describe a situation that has passed.
"""

from __future__ import annotations

import time
from typing import Any, Mapping, Sequence

from .navigation.graph import WorldGraph, canonical_direction

_ORDER = ("north", "east", "south", "west", "up", "down")

#: Below this, a stored reading and a live one say the same thing, and
#: printing an age only adds noise.
_FRESH_SECONDS = 60.0


def _age(observed_at: float | None, now: float) -> str:
    """How long ago something was recorded, in the coarsest true unit.

    Everything read from the store carries this. Without it a stored fact
    reads as the present, and a note the agent wrote in another run hours
    ago argues on equal terms with what the game is saying now.
    """
    if observed_at is None:
        return ""
    seconds = max(0.0, now - float(observed_at))
    if seconds < _FRESH_SECONDS:
        return ""
    if seconds < 3600:
        return f"{int(seconds // 60)}m ago"
    if seconds < 86400:
        return f"{int(seconds // 3600)}h ago"
    return f"{int(seconds // 86400)}d ago"


def _evidence(fact: Any) -> Any:
    return getattr(fact, "latest_evidence", None) or getattr(
        fact, "evidence", None
    )


def _seen_at(fact: Any) -> float | None:
    """When the store last had this confirmed."""
    return getattr(_evidence(fact), "observed_at", None)


def _wrote_in(fact: Any) -> str:
    """The run that last asserted this."""
    return str(getattr(_evidence(fact), "session_id", "") or "")


def render_state_block(
    store: Any,
    pipeline: Any,
    projector: Any,
    *,
    advice: str = "",
    player_id: str = "",
    settings: Mapping[str, Any] | None = None,
    session_id: str = "",
    now: float | None = None,
) -> str:
    """The situation as the agent should carry it into its next decision."""
    now = time.time() if now is None else now
    place_id = getattr(projector, "current_place_id", None)
    room = getattr(pipeline, "room", None)
    graph = WorldGraph.from_store(store)
    here = graph.room_of(place_id)
    known = graph.rooms.get(here) if here else None

    lines: list[str] = []
    title = _title(room, known)
    visits = _visits(store, here)
    if title is None:
        lines.append("you have not seen where you are yet")
    elif visits > 1:
        lines.append(f"{title} — you have been here {visits} times")
    else:
        lines.append(f"{title} — first time here")

    for line in _ways(store, graph, room, known, here, now):
        lines.append(f"  {line}")

    for line in _present(room):
        lines.append(line)

    lines.extend(_condition(store, pipeline, player_id, now))

    lines.append(
        f"map: {len(graph.rooms)} rooms · "
        f"{len(graph.frontier_rooms())} with ways not yet walked"
    )
    for line in _notes(store, graph, here, now, session_id):
        lines.append(line)
    worth = _worth_knowing(store, player_id, settings or {})
    if worth:
        lines.append(worth)
    if advice:
        lines.append(advice)
    return "\n".join(lines)


def _worth_knowing(
    store: Any, player_id: str, settings: Mapping[str, Any]
) -> str:
    """What the character's own condition suggests, before it decides."""
    from .readiness import before_hunting, render

    state = {
        fact.predicate.removeprefix("state."): fact.value
        for fact in store.current_facts(layer="parsed")
        if fact.subject == f"player:{player_id}"
        and fact.predicate.startswith("state.")
    }
    return render(before_hunting(state, settings))


def _title(room: Any, known: Any) -> str | None:
    if room is not None and room.title:
        return str(room.title)
    if known is not None and known.title:
        return str(known.title)
    return None


def _visits(store: Any, here: str | None) -> int:
    """How many times the character has arrived in this room."""
    if here is None:
        return 0
    current = store.current_fact(here, "visits", layer="parsed")
    if current is not None and isinstance(current.value, int):
        return current.value
    return 1


def _ways(
    store: Any,
    graph: WorldGraph,
    room: Any,
    known: Any,
    here: str | None,
    now: float,
) -> list[str]:
    """Each way out, and what is known about where it goes."""
    raw: Sequence[str] = ()
    if room is not None and room.exits:
        raw = tuple(room.exits)
    elif known is not None:
        raw = tuple(sorted(known.exits))
    links = dict(known.links) if known is not None else {}
    refused = {
        fact.predicate.removeprefix("passage."):
            (fact.value, _seen_at(fact))
        for fact in store.current_facts(layer="parsed")
        if fact.predicate.startswith("passage.")
        and graph.room_of(fact.subject) == here
    }
    told = {
        fact.predicate.removeprefix("exit_named."): str(fact.value)
        for fact in store.current_facts(layer="learned")
        if fact.predicate.startswith("exit_named.")
        and graph.room_of(fact.subject) == here
    }
    ordered = sorted(
        {d for d in (canonical_direction(str(r)) for r in raw) if d},
        key=lambda d: _ORDER.index(d) if d in _ORDER else len(_ORDER),
    )
    lines = []
    for direction in sorted(set(ordered) | set(told),
                            key=lambda d: _ORDER.index(d)
                            if d in _ORDER else len(_ORDER)):
        target = links.get(direction)
        named = told.get(direction)
        if target is not None:
            room_there = graph.rooms.get(target)
            walked = (
                room_there.title
                if room_there is not None and room_there.title
                else "somewhere already mapped"
            )
            # The game named one room and the walk found another. Say so
            # rather than pick: it means the way changed, or two rooms
            # share a name, and either is worth knowing.
            if named and named.casefold() != walked.casefold():
                where = f"{walked} (the game calls it {named})"
            else:
                where = walked
        elif (refused.get(direction) or (None, None))[0] == "refused":
            age = _age(refused[direction][1], now)
            where = "would not open when tried"
            if age:
                where = f"{where} ({age})"
        elif named:
            where = f"{named}, never walked"
        else:
            where = "not walked yet"
        lines.append(f"{direction} → {where}")
    return lines


def _present(room: Any) -> list[str]:
    """What is in the room now, creatures before things.

    Read from the game's own last description of the room, never from what
    was seen here before. A remembered creature is not a present one: it
    may have been killed, it may have wandered, and in a dark room the
    game reports nothing at all. Saying "here" about a memory tells the
    agent something is in front of it that is not.
    """
    lines = []
    if room is None:
        return lines
    for name in getattr(room, "mobs", ()) or ():
        lines.append(f"here: {name} (creature)")
    for name in getattr(room, "objects", ()) or ():
        lines.append(f"here: {name} (object)")
    return lines[:6]


def _condition(
    store: Any, pipeline: Any, player_id: str, now: float
) -> list[str]:
    """How the character is doing, split by how current it is.

    Health and movement ride the line the game appends to every reply, so
    they are the present. Level, gold and the body conditions were read by
    a command that may have run long ago. One line carrying both dated the
    live numbers as well, which is the opposite of the truth. The maxima
    sit with the live numbers because they change only on levelling and a
    health reading without its ceiling decides nothing.
    """
    mine = [
        fact for fact in store.current_facts(layer="parsed")
        if fact.subject == f"player:{player_id}"
        and fact.predicate.startswith("state.")
    ]
    state = {
        fact.predicate.removeprefix("state."): fact.value for fact in mine
    }
    lines: list[str] = []

    vitals = getattr(pipeline, "vitals", None)
    if vitals is not None:
        top, top_move = state.get("max_hit"), state.get("max_move")
        lines.append(
            "you now: "
            f"{vitals.hit}{f'/{top}' if top else ''}hp · "
            f"{vitals.move}{f'/{top_move}' if top_move else ''}mv"
        )

    sheet: list[str] = []
    stored: list[float] = []

    def carry(predicate: str, text: str) -> None:
        sheet.append(text)
        stored.extend(
            at for at in (_seen_at(f) for f in mine
                          if f.predicate == predicate)
            if at is not None
        )

    for name, label in (("level", "level"), ("gold", "gold")):
        if name in state:
            carry(f"state.{name}", f"{label} {state[name]}")
    for name in ("hungry", "thirsty", "poisoned"):
        if state.get(name):
            carry(f"state.{name}", name)
    if sheet:
        # The oldest reading dates the line, because it is only as current
        # as its least current part.
        age = _age(min(stored), now) if stored else ""
        when = f", checked {age}" if age else ""
        lines.append(f"character sheet{when}: " + " · ".join(sheet))
    return lines


def _notes(
    store: Any,
    graph: WorldGraph,
    here: str | None,
    now: float,
    session_id: str,
) -> list[str]:
    """What the agent wrote down about this room during this run.

    A note is a belief, not an observation, and nothing checks it again
    after it is written. One from an earlier run competes with the live
    state and with the objective the agent has now, and neither the age
    nor the wording tells it which to trust: a run that had no money left
    a note saying so, and a later run read it while carrying ten gold.
    Earlier runs' notes stay in the store and `recall` still serves them.
    """
    lines = []
    for fact in store.current_facts(layer="belief"):
        if not fact.predicate.startswith("model."):
            continue
        if graph.room_of(fact.subject) != here:
            continue
        if _wrote_in(fact) != session_id:
            continue
        kind = fact.predicate.removeprefix("model.")
        age = _age(_seen_at(fact), now)
        when = f", {age}" if age else ""
        lines.append(f"you noted ({kind}{when}): {fact.value}")
    return lines
