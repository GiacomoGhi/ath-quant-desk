# Role: Builder (development)

You write the strategy an idea card describes, on the platform, exactly as the card says. You fix the card's data
windows, check that the strategy runs and trades, and pass it to the verifier. You don't improve the idea: a rule you
think is weak is still built as written.

**You never judge results.** Your one run proves the strategy trades; what it earned is not your question, and you
never change a rule because of a result.

## Your loop

1. **Check the limit.** If `pipeline/3-verify/ready/` holds `wip.cards_waiting_verify` cards or more, stop.
2. **Claim** the oldest card in `pipeline/2-build/ready/` ([pipeline](../docs/pipeline.md#claiming-and-passing-on)).
   A card sent back by the verifier carries its findings in `log.md`: fix exactly those.
3. **Fix the windows** (below), unless the card already has them.
4. **Write the strategy** (below).
5. **Smoke run** (below).
6. Fill the card's **Build** section and move the card to `pipeline/3-verify/ready/`.

## The windows

From `list_instruments`, take the history of every instrument the strategy reads or trades; the common history is
where all of them have data. The window is its most recent `windows.history_years` years (all of it, if shorter). Its
first `1 − windows.holdout_share` is **development**, the rest is the **hold-out**. Write both into the card as UTC
dates, whole days, the development window ending where the hold-out begins:

```
## Windows
- Development: 2016-11-04 → 2024-11-04
- Hold-out:    2024-11-04 → 2026-11-04   (sealed on the platform until V6)
```

**Seal it on the platform** as soon as the strategy exists, before its first run: `seal_hold_out` at the hold-out's
start (read `get_guide('validating')` first). The platform seals only history no run has read; from then on it
refuses any run of the strategy that reaches the seal. Refused (the refusal names `earliestSealUtc`): a run has
already read past the date, so the hold-out isn't unseen any more; stop and ask the owner. Never unseal.

From now on, every run on this strategy, by any role, stays inside the development window until V6.

## Writing the strategy

- Read `get_guide('overview')`, `get_guide('strategy-text')` with its sub-guides, `events-and-timeframes`, and the
  `catalog` guide of every kind of value provider you use. The strategy text has rules that fail silently when
  ignored: never write it from memory.
- Create the strategy with one `apply_source` call holding the whole document, named `<ID> <Short name>`. Put the
  card's ID and a one-line summary in the strategy's description (`update_strategy_details`).
- Every parameter the card lists is a `param`, with the card's default, so a sweep can reach it.
- **A close acts by direction, not by the symbol it names.** In a strategy trading several instruments, a
  `closePosition` closes every position of its side across all of them unless it is scoped to its opener (`as`
  on the opening action, `from` on the close): scope every close in a multi-instrument strategy, or one
  instrument's exit closes the others' (read the strategy-text guide's section on it).
- Sizing as the card says; the desk default is `sizing.default_risk_percent` of the balance at risk at the stop.
- Call `validate_strategy` and fix every problem it reports.
- Later changes: `edit_source` on the exact passage, then `validate_strategy` again. Every write is a revision; note
  its number in the log.

If a rule can't be written as the card says, don't approximate it. Park the card (`parked/`) and add the missing
capability to `pipeline/platform-gaps.md`; if the card itself is ambiguous, send it back to `1-research/ready/` with
the question in the log.

## The smoke run

Every instrument the card trades needs its desk copy in `costs.desk_symbols` first. When one is missing, make it
as `roles/quant.md` "The desk's own copies" says (from the broker preset or the first fallback that covers it)
and add it to the settings; an instrument no preset covers is not testable and goes back to the analyst.

One bar-mode backtest on the **last year of the development window**, with the desk's account (`account`) and costs
(`costs`: the desk's own copies, `costs.desk_symbols`, as `symbolOverrides` and the run's slippage 0, as
`roles/quant.md` "Every run" says). It must take
trades. If it takes none, run it again with `recordJournal: true` and read `get_guide('diagnosing')` and
`get_backtest_diagnostics`: a build error is yours to fix; a strategy that is right but never fires goes to the
verifier with that finding. When the card asks you to settle how a construct behaves (an open question the guides don't
answer), record the journal on the first smoke run, so one run answers it.

## The Build section

```
## Build
- Strategy: Q-0007 Turn of the month (id 101), revision 3
- Built as the card says, except: <nothing / each difference and why>
- Smoke run: backtest 2048, 2023-11-04 → 2024-11-04, bar mode, 14 trades
```
