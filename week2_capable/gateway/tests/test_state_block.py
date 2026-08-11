from __future__ import annotations

import time
from pathlib import Path

from mud_gateway.knowledge import KnowledgeStore
from mud_gateway.knowledge_models import EvidenceRef
from mud_gateway.state_block import render_state_block


class _Room:
    def __init__(self, title: str, exits: tuple[str, ...]) -> None:
        self.title = title
        self.exits = exits


class _Vitals:
    def __init__(self, hit: int, mana: int, move: int) -> None:
        self.hit = hit
        self.mana = mana
        self.move = move


class _Pipeline:
    def __init__(self, room=None, vitals=None) -> None:
        self.room = room
        self.vitals = vitals


class _Projector:
    def __init__(self, place: str | None) -> None:
        self.current_place_id = place


def _seed(store: KnowledgeStore) -> None:
    evidence = EvidenceRef(
        session_id="test", source_seq=1, wire_digest="d",
        parser_version="p1", method="test", observed_at=time.time(),
    )
    for subject, predicate, value in (
        ("place:s:1:1", "title", "The Temple Of Midgaard"),
        ("place:s:1:1", "exits", ["n", "e"]),
        ("place:s:1:1", "exit.north", "place:s:2:2"),
        ("place:s:2:2", "title", "Square"),
        ("place:s:2:2", "exits", ["s"]),
    ):
        store.assert_fact(
            subject, predicate, value,
            layer="learned", confidence="confirmed",
            evidence=evidence, transaction_id="t1",
        )


def test_block_shows_place_marked_exits_vitals_and_coverage(
    tmp_path: Path,
) -> None:
    store = KnowledgeStore(tmp_path / "knowledge.db", player_id="tester")
    _seed(store)
    block = render_state_block(
        store,
        _Pipeline(
            room=_Room("The Temple Of Midgaard", ("n", "e")),
            vitals=_Vitals(20, 100, 82),
        ),
        _Projector("place:s:1:1"),
    )
    store.close()
    assert "The Temple Of Midgaard" in block
    assert "north → Square" in block, "a known way says where it goes"
    assert "east → not walked yet" in block
    assert "20hp" in block and "82mv" in block
    assert "map: 2 rooms" in block


def test_block_stays_honest_when_nothing_is_known(tmp_path: Path) -> None:
    store = KnowledgeStore(tmp_path / "knowledge.db", player_id="tester")
    block = render_state_block(store, _Pipeline(), _Projector(None))
    store.close()
    assert block.splitlines()[0] == "you have not seen where you are yet"
    assert "map: 0 rooms" in block


def test_the_block_says_where_a_known_way_goes(tmp_path: Path) -> None:
    """Knowing north is explored is useless. Knowing it reaches the Square
    is what lets the agent go back to somewhere it remembers."""
    store = KnowledgeStore(tmp_path / "knowledge.db", player_id="tester")
    _seed(store)
    block = render_state_block(
        store,
        _Pipeline(room=_Room("The Temple Of Midgaard", ("n", "e"))),
        _Projector("place:s:1:1"),
    )
    store.close()

    assert "north → Square" in block


def test_the_block_carries_what_a_fight_is_decided_on(tmp_path: Path) -> None:
    """Level, gold and hunger were absent, so no other thought was possible."""
    store = KnowledgeStore(tmp_path / "knowledge.db", player_id="tester")
    _seed(store)
    evidence = EvidenceRef(
        session_id="test", source_seq=2, wire_digest="d",
        parser_version="p1", method="score", observed_at=time.time(),
    )
    for predicate, value in (
        ("state.max_hit", 46), ("state.level", 3),
        ("state.gold", 120), ("state.hungry", True),
    ):
        store.assert_fact(
            "player:tester", predicate, value, layer="parsed",
            confidence="high", evidence=evidence,
        )
    block = render_state_block(
        store,
        _Pipeline(
            room=_Room("The Temple Of Midgaard", ("n",)),
            vitals=_Vitals(20, 100, 82),
        ),
        _Projector("place:s:1:1"),
        player_id="tester",
    )
    store.close()

    assert "20/46hp" in block
    assert "level 3" in block
    assert "gold 120" in block
    assert "hungry" in block


