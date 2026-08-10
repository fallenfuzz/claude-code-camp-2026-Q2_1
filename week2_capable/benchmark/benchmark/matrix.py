"""One table across the arms of an experiment.

Each arm writes its own ledger and its own report, and neither says anything
about the others. The comparison the experiment exists to make therefore has
no artifact at all until the arms are read together, which is what this does.

    python -m benchmark.matrix .boukensha/benchmarks/cap-*

Every row carries the run identifier the Observatory knows the attempt by, so
a number that looks wrong can be opened and read as a transcript rather than
argued about.
"""

from __future__ import annotations

import hashlib
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping

from .autopsy import classify
from .metrics import read_gateway, read_jsonl

#: A stop that came from a bound rather than from the mission. The call count
#: of such an attempt is a floor, not a measurement, so it is never averaged
#: into one.
BOUNDED = ("max_",)


class MatrixError(RuntimeError):
    """A ledger cannot take part in a comparison."""


@dataclass(frozen=True)
class Attempt:
    """One attempt, reduced to what a comparison reads."""

    run_id: str
    arm: str
    attempt_id: str
    journey: str
    capabilities: tuple[str, ...] | None
    success: bool
    censored: bool
    calls: int
    rooms: int | None
    cost: float | None
    deaths: int
    #: Whether the attempt is an outcome at all. A run that never got as far
    #: as the mission, because its setup failed or its process died, says
    #: nothing about the capability it was configured with. Counting it as a
    #: failure would let a broken configuration read as a weak arm.
    eligible: bool


def run_id(arm: str, attempt_id: str) -> str:
    """The identifier the Observatory knows this attempt by.

    Mirrors the projection in the Observatory's benchmark source. The two
    are separate packages on purpose, so this is written out rather than
    imported, and a change to either without the other breaks the link in
    the report before it breaks anything else.
    """
    return hashlib.sha256(f"{arm}:{attempt_id}".encode()).hexdigest()[:16]


def read_arm(ledger: Path, *, allow_unknown: bool = False) -> list[Attempt]:
    """Every attempt in one arm's ledger, refusing a ledger that mixes arms.

    A ledger holding two journeys or two capability sets is not an arm, it
    is two, and averaging across them would report a number belonging to
    neither.
    """
    rows = [
        row for row in read_jsonl(ledger / "attempts.jsonl")
        if isinstance(row, dict) and "attempt_id" in row
    ]
    if not rows:
        raise MatrixError(f"{ledger.name}: no attempts recorded")
    journeys = {str(row.get("journey_id", "unknown")) for row in rows}
    if len(journeys) > 1:
        raise MatrixError(
            f"{ledger.name}: mixes journeys {sorted(journeys)}"
        )
    sets = {_capabilities(row) for row in rows}
    if len(sets) > 1:
        raise MatrixError(
            f"{ledger.name}: mixes capability sets "
            f"{sorted(str(entry) for entry in sets)}"
        )
    if sets == {None} and not allow_unknown:
        # Two ledgers that both say nothing about their configuration can
        # be two different configurations, and grouping them would pool
        # arms that were never the same one.
        raise MatrixError(
            f"{ledger.name}: recorded no capability set, so what it ran "
            f"with is unknown and cannot be compared"
        )
    return [_attempt(ledger.name, row) for row in rows]


