# Desk design

How the desk is organised: the teams, how ideas flow between them, and the steps from an idea to a strategy that is
validated and not overfitted. The rules behind it are in [`charter.md`](charter.md); every threshold is in the owner's
settings ([`settings.example.yaml`](../settings.example.yaml)).

## 1. The teams

Each team is one agent role with its own playbook in [`../roles/`](../roles/). A role never grades its own work:
whoever builds a strategy does not verify it, and whoever optimizes it does not judge it.

| Team | Role | Takes | Produces |
|---|---|---|---|
| Research | [**Scout**](../roles/scout.md) | — | Leads: sources worth reading — papers (SSRN, arXiv q-fin, Google Scholar), books, documented market behaviour |
| Research | [**Designer**](../roles/designer.md) | notions from sources, the desk's gaps, retired cards' lessons | A **lead** for an idea the desk designed itself, built on a stated mechanism, before any test |
| Research | [**Analyst**](../roles/analyst.md) | a lead | An **idea card**: the hypothesis, why the edge should exist, the instruments and timeframe, the rules, the parameters and their defaults |
| Development | [**Builder**](../roles/builder.md) | an idea card | The strategy on the platform, written as the card says, with its data windows fixed |
| Development | [**Verifier**](../roles/verifier.md) | a built strategy; an incubating strategy | Proof that the trades do what the card says, trade by trade against prices; during incubation, live trades matched against the backtest of the same days |
| Validation | [**Quant**](../roles/quant.md) | a verified strategy | The validation stages (§4), up to the hold-out |
| Portfolio | [**Portfolio manager**](../roles/portfolio-manager.md) | validated strategies | Demo incubation; portfolios of strategies that are uncorrelated and fit one account's margin together |
| Prop firms | [**Prop strategist**](../roles/prop-strategist.md) | library strategies | Prop-firm plans: the firm, the portfolio and the size that give the best expected value net of fees |
| Desk | [**Head of desk**](../roles/head-of-desk.md) | the whole pipeline | Research focus, stale cards, the weekly report to the owner, the platform gaps |

Ideas come from three places, and every one goes through the same stages: published sources (the scout), the
platform's own strategy catalog (the scout), and the desk's own designs (the designer), which may take one or two
notions from a source and build the rest. No idea skips a stage for where it came from.

## 2. The pipeline

The teams work at the same time. Ideas flow through `pipeline/` as cards; each team pulls work from its own stage's
inbox and passes it on when done.

```
pipeline/
  1-research/    ready/  working/            leads, waiting for an analyst
  2-build/       ready/  working/            idea cards, waiting for a builder
  3-verify/      ready/  working/
  4-validate/    ready/  working/  waiting/  waiting/ = done with what the platform allows today
  5-holdout/     ready/  working/
  6-incubation/  ready/  working/            ready/ = waiting for a free demo slot; working/ = deployed
  7-library/                                 strategies that passed incubation: what portfolios are built from
  portfolios/                                portfolio cards (P-NNNN)
  prop/                                      prop-firm plans (F-NNNN)
  parked/                                    sound ideas waiting for a platform capability, with the gap named
  retired/                                   every idea that failed, with the stage and the reason
```

The protocol (IDs, claiming, logs, limits) is in [`pipeline.md`](pipeline.md).

- **A card is a folder**, `Q-0001-short-name/`, holding `card.md` (the idea, its rules, its windows, each stage's
  pre-registered criteria and results) and `log.md` (every step, by which role, with the platform runs it made).
- **Warnings travel with the strategy.** What doesn't fail a stage but matters (the walk-forward, related
  instruments) is written in the card's Warnings section, under its title, and repeated wherever the strategy is used:
  portfolio cards, prop plans, the weekly report ([`pipeline.md`](pipeline.md), Warnings).
- **The desk never deletes anything on the platform.** Retired ideas stay there, and stay counted.
- **One idea, one strategy.** The card ID starts the strategy's name on the platform (`Q-0001 Short name`). Every
  variant is a new **revision** of the same strategy, never a duplicate. A genuinely different idea gets a new card.

## 3. Data windows

- **The builder fixes a card's windows** before the strategy's first run, writes them into the card, and nobody moves
  them again: up to the **most recent 10 years** of the instruments' common history, split in time into the **first
  80% for development** and the **last 20% as the hold-out**. With less history, the same split applies to what exists.
- Every run before the hold-out stage stays inside the development window. No role reads, runs or reasons about the
  hold-out window before stage V6.

## 4. From idea to validated strategy

Each stage's criteria are written into the card **before** its runs start. A verdict is never re-decided after seeing
the result.