def test_advice_rides_with_the_situation(tmp_path: Path) -> None:
    """Rules the agent never reads are rules it does not have."""
    store = KnowledgeStore(tmp_path / "knowledge.db", player_id="tester")
    _seed(store)
    block = render_state_block(
        store,
        _Pipeline(room=_Room("The Temple Of Midgaard", ("n",))),
        _Projector("place:s:1:1"),
        advice="how to play:\n- size up anything before you fight it",
    )
    store.close()

    assert "size up anything before you fight it" in block


def test_a_way_never_walked_still_says_where_it_goes(tmp_path: Path) -> None:
    """The game names the room each way opens on. Knowing that before
    walking is what lets the agent choose a direction on purpose."""
    store = KnowledgeStore(tmp_path / "knowledge.db", player_id="tester")
    _seed(store)
    evidence = EvidenceRef(
        session_id="test", source_seq=3, wire_digest="d",
        parser_version="p1", method="exits", observed_at=time.time(),
    )
    store.assert_fact(
        "place:s:1:1", "exit_named.east", "The Midgaard Donation Room",
        layer="learned", confidence="high", evidence=evidence,
    )
    block = render_state_block(
        store,
        _Pipeline(room=_Room("The Temple Of Midgaard", ("n", "e"))),
        _Projector("place:s:1:1"),
    )
    store.close()

    assert "east → The Midgaard Donation Room, never walked" in block
    assert "north → Square" in block, "a walked way keeps what walking proved"


def test_a_walk_disagreeing_with_the_listing_is_said_aloud(
    tmp_path: Path,
) -> None:
    """Two rooms may share a name, or a way may have changed. Either is
    worth knowing, and neither is worth silently choosing between."""
    store = KnowledgeStore(tmp_path / "knowledge.db", player_id="tester")
    _seed(store)
    evidence = EvidenceRef(
        session_id="test", source_seq=4, wire_digest="d",
        parser_version="p1", method="exits", observed_at=time.time(),
    )
    store.assert_fact(
        "place:s:1:1", "exit_named.north", "Somewhere Else",
        layer="learned", confidence="high", evidence=evidence,
    )
    block = render_state_block(
        store,
        _Pipeline(room=_Room("The Temple Of Midgaard", ("n",))),
        _Projector("place:s:1:1"),
    )
    store.close()

    assert "north → Square (the game calls it Somewhere Else)" in block


def test_the_block_says_what_the_character_should_weigh(
    tmp_path: Path,
) -> None:
    """Advice belongs where the decision is made, not behind a tool call."""
    store = KnowledgeStore(tmp_path / "knowledge.db", player_id="tester")
    _seed(store)
    evidence = EvidenceRef(
        session_id="test", source_seq=5, wire_digest="d",
        parser_version="p1", method="score", observed_at=time.time(),
    )
    for predicate, value in (
        ("state.hit", 6), ("state.max_hit", 46), ("state.gold", 400),
    ):
        store.assert_fact(
            "player:tester", predicate, value, layer="parsed",
            confidence="high", evidence=evidence,
        )
    block = render_state_block(
        store,
        _Pipeline(room=_Room("The Temple Of Midgaard", ("n",))),
        _Projector("place:s:1:1"),
        player_id="tester",
        settings={"gold_carry_ceiling": 20, "fit_health_percent": 70},
    )
    store.close()

    assert "resting first costs less than dying" in block
    assert "carry-little-gold" in block


def test_here_is_what_the_game_just_showed(tmp_path: Path) -> None:
    """A remembered creature is not a present one. The room the game last
    described is the only thing that can say what is standing here."""
    store = KnowledgeStore(tmp_path / "knowledge.db", player_id="tester")
    _seed(store)
    evidence = EvidenceRef(
        session_id="test", source_seq=2, wire_digest="d",
        parser_version="p1", method="test", observed_at=time.time(),
    )
    for predicate, value in (
        ("name", "a large kobold"), ("kind", "mob"), ("room", "place:s:1:1"),
    ):
        store.assert_fact(
            "room-sighting:1", predicate, value,
            layer="learned", confidence="confirmed",
            evidence=evidence, transaction_id="t2",
        )

    room = _Room("The Temple Of Midgaard", ("n", "e"))
    room.mobs = ("a temple guard",)
    room.objects = ("a brass key",)
    block = render_state_block(store, _Pipeline(room=room),
                               _Projector("place:s:1:1"))
    store.close()

    assert "here: a temple guard (creature)" in block
    assert "here: a brass key (object)" in block
    assert "kobold" not in block, "a past sighting never reads as present"