def render(arms: Mapping[str, list[Attempt]]) -> str:
    """The comparison, as one table plus a line per attempt."""
    lines = ["# Capability matrix", ""]
    grouped: dict[tuple[str, Any], list[Attempt]] = {}
    for attempts in arms.values():
        for attempt in attempts:
            grouped.setdefault(
                (attempt.journey, attempt.capabilities), []
            ).append(attempt)

    lines.append(
        "| journey | capabilities | arms | attempts | successes | "
        "mean calls | mean rooms | mean cost | deaths | censored | excluded |"
    )
    lines.append(
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
    )
    for (journey, capabilities), every in sorted(
        grouped.items(), key=lambda item: (item[0][0], _label(item[0][1]))
    ):
        attempts = [a for a in every if a.eligible]
        priced = [a.cost for a in attempts if a.cost is not None]
        # Only an attempt that reached the mission says what reaching it
        # costs. One that gave up early stopped for its own reasons, and
        # averaging it in would let an arm look cheap for failing fast.
        measured = [
            a.calls for a in attempts if a.success and not a.censored
        ]
        names = sorted({a.arm for a in every})
        lines.append(
            f"| {journey} | {_label(capabilities)} | {', '.join(names)} "
            f"| {len(attempts)} "
            f"| {sum(a.success for a in attempts)} "
            f"| {_mean(measured)} "
            f"| {_mean([a.rooms for a in attempts if a.rooms is not None])} "
            f"| {_mean(priced, money=True)} "
            f"| {sum(a.deaths for a in attempts)} "
            f"| {sum(a.censored for a in attempts)} "
            f"| {sum(not a.eligible for a in every)} |"
        )

    lines += ["", "Mean calls covers the attempts that reached the mission. "
              "One stopped by a bound gives a floor and is counted under "
              "censored. One whose setup or process failed never reached the "
              "mission at all and is counted under excluded, out of every "
              "other column.", "", "## Attempts", ""]
    for arm in sorted(arms):
        for attempt in arms[arm]:
            outcome = "success" if attempt.success else attempt_state(attempt)
            lines.append(
                f"- `{attempt.arm}` {attempt.attempt_id}: {outcome}, "
                f"{attempt.calls} calls, "
                f"{_mean([attempt.cost], money=True)}, "
                f"[transcript](/sessions?run={attempt.run_id})"
            )
    return "\n".join(lines) + "\n"


def attempt_state(attempt: Attempt) -> str:
    if not attempt.eligible:
        return "excluded"
    return "censored" if attempt.censored else "failed"


def _attempt(arm: str, row: Mapping[str, Any]) -> Attempt:
    attempt_id = str(row.get("attempt_id", "unknown"))
    journal = row.get("gateway_journal")
    deaths = 0
    if isinstance(journal, str) and Path(journal).is_file():
        deaths = classify(read_gateway(Path(journal))).get("death", 0)
    cost = row.get("cost_usd")
    return Attempt(
        run_id=run_id(arm, attempt_id),
        arm=arm,
        attempt_id=attempt_id,
        journey=str(row.get("journey_id", "unknown")),
        capabilities=_capabilities(row),
        success=bool(row.get("success", False)),
        censored=str(row.get("stop_reason", "")).startswith(BOUNDED),
        calls=int(row.get("model_calls", 0) or 0),
        rooms=(
            None if row.get("rooms_explored") is None
            else int(row["rooms_explored"])
        ),
        cost=None if cost is None else float(cost),
        deaths=deaths,
        # The same rule the benchmark's own aggregate uses, so a row counts
        # here exactly when it counts there.
        eligible=str(row.get("status", "")) == "complete" and cost is not None,
    )


def _capabilities(row: Mapping[str, Any]) -> tuple[str, ...] | None:
    recorded = row.get("capabilities")
    if recorded is None:
        return None
    return tuple(sorted(str(name) for name in recorded))


def _label(capabilities: tuple[str, ...] | None) -> str:
    if capabilities is None:
        return "unknown"
    return "+".join(capabilities) if capabilities else "none"


def _mean(values: Iterable[float | int], *, money: bool = False) -> str:
    found = [value for value in values if value is not None]
    if not found:
        return "n/a"
    mean = statistics.fmean(found)
    return f"${mean:.3f}" if money else f"{mean:.1f}"


def main(argv: list[str] | None = None) -> int:
    given = list(sys.argv[1:] if argv is None else argv)
    if not given:
        print(__doc__)
        return 2
    arms: dict[str, list[Attempt]] = {}
    for entry in [item for item in given if not item.startswith("--")]:
        ledger = Path(entry)
        try:
            arms[ledger.name] = read_arm(
                ledger, allow_unknown="--allow-unknown" in given
            )
        except MatrixError as error:
            print(f"refused: {error}", file=sys.stderr)
            return 1
    print(render(arms))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
