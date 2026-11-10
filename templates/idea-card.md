---
id: Q-0000
title: <short name>
source: <authors, title, year> — <link>
published: YYYY-MM-DD
instrument: <the catalog symbol; for a basket, "basket" and the symbols in Rules>
related_instruments: [<symbols the same idea should also work on, for the robustness stage>]
timeframe: <execution event, e.g. on close(H1)>
expected_trades_per_year: <number>
---

# Q-0000 <Short name>

## Hypothesis

<One sentence: what happens in the market, and how the strategy profits from it.>

## Why it should work

- **Who is on the other side:** <who pays, and why they keep paying>
- **Why it should persist:** <risk premium, behaviour, structure, flows…>
- **What would kill it:** <the change in the market that would end the edge>

## Evidence in the source

<markets, period, frequency, reported results, whether costs were included. Recorded, never targeted.>

## Rules

- **Evaluated:** <execution event>
- **Entry:** <exact conditions>
- **Exit:** <exact conditions>
- **Stop loss / take profit:** <…>
- **Sizing:** <the source's, or the desk default from the settings>
- **Filters, sessions, time zone:** <…>

## Parameters

| Parameter | Default (from the source) | Plausible range | To optimize |
|---|---|---|---|
| | | | yes / no |

At most `optimization.max_parameters` marked "yes".

## Related instruments

| Symbol | Session times and time zone | Price distances | Anything else tied to the instrument |
|---|---|---|---|
| | | | |

Every parameter not in this table keeps the main instrument's value.

## Departures from the source

<every place the rules differ from the source, or interpret something the source leaves open, with the reason —
decided without looking at any results>

## Expected frequency

<trades per year and how the estimate was made; compared with the settings' minimum>

## Costs

<the average move the strategy captures per trade, against the round-trip cost on the owner's broker>

## On the platform

<each rule mapped to the strategy text: the value providers, the actions, the execution event; any gap>

## Gate R

- [ ] A rationale exists, with someone on the other side
- [ ] Every rule can be written in the strategy text
- [ ] Not a duplicate of a card in any stage, `parked/` or `retired/`
- [ ] Expected trades meet the settings' minimum
- [ ] The edge per trade clears the costs
- [ ] At most the allowed number of parameters to optimize

<!-- Later stages add their own sections below, in this order: Windows and Build (builder), Verify (verifier),
     Validation and Hold-out (quant), Incubation (portfolio manager and verifier). -->

