# ATH Quant Desk

An AI-run systematic trading desk, built on [AlgoTradingHub](https://algotradinghub.io).

Teams of AI agents take a trading idea from a research paper to a validated, non-overfitted strategy, and on into
portfolios that can run together on one account. The agents run on your own AI subscription (any coding agent that
speaks MCP); AlgoTradingHub does all the building, backtesting, optimizing, validating and live trading through its
public MCP server.

This repository holds no trading engine. It is the desk's definition: the roles, their playbooks, the folder protocol
they work through, and the rules every idea has to pass. It is plain Markdown, plus an optional visual replay of the
desk at work ([`viz/`](viz/)).

Status: early. The playbooks are tightened as the desk runs and learns.

## The rules

The full charter is [`docs/charter.md`](docs/charter.md). In short:

1. **The platform does the work; the desk directs it.** Every backtest, optimization and validation statistic comes
   from the platform. Agents never compute a statistic themselves and never work around a missing feature: the gap is
   recorded, and that line of work stops until the platform can do it.
2. **Stay in your role.** Each agent does its own stage's work and nothing else. Nobody grades their own work: whoever
   builds a strategy does not verify it, and whoever optimizes it does not judge it.
3. **Criteria before results.** Every stage writes its pass criteria into the card before its runs start. A verdict is
   never re-decided after seeing the result.
4. **The hold-out is sealed.** Each idea gets up to ten years of history: the first 80 % for development and
   optimization, the most recent 20 % held out. Nobody looks at the hold-out until the strategy is final. It is run
   once; a strategy that fails it is retired, never retuned.
5. **Research, not mining.** Ideas come from published research, documented market behaviour or a stated mechanism,
   and carry an economic rationale. No brute-force indicator mining.
6. **One idea, one strategy.** Every variant is a new revision of the same strategy, so every attempt stays counted.
   Nothing is ever deleted on the platform.
7. **Demo only.** Agents deploy, pause and stop on demo accounts. Real money, spending (plans, purchases, prop
   challenges) and deleting are always the owner's call.
8. **Report numbers precisely.** Say which figures were read and from which run; never round a failure into a pass.
9. **Write everything down.** Every step on a card goes into its log, with the platform runs it made, so another
   agent can continue from the files alone.
10. **Your work stays private.** Your pipeline (ideas, strategies, results) and your settings are never committed.

## The desk

Nine roles, each with a playbook in [`roles/`](roles/):

| Team | Role | Does |
|---|---|---|
| Research | [Scout](roles/scout.md) | Finds sources worth reading: papers, books, documented market behaviour, the platform's strategy catalog |
| Research | [Designer](roles/designer.md) | Designs ideas from a stated mechanism, aimed at what the owner's book lacks |
| Research | [Analyst](roles/analyst.md) | Turns a lead into an idea card: hypothesis, rationale, instruments, rules, parameters, cost and frequency checks |
| Development | [Builder](roles/builder.md) | Writes the strategy on the platform exactly as the card says, with its data windows fixed |
| Development | [Verifier](roles/verifier.md) | Checks the trades against the card's rules and the prices, trade by trade; later, live trades against the backtest |
| Validation | [Quant](roles/quant.md) | Runs the validation stages up to the hold-out |
| Portfolio | [Portfolio manager](roles/portfolio-manager.md) | Demo incubation; portfolios of uncorrelated strategies that fit one account's margin |
| Prop firms | [Prop strategist](roles/prop-strategist.md) | Finds the prop-firm plans with the best expected value net of fees |
| Desk | [Head of desk](roles/head-of-desk.md) | Sets the research focus, dispatches the roles, chases stale cards, writes the weekly report |

The teams work at the same time. Ideas travel as **cards** (one folder per idea) through a shared `pipeline/` folder:
each role pulls work from its stage's inbox and passes it on when done, so research keeps producing while development,
validation and portfolio work run behind it. The protocol (ids, claiming by moving a folder, logs, limits) is in
[`docs/pipeline.md`](docs/pipeline.md).

### From idea to validated strategy

| Stage | Who | What happens |
|---|---|---|
| R. Idea | analyst | The card, and gate R: is the idea sound, writable and worth its costs? |
| B. Build | builder | The strategy written as the card says; one smoke run |
| C. Verify | verifier | Every rule fires as written, checked against the prices |
| V1. Baseline | quant | Default parameters on the development window, with the owner's broker costs |
| V2. Optimization | quant | A small grid fixed in advance; the variant chosen from a stable region, then confirmed |
| V3. Robustness | quant | Stressed costs, Monte Carlo, the window in blocks, related instruments |
| V4. Walk-forward | quant | Re-optimized on rolling stretches, each pick traded on the months after it |
| V5. Selection bias | quant | A correction for the variants the idea tried |
| V6. Hold-out | quant | One run on the sealed window. Fail = retired |
| P. Incubation | portfolio manager, verifier | Demo trading, matched trade by trade against the backtest of the same days |

A stage the platform can't run yet waits; the desk never stands in for it. Every threshold lives in the owner's
settings ([`settings.example.yaml`](settings.example.yaml)). The full design is in [`docs/design.md`](docs/design.md).

## Getting started

You need a coding agent that supports MCP (for example Claude Code) and an AlgoTradingHub account.

1. **Connect the platform.** This repository's [`.mcp.json`](.mcp.json) declares the server for Claude Code (open
   `/mcp` to sign in). Other agents: add the remote MCP server `https://app.algotradinghub.io/api/mcp` and sign in.
   Allow the **live** permission only if you want the desk to run demo incubation.
