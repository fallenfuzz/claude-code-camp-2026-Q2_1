# Session logs

Every log here is one agent run, JSONL, one event per line. Read one with the log
viewer, or with `tail` and `grep`.

## The newer logs are not in this folder

The agent wrote its logs straight into this folder until 29 July. From 30 July each
run gets its own directory, and the log is one file inside it.

```
.boukensha/
    sessions/                                   this folder, runs up to 29 July
    profiles/<character>/sessions/<id>/          live runs from 30 July on
        agent.jsonl                              the session log
        session.json                             the run manifest
    benchmarks/<run>/attempts/<attempt>/         benchmark runs, same shape nested
        profiles/benchmark-fresh/sessions/<id>/
```

Nothing was copied between the two. Each log is committed where the runtime wrote it,
so a path in a report or a manifest still resolves.

## Where to look

| Runs | Dates | Path |
|---|---|---|
| week 1 baseline agent, steps 06 to 13 | 25 July | this folder |
| the gateway period | 28 to 29 July | this folder |
| live journeys, `poucet` and `elenor` | 8 to 10 August | `.boukensha/profiles/*/sessions/` |
| J1 capability matrix | 10 August | `.boukensha/benchmarks/cap-a*/attempts/` |

## Most of the newer runs were left out, on purpose

93 runs exist on disk from 29 July onward and they come to 244 MB. That is more than
belongs in a repository, so the tree carries nine of them, about 49 MB:

- Three live journeys, one from each of 8, 9 and 10 August, covering both characters.
  The 10 August run is 20.6 MB and is the longest of the term.
- One transcript per arm of the capability matrix, six in all. The matrix ran three
  attempts per arm to average them, so the arms differ from each other and the attempts
  within an arm do not.

Left out: 22 further live journeys and 13 further matrix attempts, including arm A2's
censored run that reached 103 model calls before its bound stopped it. Their numbers
are in [docs/reports/week3_capability_matrix.md](../../docs/reports/week3_capability_matrix.md),
which is computed from all 19 attempts and not from the six kept here.

## Naming

Logs in this folder are `<UTC start>-<short id>.jsonl`. From 30 July the name is the
directory instead, and the file inside is always `agent.jsonl`.
