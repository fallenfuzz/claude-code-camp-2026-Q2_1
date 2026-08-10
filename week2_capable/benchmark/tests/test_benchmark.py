from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
import yaml

from benchmark.config import Repository, create_attempt
from benchmark.e1 import main
from benchmark.journeys import J1, J2, judge
from benchmark.metrics import AttemptMetrics, aggregate, week1_corpus
from benchmark.metrics import measure_attempt
from benchmark.report import write_markdown
from benchmark.runner import (
    Budget,
    BudgetError,
    SurfaceProof,
    _launch_agent,
    _redact,
    run_attempt,
)


def test_cli_accepts_each_installed_gateway_profile_without_spending(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "benchmark.e1.prove_surface",
        lambda *, profile: SurfaceProof(profile, 9, 100, 25, "abc", "PASS"),
    )

    assert main(["--profile", "hybrid-core"]) == 0


def test_overlay_is_secret_free_and_pins_gateway_profile(tmp_path: Path) -> None:
    repository = Repository.discover()
    attempt = create_attempt(repository, tmp_path)
    text = (tmp_path / "settings.yaml").read_text()
    assert "boukensha-gateway" in text
    assert "direct-full" in text
    assert "result_mode: full" in text
    assert attempt.player_profile == "poucet"
    assert attempt.player_password_env == "MUD_PASSWORD"
    assert attempt.admin_password_env == "MUD_ADMIN_PASSWORD"
    assert "player-secret" not in text
    assert not (tmp_path / ".env").exists()
    assert attempt.max_turn_cost > 0


def test_one_off_player_becomes_an_ephemeral_secret_free_profile(
    tmp_path: Path,
) -> None:
    repository = Repository.discover()
    attempt = create_attempt(
        repository,
        tmp_path,
        player_character="NewTester",
    )
    settings = yaml.safe_load((tmp_path / "settings.yaml").read_text())

    assert attempt.player_profile == "benchmark-cli"
    assert attempt.player_password_env == "BOUKENSHA_PLAYER_PASSWORD"
    assert settings["gateway"]["connection"]["player_profile"] == "benchmark-cli"
    assert settings["gateway"]["players"]["benchmark-cli"] == {
        "character": "NewTester",
        "password_env": "BOUKENSHA_PLAYER_PASSWORD",
    }
    assert not (tmp_path / ".env").exists()


def test_reset_failure_is_a_setup_failure_before_any_model_evidence(
    tmp_path: Path,
) -> None:
    repository = Repository.discover()
    attempt = create_attempt(repository, tmp_path)
    launched = False

    def launch(**_: object) -> subprocess.CompletedProcess[str]:
        nonlocal launched
        launched = True
        return subprocess.CompletedProcess(
            [],
            2,
            "",
            "gateway reset failed: admin unavailable",
        )

    row = run_attempt(
        repository=repository,
        config=attempt,
        journey=J1,
        attempt_id="blocked",
        proof=SurfaceProof("direct-full", 25, 100, 25, "abc", "PASS"),
        launcher=launch,
    )
    assert launched
    assert row.status == "incomplete"
    assert row.error == "gateway reset failed: admin unavailable"