def test_a_dark_room_reports_nothing_standing_in_it(tmp_path: Path) -> None:
    """The game shows no contents in the dark, and neither does the block."""
    store = KnowledgeStore(tmp_path / "knowledge.db", player_id="tester")
    _seed(store)
    evidence = EvidenceRef(
        session_id="test", source_seq=2, wire_digest="d",
        parser_version="p1", method="test", observed_at=time.time(),
    )
    for predicate, value in (
        ("name", "a large kobold"), ("kind", "mob"), ("room", "place:s:1:1"),
    ):
        store.assert_fact(
            "room-sighting:1", predicate, value,
            layer="learned", confidence="confirmed",
            evidence=evidence, transaction_id="t2",
        )

    block = render_state_block(store, _Pipeline(), _Projector("place:s:1:1"))
    store.close()

    assert "here:" not in block


def test_a_note_from_an_earlier_run_stays_out_of_the_block(
    tmp_path: Path,
) -> None:
    """The zero-gold note. Written in another run two hours earlier, it
    read as current and argued with the live figure beside it. Dating it
    was not enough: the agent still cannot tell which one to believe."""
    store = KnowledgeStore(tmp_path / "knowledge.db", player_id="tester")
    _seed(store)
    now = time.time()
    evidence = EvidenceRef(
        session_id="earlier", source_seq=1, wire_digest="d",
        parser_version="p1", method="test", observed_at=now - 8_400,
    )
    store.assert_fact(
        "place:s:1:1", "model.note", "I have 0 gold",
        layer="belief", confidence="confirmed",
        evidence=evidence, transaction_id="t2",
    )

    block = render_state_block(
        store,
        _Pipeline(room=_Room("The Temple Of Midgaard", ("n", "e"))),
        _Projector("place:s:1:1"),
        now=now,
    )
    store.close()

    assert "I have 0 gold" not in block
    assert "you noted" not in block


def test_a_note_from_this_run_is_carried(tmp_path: Path) -> None:
    """Written seconds ago in this run, it is the present, and saying how
    old the present is would be noise."""
    store = KnowledgeStore(tmp_path / "knowledge.db", player_id="tester")
    _seed(store)
    now = time.time()
    store.assert_fact(
        "place:s:1:1", "model.note", "a door here is locked",
        layer="belief", confidence="confirmed",
        evidence=EvidenceRef(
            session_id="now", source_seq=1, wire_digest="d",
            parser_version="p1", method="test", observed_at=now - 5,
        ),
        transaction_id="t2",
    )

    block = render_state_block(
        store,
        _Pipeline(room=_Room("The Temple Of Midgaard", ("n", "e"))),
        _Projector("place:s:1:1"),
        session_id="now",
        now=now,
    )
    store.close()

    assert "you noted (note): a door here is locked" in block


def test_stored_condition_says_when_it_was_last_checked(tmp_path: Path) -> None:
    """Health rides every reply and is current. Gold and hunger were read
    by a command, and the line is only as current as its oldest part."""
    store = KnowledgeStore(tmp_path / "knowledge.db", player_id="tester")
    _seed(store)
    now = time.time()
    for predicate, value, seconds in (
        ("state.gold", 10, 600),
        ("state.level", 1, 600),
        ("state.hungry", True, 9_000),
    ):
        store.assert_fact(
            "player:tester", predicate, value,
            layer="parsed", confidence="confirmed",
            evidence=EvidenceRef(
                session_id="s", source_seq=1, wire_digest="d",
                parser_version="p1", method="test",
                observed_at=now - seconds,
            ),
            transaction_id=f"t-{predicate}",
        )

    block = render_state_block(
        store,
        _Pipeline(
            room=_Room("The Temple Of Midgaard", ("n", "e")),
            vitals=_Vitals(14, 100, 84),
        ),
        _Projector("place:s:1:1"),
        player_id="tester",
        now=now,
    )
    store.close()

    live = next(l for l in block.splitlines() if l.startswith("you now:"))
    sheet = next(
        l for l in block.splitlines() if l.startswith("character sheet")
    )
    assert "14hp" in live and "84mv" in live, "the live line carries no age"
    assert "ago" not in live
    assert "gold 10" in sheet and "hungry" in sheet
    assert sheet.startswith("character sheet, checked 2h ago:"), \
        "the oldest stored reading dates the sheet, and only the sheet"