| Stage | Who | What happens | Pass | Today |
|---|---|---|---|---|
| **R. Idea** | analyst | The card: hypothesis, rationale, rules, parameters, costs and frequency checks | Gate R in the card | runs |
| **B. Build** | builder | The strategy written as the card says; windows fixed; one smoke run | The platform validates it and it trades | runs |
| **C. Verify** | verifier | Trades checked against the card's rules and the prices | Every rule fires as written | runs |
| **V1. Baseline** | quant | Default parameters, development window, the owner's broker costs | `pass_bar` | runs |
| **V2. Optimization** | quant | In blocks of one or two related parameters, in an order fixed in the card before any run, once through: each block's sweep picks from a stable region by recovery factor and keeps the pick only on a clear improvement; then a cliff check one step around every tuned value | Each confirmation passes `pass_bar`; the cliff check stays profitable | runs |
| **V3. Robustness** | quant | Costs stressed; the backtest Monte Carlo; the development window in blocks; the idea on related instruments, each at its own session (a warning, not a fail) | `robustness` | runs |
| **V4. Walk-forward** | quant | The platform's walk-forward on the development window: the first block's grid re-optimized on rolling stretches, each pick traded on the months after it | Never fails: `walk_forward` sets its warnings | runs |
| **V5. Selection bias** | quant | The platform's validation report on every try in the strategy's ledger: the deflated Sharpe ratio; for long-biased ideas, buy-and-hold | `validation`: fails below the luck line, warns below the confidence line; buy-and-hold warns | runs |
| **V6. Hold-out** | quant | One run on the hold-out window the builder sealed on the platform, the chosen variant only | `pass_bar` on the hold-out. Fail = retired, never retuned | runs |
| **P. Incubation** | portfolio manager deploys, verifier judges | Demo account, live trades against the backtest of the same days (§4a) | `incubation` | runs |

A card that needs a stage the platform can't run waits in `4-validate/waiting/`, its card saying what it waits for;
the quant resumes it once the platform can. Nothing on the desk stands in for a missing stage (charter §1).

### 4a. Incubation

Incubation is measured in **trades, with a floor and a cap in time**, because trade frequency varies by strategy. It
answers one question: **does the strategy do live what its backtest does?** The same entries and exits, at the prices
and costs the backtest assumed. It does not re-prove the edge; the hold-out did that.

| | Default |
|---|---|
| Ends when | **at least 20 live trades and at least 4 weeks** have passed |
| Cap | **3 months**. A strategy that reaches it with fewer trades is judged on the trades it has, as long as the backtest of the same days shows the same trades |
| Kill at any time | the platform's drift goes Critical; live sets a deeper drawdown than the backtest's worst; a trade the backtest of the same days doesn't show, or one it shows that live didn't take |

The portfolio manager deploys to a demo account; the verifier backtests the deployed revision over its live days and
matches the trades. Every incubating strategy takes one of the plan's live slots, so the free slots cap incubation.
After incubation, the platform's drift keeps watching every strategy for as long as it runs.

## 5. Portfolios and prop firms

- **Portfolio manager:** builds portfolios from `7-library/` on the platform and judges them on correlation, drawdown
  overlap, combined margin, the portfolio Monte Carlo and the deployment fit (`portfolio` in the settings). It may run
  a portfolio on demo; real money is the owner's.
- **Prop strategist:** replays portfolios through prop-firm rule sets (pass odds, time to pass, funded payouts, fees,
  size factor) and checks trade-rule compliance. Judged by expected value net of fees, not by pass rate alone. Prop
  portfolios are built for the firm's rules, which can differ from what suits a personal account.

## 6. What stays with the owner

The desk is autonomous up to these lines:

- **Demo is the desk's.** Agents deploy, pause and stop on demo accounts on their own (`autonomy.demo_deployments`).
- **Real money is the owner's.** Moving anything to a real-money account is never an agent's call.
- **Spending.** Plan changes, purchases and prop challenges are the owner's.
- **Deleting** anything on the platform, and **unsealing** a hold-out.
- **Sweeps and walk-forwards are the desk's** (`autonomy.sweeps`): the owner's standing yes to their run counts. The platform's limits
  are the only cap. Every run still counts toward its idea's selection-bias correction (V5).

## 7. Running the desk

- Each role runs as its own agent session, looping over its stage's inbox. Any coding agent that supports MCP and
  reads these playbooks can run a role.
- **The desk on its own** (`autonomy.run_desk`): the owner sets the goal and the rules once (`settings.yaml`), and
  the head of desk dispatches the roles itself, when its agent can start other agents, until the pipeline has
  nothing left to do. The owner hears only about what `autonomy.owner_attention` lists (roles/head-of-desk.md,
  "Running the desk").
- Bring-up is one team at a time, with the owner watching, until each playbook behaves. Then all of them run together.
- The head of desk writes the weekly report.

## 8. Platform gaps

When a role needs something the platform can't do, it records the gap in `pipeline/platform-gaps.md` (part of the
private pipeline) and stops that line of work; the head of desk counts the ideas each gap holds back and reports the
list to the owner. Nothing is worked around (charter §1).