def test_attempt_uses_supervised_selected_session_reset(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = Repository.discover()
    attempt = create_attempt(repository, tmp_path, player_profile="poucet")
    captured: dict[str, object] = {}

    class Process:
        def __init__(self, command: list[str], **kwargs: object) -> None:
            captured["command"] = command
            captured.update(kwargs)
            self.returncode = 0
            self.pid = 4242

        def communicate(
            self,
            input: str | None = None,
            timeout: float | None = None,
        ) -> tuple[str, str]:
            captured["input"] = input
            return "", ""

    monkeypatch.setattr("benchmark.runner.subprocess.Popen", Process)
    _launch_agent(
        repository=repository,
        journey=J1,
        config=attempt,
        environment={"BOUKENSHA_DIR": str(tmp_path)},
    )

    command = captured["command"]
    assert isinstance(command, list)
    assert "boukensha" in command
    assert command[-2:] == ["--player-profile", "poucet"]
    assert "--task-stdin" in command
    assert command[command.index("--reset-baseline") + 1] == "level1-temple@1"
    assert command[command.index("--objective-title") + 1] == J1.objective_title
    assert command[command.index("--objective-source-kind") + 1] == "benchmark"
    assert captured["input"] == J1.order + "\n"


def test_journey_keeps_prompt_title_and_clue_distinct() -> None:
    assert J2.order == (
        "Travel north from the Temple into the newbie zone and find the "
        "Massive Minotaur."
    )
    assert J2.objective_title == "Find the Massive Minotaur"
    assert J2.clue == "north of the Temple · newbie area"


def test_unpriced_and_incomplete_attempts_do_not_aggregate(tmp_path: Path) -> None:
    base = dict(
        attempt_id="a", journey_id="J1", status="complete",
        stop_reason="journey-complete", iterations=1, success=True,
        evidence=(), final_state={}, wall_ms=1, model_calls=1, tool_calls=1,
        tools={"look": 1}, invalid_calls=0, corrective_calls=0,
        fresh_input_tokens=1, cache_read_tokens=0, cache_write_tokens=0,
        output_tokens=1, occupancy_tokens=1, schema_bytes=1,
        schema_token_estimate=1, reset_id="reset-1", profile_id="direct-full",
        capability_digest="abc", parse_misses=0,
        result_mode="full", tool_result_chars=1,
        cost_curve=(0.1,),
        wire_sequences=(), agent_log="agent.jsonl", gateway_journal="gateway.db",
    )
    priced = AttemptMetrics(cost_usd=0.1, **base)
    priced_failure = AttemptMetrics(
        cost_usd=0.3,
        **{
            **base,
            "attempt_id": "failed",
            "success": False,
            "stop_reason": "max_iterations",
            "model_calls": 2,
            "tool_calls": 3,
            "invalid_calls": 2,
            "corrective_calls": 1,
            "fresh_input_tokens": 3,
        },
    )
    unpriced = AttemptMetrics(cost_usd=None, **{**base, "attempt_id": "b"})
    incomplete = AttemptMetrics(
        cost_usd=0.2, **{**base, "attempt_id": "c", "status": "incomplete"}
    )
    setup_failure = AttemptMetrics(
        cost_usd=None,
        **{
            **base,
            "attempt_id": "setup",
            "status": "incomplete",
            "model_calls": 0,
            "tool_calls": 0,
            "reset_id": None,
        },
    )
    totals = aggregate(
        [priced, priced_failure, unpriced, incomplete, setup_failure]
    )
    assert totals["attempts"] == 2
    assert totals["setup_failures"] == 1
    assert totals["successes"] == 1
    assert totals["success_rate"] == 0.5
    assert totals["cost_usd"] == 0.4
    assert totals["tool_calls"] == 4
    assert totals["model_calls"] == 3
    assert totals["distributions"]["cost_usd"] == pytest.approx(
        {"mean": 0.2, "median": 0.2, "stdev": 0.1414213562}
    )
    assert totals["distributions"]["invalid_calls"]["mean"] == 1
    assert totals["distributions"]["corrective_calls"]["mean"] == 0.5


def test_tracked_week1_corpus_has_reproducible_boundaries() -> None:
    corpus = week1_corpus(Repository.discover().week1_sessions)
    assert (corpus.executed_total, corpus.executed_by_tool["move"]) == (451, 316)
    assert (corpus.confirmed_total, corpus.confirmed_by_tool["move"]) == (447, 314)


def test_report_row_links_both_sources_and_escapes_text(tmp_path: Path) -> None:
    row = AttemptMetrics(
        attempt_id="a|b", journey_id="J1", status="complete",
        stop_reason="journey-complete", iterations=1, success=True,
        evidence=(), final_state={}, wall_ms=1, model_calls=1, tool_calls=1,
        tools={}, invalid_calls=0, corrective_calls=0, fresh_input_tokens=1,
        cache_read_tokens=0, cache_write_tokens=0, output_tokens=1,
        occupancy_tokens=1, schema_bytes=1, schema_token_estimate=1,
        cost_usd=0.1, reset_id="reset-1", profile_id="direct-full",
        result_mode="full", capability_digest="abc", parse_misses=0,
        tool_result_chars=1,
        cost_curve=(0.1,),
        wire_sequences=(1,), agent_log="agent|log.jsonl",
        gateway_journal="gateway.db",
    )
    target = tmp_path / "report.md"
    corpus = week1_corpus(Repository.discover().week1_sessions)
    write_markdown(target, [row], corpus=corpus)
    text = target.read_text()
    assert "a\\|b" in text
    assert "agent\\|log.jsonl" in text
    assert "gateway.db" in text
    assert "Executed calls: 451" in text
    assert "Context-confirmed calls: 447" in text
    assert "no twentieth look" in text
    assert "Attempt measurements" in text
    assert "Tool distribution" in text
    assert "Cumulative cost checkpoints" in text
    assert "Success rate: 100.0%" in text
    assert "Standard deviation" in text


def test_j1_requires_bakery_and_menu_good() -> None:
    verdict = judge(J1, [{
        "payload": {
            "text": "The Bakery\n  1) fresh bread  10 coins\nA loaf of bread waits here"
        }
    }])
    assert verdict.success


def test_j2_requires_minotaur_observation_evidence() -> None:
    verdict = judge(J2, [
        {
            "kind": "observation",
            "payload": {"kind": "room", "mobs": ["The Massive Minotaur is here."]},
        }
    ])
    assert verdict.success
    assert "Massive Minotaur" in verdict.evidence[0]
    assert not judge(J2, [
        {"kind": "command", "payload": {"line": "find Massive Minotaur"}}
    ]).success


def test_budget_requires_headroom_and_pricing() -> None:
    budget = Budget(cap=1.0, spent=0.7)
    with pytest.raises(BudgetError):
        budget.require_headroom(0.5)
    with pytest.raises(BudgetError):
        Budget(cap=1.0).record(None)


def test_runtime_errors_redact_environment_credentials() -> None:
    assert _redact(
        "failed with secret-value and public",
        {"API_KEY": "secret-value", "PUBLIC_NAME": "public"},
    ) == "failed with [REDACTED] and public"


def test_metrics_preserve_limit_stop_reason_and_iterations(tmp_path: Path) -> None:
    agent_log = tmp_path / "agent.jsonl"
    agent_log.write_text(
        json.dumps({
            "phase": "turn_end",
            "reason": "max_iterations",
            "iterations": 125,
            "cost_usd": 0.2,
        }) + "\n"
    )
    row = measure_attempt(
        attempt_id="limited",
        journey=J1,
        agent_log=agent_log,
        gateway_journal=tmp_path / "missing.db",
        wall_ms=1,
        process_ok=True,
        schema_bytes=100,
        schema_token_estimate=25,
    )
    assert row.stop_reason == "max_iterations"
    assert row.iterations == 125


def test_metrics_record_cumulative_model_cost_curve(tmp_path: Path) -> None:
    agent_log = tmp_path / "agent.jsonl"
    agent_log.write_text(
        "\n".join(
            json.dumps({"phase": "response", "cost_usd": cost})
            for cost in (0.01, 0.02, 0.03)
        )
        + "\n"
        + json.dumps({
            "phase": "turn_end",
            "reason": "max_iterations",
            "iterations": 3,
            "cost_usd": 0.06,
        })
        + "\n"
    )
    row = measure_attempt(
        attempt_id="curve",
        journey=J1,
        agent_log=agent_log,
        gateway_journal=tmp_path / "missing.db",
        wall_ms=1,
        process_ok=True,
        schema_bytes=100,
        schema_token_estimate=25,
    )
    assert row.cost_curve == (0.01, 0.03, 0.06)


def test_cost_curve_prices_cached_tokens_from_model_catalog(tmp_path: Path) -> None:
    agent_log = tmp_path / "agent.jsonl"
    agent_log.write_text(
        json.dumps({
            "phase": "response",
            "provider": "test",
            "model": "cached",
            "cost_usd": 0.000005,
            "usage": {
                "input_tokens": 5,
                "cache_read_input_tokens": 10_000,
                "cache_creation_input_tokens": 100,
                "cache_creation": {"ephemeral_5m_input_tokens": 100},
                "output_tokens": 10,
            },
        })
        + "\n"
        + json.dumps({
            "phase": "turn_end",
            "reason": "max_iterations",
            "iterations": 1,
            "cost_usd": 0.00118,
        })
        + "\n"
    )
    models = tmp_path / "models.yaml"
    models.write_text(
        "test:\n"
        "  cached:\n"
        "    cost_per_million: {input: 1, cache_read: 0.1, "
        "cache_write_5m: 1.25, cache_write_1h: 2, output: 5}\n"
    )
    row = measure_attempt(
        attempt_id="curve",
        journey=J1,
        agent_log=agent_log,
        gateway_journal=tmp_path / "missing.db",
        wall_ms=1,
        process_ok=True,
        schema_bytes=100,
        schema_token_estimate=25,
        models_path=models,
    )
    assert row.cost_curve == (0.00118,)


def test_overlay_selects_model_result_mode(tmp_path: Path) -> None:
    repository = Repository.discover()
    attempt = create_attempt(repository, tmp_path, result_mode="minimal")
    assert attempt.result_mode == "minimal"
    assert "result_mode: minimal" in (tmp_path / "settings.yaml").read_text()


def test_overlay_applies_per_sample_iteration_and_spend_ceilings(
    tmp_path: Path,
) -> None:
    repository = Repository.discover()
    attempt = create_attempt(
        repository,
        tmp_path,
        model="claude-haiku-4-5",
        compaction_threshold=0.72,
        max_iterations=17,
        max_turn_cost=0.42,
    )

    text = (tmp_path / "settings.yaml").read_text()
    assert attempt.max_turn_cost == 0.42
    assert "max_iterations: 17" in text
    assert "max_turn_cost: 0.42" in text
    assert "model: claude-haiku-4-5" in text
    assert "compaction_threshold: 0.72" in text


def _ledger(root: Path, name: str, journey: str, capabilities, rows) -> Path:
    directory = root / name
    directory.mkdir()
    lines = []
    for index, row in enumerate(rows, start=1):
        success, stop, calls, cost = row[:4]
        status = row[4] if len(row) > 4 else "complete"
        entry = {
            "attempt_id": f"{name}-{index:02d}",
            "journey_id": journey,
            "status": status,
            "result_mode": "full",
            "success": success,
            "stop_reason": stop,
            "model_calls": calls,
            "cost_usd": cost,
        }
        if capabilities is not None:
            entry["capabilities"] = list(capabilities)
        lines.append(json.dumps(entry))
    (directory / "attempts.jsonl").write_text("\n".join(lines) + "\n")
    return directory


def test_the_matrix_compares_arms_a_single_report_cannot(tmp_path: Path) -> None:
    """Each arm writes its own ledger and its own report, and neither says
    anything about the others."""
    from benchmark.matrix import read_arm, render

    control = _ledger(tmp_path, "cap-a0", "J1", [],
                      [(False, "max_turn_cost", 40, 0.30)])
    armed = _ledger(tmp_path, "cap-a4", "J1", ["knowledge", "survival"],
                    [(True, "journey-complete", 22, 0.11)])

    report = render({"cap-a0": read_arm(control), "cap-a4": read_arm(armed)})

    assert "| J1 | full | none | cap-a0 | 1 | 0 |" in report
    assert "| J1 | full | knowledge+survival | cap-a4 | 1 | 1 |" in report
    # The bounded attempt gives a floor, so it is never averaged as a result.
    assert "| n/a |" in report
    assert "/sessions?run=" in report


def test_an_arm_that_gives_up_early_is_not_reported_as_efficient(
    tmp_path: Path,
) -> None:
    """A short failure is not a cheap success. Averaging one into mean calls
    would rank the arm that quit fastest as the most efficient."""
    from benchmark.matrix import read_arm, render

    quitter = _ledger(tmp_path, "cap-quit", "J1", ["navigation"], [
        (False, "self-ended", 4, 0.02),
        (True, "journey-complete", 30, 0.15),
    ])

    report = render({"cap-quit": read_arm(quitter)})

    row = next(l for l in report.splitlines() if "navigation" in l)
    assert "| 30.0 |" in row, row


def test_a_setup_failure_is_excluded_from_every_outcome(
    tmp_path: Path,
) -> None:
    """A run that never reached the mission says nothing about the
    capability it was configured with. Counting it as a failure would let a
    broken configuration read as a weak arm."""
    from benchmark.matrix import read_arm, render

    ledger = _ledger(tmp_path, "cap-broken", "J1", ["survival"], [
        (False, "process-error", 0, None, "failed"),
        (True, "journey-complete", 20, 0.10),
    ])

    report = render({"cap-broken": read_arm(ledger)})

    row = next(l for l in report.splitlines() if "survival" in l)
    # One attempt counted, one success, one excluded.
    assert row.endswith("| 1 | 1 | 20.0 | n/a | $0.100 | 0 | 0 | 1 |"), row
    assert "excluded" in report


def test_a_ledger_that_never_recorded_its_capabilities_is_refused(
    tmp_path: Path,
) -> None:
    """Two ledgers that both say nothing can be two different
    configurations, and grouping them would pool arms that never matched."""
    from benchmark.matrix import MatrixError, read_arm

    ledger = _ledger(tmp_path, "historical", "J3", None,
                     [(False, "max_turn_cost", 28, 0.26)])

    with pytest.raises(MatrixError):
        read_arm(ledger)

    assert read_arm(ledger, allow_unknown=True)


def test_a_ledger_that_mixes_arms_is_refused(tmp_path: Path) -> None:
    """Averaging two capability sets reports a number belonging to neither."""
    from benchmark.matrix import MatrixError, read_arm

    directory = tmp_path / "mixed"
    directory.mkdir()
    (directory / "attempts.jsonl").write_text("\n".join([
        json.dumps({"attempt_id": "a", "journey_id": "J1",
                    "capabilities": []}),
        json.dumps({"attempt_id": "b", "journey_id": "J1",
                    "capabilities": ["survival"]}),
    ]) + "\n")

    with pytest.raises(MatrixError):
        read_arm(directory)


def test_the_run_link_matches_the_identifier_the_observatory_uses(
    tmp_path: Path,
) -> None:
    """The report links into Sessions, so the two formulas have to agree."""
    from hashlib import sha256

    from benchmark.matrix import run_id

    expected = sha256(b"cap-a0:cap-a0-01").hexdigest()[:16]
    assert run_id("cap-a0", "cap-a0-01") == expected


def test_a_made_character_reaches_the_overlay_without_its_secret(
    tmp_path: Path,
) -> None:
    """The name is new every attempt, and the password stays where it was."""
    import yaml
    from benchmark.config import Repository, create_attempt

    config = create_attempt(
        Repository.discover(),
        tmp_path / "attempt",
        fresh_character="Bkexampleone",
    )
    written = yaml.safe_load(
        (config.directory / "settings.yaml").read_text(encoding="utf-8")
    )
    profile = written["gateway"]["players"][config.player_profile]

    assert config.creates and config.character == "Bkexampleone"
    assert profile["character"] == "Bkexampleone"
    assert profile["creates"] is True
    assert "password" not in profile
    assert "Bkexampleone" not in str(written.get("secrets", ""))


def test_a_name_the_game_would_refuse_never_reaches_an_attempt(
    tmp_path: Path,
) -> None:
    from benchmark.config import BenchmarkConfigError, Repository, create_attempt

    with pytest.raises(BenchmarkConfigError):
        create_attempt(
            Repository.discover(),
            tmp_path / "attempt",
            fresh_character="Bk-example_1",
        )


def test_every_attempt_of_an_arm_names_a_different_character() -> None:
    """One name reused across attempts is one character reused across them."""
    from benchmark.e1 import fresh_character

    names = {
        fresh_character("cap-a0", f"20260810T0530{index:02d}Z-01")
        for index in range(8)
    }

    assert len(names) == 8
    assert all(name.isalpha() for name in names)


def test_starting_maxima_come_from_the_reset_and_not_from_levelling(
    tmp_path: Path,
) -> None:
    """A character that levels ends with higher maxima than it was rolled.
    Recording those would compare an arm against a number its own success
    produced."""
    from benchmark.metrics import _starting_maxima

    events = [
        {"kind": "reset_receipt", "payload": {
            "ok": True, "state": {"hit": [22, 22], "move": [83, 83]},
        }},
        {"kind": "observation", "payload": {
            "kind": "player_state",
            "values": {"max_hit": 41, "max_move": 96},
        }},
    ]

    assert _starting_maxima(events) == (22, 83)


def test_a_failed_reset_supplies_no_starting_maxima() -> None:
    """An unverified reset proves nothing about what the run started from."""
    from benchmark.metrics import _starting_maxima

    events = [{"kind": "reset_receipt", "payload": {
        "ok": False, "state": {"hit": [22, 22], "move": [83, 83]},
    }}]

    assert _starting_maxima(events) == (None, None)


def test_warm_and_fresh_character_are_refused_together() -> None:
    """Warm reuses one attempt's configuration, and that names one
    character, so the two options promise opposite things."""
    from benchmark.e1 import main

    with pytest.raises(SystemExit) as exit_code:
        main(["--warm", "--fresh-character"])

    assert exit_code.value.code == 2


def _events(*entries):
    return [{"kind": k, "payload": p} for k, p in entries]


def _step(issuer="agent", line="north"):
    return ("command", {"line": line, "issuer": issuer})


def _room(number, title):
    return ("room_number", {"number": number, "title": title})


def test_the_budget_counts_steps_a_routine_takes_inside_one_call() -> None:
    """A sweep walks many steps in a single tool call. Counting move calls
    instead of steps gave the arms that sweep twice the walking: one recorded
    attempt made 24 move calls and 52 actual steps."""
    from benchmark.journeys import rooms_within_moves

    events = _events(
        _room(3001, "Temple"),
        *[_step(issuer="gateway") for _ in range(3)],
        _room(3005, "Temple Square"),
        _step(),
        _room(3006, "Inn"),
    )

    assert rooms_within_moves(events, 3) == ("3001 Temple", "3005 Temple Square")


def test_rooms_reached_after_the_budget_do_not_score() -> None:
    from benchmark.journeys import rooms_within_moves

    events = _events(_room(3001, "Temple"), _step(), _step(),
                     _room(3005, "Square"))

    assert rooms_within_moves(events, 1) == ("3001 Temple",)


def test_the_watching_immortal_does_not_spend_the_budget() -> None:
    """The observer is a different character somewhere else."""
    from benchmark.journeys import rooms_within_moves

    events = _events(*[_step(issuer="gateway-admin") for _ in range(5)],
                     _room(3001, "Temple"))

    assert rooms_within_moves(events, 1) == ("3001 Temple",)


def test_only_midgaard_rooms_count_toward_covering_midgaard() -> None:
    """Leaving the city must not improve the city score."""
    from benchmark.journeys import rooms_within_moves

    events = _events(_room(3001, "Temple"), _room(3062, "Alley"),
                     _room(1204, "Somewhere else"), _room(7115, "The Dump"))

    assert rooms_within_moves(events, 10) == ("3001 Temple", "3062 Alley")


def test_two_rooms_sharing_a_title_are_two_rooms() -> None:
    """Twenty three of Midgaard's titles are reused elsewhere in the world,
    and the city repeats its own. Counting titles would merge them."""
    from benchmark.journeys import rooms_within_moves

    events = _events(_room(3010, "Main Street"), _room(3011, "Main Street"))

    assert len(rooms_within_moves(events, 10)) == 2


def test_a_run_with_no_verified_room_numbers_scores_unknown() -> None:
    """Unknown is not zero, and a zero would read as a failed explorer."""
    from benchmark.journeys import J4, judge, rooms_within_moves

    events = _events(_step(), ("observation", {"kind": "room", "text": "Temple"}))

    assert rooms_within_moves(events, 10) is None
    assert judge(J4, events).evidence == ("no verified room numbers recorded",)


def test_a_coverage_run_with_no_room_numbers_is_excluded_not_failed(
    tmp_path: Path,
) -> None:
    """A run that cannot be scored is not a run that scored nothing.
    Counting it as a failed attempt would drag the arm down for a gap in the
    evidence rather than a gap in the agent."""
    from benchmark.matrix import read_arm, render

    ledger = _ledger(tmp_path, "cap-j4", "J4", ["navigation"], [
        (False, "journey-complete", 30, 0.12, "evidence-unavailable"),
        (True, "journey-complete", 40, 0.15),
    ])

    report = render({"cap-j4": read_arm(ledger)})
    row = next(l for l in report.splitlines() if "navigation" in l)

    assert row.endswith("| 1 | 1 | 40.0 | n/a | $0.150 | 0 | 0 | 1 |"), row


def test_the_same_capabilities_under_two_result_modes_are_two_rows(
    tmp_path: Path,
) -> None:
    """How results are shaped changes what the model reads, so two arms
    differing only in that are two conditions and must not merge."""
    from benchmark.matrix import read_arm, render

    arms = {}
    for mode in ("full", "minimal"):
        ledger = tmp_path / f"cap-a0-{mode}"
        ledger.mkdir()
        (ledger / "attempts.jsonl").write_text(json.dumps({
            "attempt_id": f"{mode}-01", "journey_id": "J2", "status": "complete",
            "result_mode": mode, "capabilities": [], "success": mode == "minimal",
            "stop_reason": "completed", "model_calls": 20, "cost_usd": 0.10,
        }) + "\n", encoding="utf-8")
        arms[ledger.name] = read_arm(ledger)

    report = render(arms)

    assert "| J2 | full | none |" in report
    assert "| J2 | minimal | none |" in report