2. **Set your rules.** Copy `settings.example.yaml` to `settings.yaml` (kept private) and set at least your broker's
   cost preset (`costs.broker_preset`) and your goal (`owner.goal`).
3. **Run a role.** Open an agent session in this folder and say which role it is: *"You are the analyst. Run your
   playbook."* Each playbook is a loop: it works its stage's inbox until there is nothing left it can do. Several roles
   can run at once, each in its own session.
4. **Or let the desk run itself.** With `autonomy.run_desk: true`, start the head of desk: it dispatches the other roles
   (when your agent can start other agents) and brings you only what `autonomy.owner_attention` lists.

Every agent starts from [`AGENTS.md`](AGENTS.md), the instructions every role reads first.

## Repository layout

```
AGENTS.md               what every agent reads first
docs/charter.md         the rules
docs/design.md          the teams, the stages, what stays with the owner
docs/pipeline.md        the folder protocol: ids, claiming, logs, limits
roles/                  one playbook per role
templates/              the lead and idea-card templates
settings.example.yaml   every threshold, with its default
viz/                    the visual desk (optional)
pipeline/               your work: created by the desk, never committed
```

## Visual desk

[`viz/`](viz/) replays a day on the desk as a 3D night-time trading floor: each role is a character, each stage a
glass-walled room, and each card a glowing tile carried between rooms as its log lines happen. A slow camera drifts
over the floor, the sky follows the replay's clock, and a ticker tape shows where every card is. Everything is drawn in
code (no images), and the screens on the walls are decoration that never shows the desk's numbers. It only reads
`pipeline/`. Node 22, no dependencies, no build step.

- **Replay a day** (about 90 s, deterministic, made to screen-record): `node viz/server.mjs`, then open
  `http://127.0.0.1:8787/?date=YYYY-MM-DD`. `&duration=120` sets the length; `?from=…&to=…` replays a range.
  Keys: space pause, R restart, 1-4 speed, H hide the help line.
- **Without a server**: `node viz/build-timeline.mjs --date YYYY-MM-DD`, then open `viz/index.html`.
- **Live**: with the server running, open `http://127.0.0.1:8787/?live`. It watches `pipeline/` and streams new log
  lines as they are written.
- **Public by default.** Everything is PUBLIC unless started with `--private`: the page then gets only role names, card
  ids, stage names and verdict words, never figures, money, run ids or paths. The redaction happens in the script that
  reads the files, not in the browser, and the page always shows a PUBLIC / PRIVATE badge. A private export goes to
  `viz/out/private.js` (open `index.html?file=private`); `viz/out/` is never committed.
- **Before posting a clip**: `node viz/check-public.mjs --date YYYY-MM-DD` proves the public timeline leaks nothing
  (a closed vocabulary, no stray numbers, and none of the numbers in that day's private lines).
- **Where the data comes from**: `pipeline/` beside `viz/`, or, in a git worktree, the main checkout's `pipeline/`.
  `--pipeline <folder>` (or `ATH_DESK_PIPELINE`) points any of the scripts elsewhere.
- **How a day is timed**: each agent session stamps lines with its own clock, and those clocks can disagree by many
  minutes. Each session's lines keep their own spacing and are shifted just enough to fall in log order; a time that
  was estimated or corrected shows as `~15:21`. Bursts of routine lines are acted as one action, characters overlap,
  and a busy day plays at a faster pace to fit the length.

## License

MIT. See [`LICENSE`](LICENSE).
