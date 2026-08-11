# Week 2 · Observability

Week 2 makes the agent visible. The week 1 agent plays the same MUD, but
every decision it takes is now recorded as typed evidence, served over a
read API, and shown on screens a person can read.

## Watch the Observatory

[![Boukensha Observatory following an agentic adventure](observatory/docs/demo.gif?raw=true)](https://youtu.be/p8FFp4wVf3I)

*Follow an agentic player from launch into the live world, then inspect its
retained evidence, spatial replay, cost, experiments, knowledge, and operator
guidance. Select the preview for the full narrated walkthrough.*

Five packages, each with its own README:

| Package | What it is |
| --- | --- |
| [`agent/`](agent/README.md) | The agent itself, the `boukensha` package: the model loop, the tool registry, the logger, the REPL and the TUI |
| [`gateway/`](gateway/README.md) | The game interface, the `mud_gateway` package: the MUD connection, the parsers, the tool surface the agent calls, the state block |
| [`observatory/`](observatory/README.md) | The web monitor: a Python read API over retained evidence, a supervisor for starting and stopping runs, and a React front end |
| [`benchmark/`](benchmark/README.md) | Repeatable scenarios and the measured results of running them |
| [`log_viewer/`](log_viewer/README.md) | A terminal reader for a single session log |
| `bin/` | Thin launchers: `agent`, `observatory`, `log_viewer` |

## The shape of it

```
   the MUD  ──telnet──>  gateway  ──tools──>  agent  ──REST──>  the model
                            │                   │
                            └──── evidence ─────┘
                                     │
                              .boukensha (on disk)
                                     │
                        observatory read API  ──>  web
```

The agent never talks to the game. It calls tools, the gateway owns the
connection, and everything either of them does is written to
`.boukensha` as typed records. The Observatory only ever reads those
records, which is why watching a run cannot change it.

## Running it

Three processes, from the repository root. Build the front end once
first, or the host refuses to start.

```bash
cd week2_capable/observatory/web && npm run build
```

```bash
uv run --project week2_capable/observatory observatory-launcher
```

```bash
./week2_capable/bin/observatory
```

Open <http://127.0.0.1:8787>. For front end work, keep both Python
processes running and add Vite, which serves the source at
<http://127.0.0.1:8791> and proxies the API back to them.

```bash
cd week2_capable/observatory/web && npm run dev
```

| Port | Process | Serves |
| ---: | --- | --- |
| 8787 | `bin/observatory` | The read API, and the built front end from `web/dist` |
| 8792 | `observatory-launcher` | Starting and stopping runs |
| 8791 | `npm run dev` | The front end from source, proxying the API to 8787 and 8792 |

To play without the web, run the agent on its own:

```bash
./week2_capable/bin/agent
```

## Tests

Each package carries its own suite and all four stay green.

```bash
uv run --project week2_capable/agent pytest
uv run --project week2_capable/gateway pytest
uv run --project week2_capable/observatory pytest
uv run --project week2_capable/benchmark pytest
cd week2_capable/observatory/web && npm test
```

## Where the data lives

`.boukensha` at the repository root, never committed: player profiles,
one directory per session holding its journal and agent log, benchmark
attempts, and `settings.yaml` for durable non-secret policy.
