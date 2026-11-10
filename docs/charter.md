# Charter

The rules the desk is built on. Every role, playbook and change in this repository follows them.

## 1. The platform does the work; this repo only directs it

- Everything that builds, runs, measures or validates a strategy happens on AlgoTradingHub, reached through its public
  MCP server.
- **The desk does the user's work, never the platform's.** What a user would do by hand with the platform — writing
  strategies, running and comparing backtests, reading results, deciding — is the desk's job.
- **If the platform can't do something the desk needs, the desk does not do it either.** Nothing here patches,
  replaces or works around a missing platform feature — no scripts, no local calculations, no stand-ins. The gap is
  reported upstream and the desk waits for it.
- The repository is Markdown: role definitions, playbooks (skills) and the pipeline's folder protocol. A user needs a
  coding agent and an AlgoTradingHub account, nothing else.

## 2. What is public here

- This repository is open source. It describes the desk, never the platform's internals.
- Documents reference only the public MCP tools and the public documentation. No infrastructure, no internal
  architecture, no costs, no non-public know-how.
- A user's own pipeline (their ideas, strategies and results) is their private work and is never committed — see
  `.gitignore`.

## 3. Scope of the first version

- Markets: the instruments in AlgoTradingHub's catalog.
- Ideas come from research (papers, documented market behaviour) and must carry an economic rationale.
- **No brute-force indicator mining** in the first version.

## 4. Data split

- Ten years of history per idea: the **first 8 years for development and optimization**, the **most recent 2 years
  held out for validation**.
- The hold-out is sealed until a strategy is final. It is run once; a strategy that fails it is retired, not tuned and
  retried — tuning against the hold-out would turn it into development data.
- Demo or live incubation is a separate, later stage.

## 5. The desk runs as a pipeline, not a sequence

Teams work concurrently. Each team pulls ideas from the stage before it in a shared pipeline folder, works them and
passes them on, so research keeps producing while development, validation and portfolio work run behind it.

With less than ten years of history, the same split applies to whatever history exists. There is no minimum.

The teams, the pipeline and the validation stages are in [`design.md`](design.md).
