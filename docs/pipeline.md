# The pipeline

How work moves between roles. Everything lives in `pipeline/`, which is private to the owner and never committed.

## Layout

```
pipeline/
  ids/                      one empty folder per ID ever issued (how IDs are allocated)
  sources.md                every source a scout has screened, kept or not, one line each
  platform-gaps.md          what the platform couldn't do, found while working; the head of desk reports it.
                            A table: the gap, the ideas it holds back (card IDs, or dropped sources by name), since
  focus.md                  what the head of desk wants researched next
  reports/                  the head of desk's weekly reports
  1-research/    ready/  working/            leads, waiting for an analyst
  2-build/       ready/  working/            idea cards, waiting for a builder
  3-verify/      ready/  working/
  4-validate/    ready/  working/  waiting/  waiting/ = done with what the platform allows today
  5-holdout/     ready/  working/
  6-incubation/  ready/  working/            ready/ = waiting for a demo slot; working/ = deployed
  7-library/                                 strategies that passed incubation
  portfolios/                                portfolio cards, P-NNNN
  prop/                                      prop-firm plans, F-NNNN
  parked/                   ideas waiting for a platform capability, with the gap named
  retired/                  ideas that failed a stage, with the stage and the reason
```

Portfolio cards and prop plans take their IDs the same way as idea cards, from `ids/` (`P-0001`, `F-0001`).

Create any folder that's missing.

## A card is a folder

`Q-0007-turn-of-the-month/` holds:

- `lead.md` — the scout's lead ([template](../templates/lead.md)).
- `card.md` — the idea card, written by the analyst ([template](../templates/idea-card.md)), then extended by each
  later stage in its own section.
- `log.md` — one line per step, newest last:
  `2026-11-04 15:32 · analyst · claimed` · `… · analyst · gate R passed → 2-build/ready`. Times are UTC.

On the platform, the strategy's name starts with the ID: `Q-0007 Turn of the month`.

## Notions

`pipeline/notions.md` keeps observations from sources that the desk may design around, one line each:
`2026-11-09 · <observation> · <source> · <who added it>`, with any question for the scout below it.

## IDs

To take the next ID, look at the highest number with your prefix in `pipeline/ids/`, add one, and **create** the
folder `pipeline/ids/Q-NNNN`. If creating it fails because it already exists, another agent took that number: add one and try
again. Creating a folder either succeeds or fails, so two agents never get the same ID.

## Claiming and passing on

- **Claim** the oldest card in your stage's `ready/` by **moving** its folder to `working/`. If the move fails, another
  agent took it: pick the next one. Log the claim.
- **Pass on** by moving the folder to the next stage's `ready/`. **Retire** by moving it to `retired/`, **park** by
  moving it to `parked/`; both with the reason in the log.
- Never edit a card that sits in another stage's `working/`. A card waiting in the next stage's `ready/` may be
  pulled back by the stage that passed it on, for a re-check the owner's ruling or a new fact calls for: move it
  back to your `working/`, log why, and pass it on again.
- A card left in `working/` with no log line for more than a day is stale. The head of desk decides what happens to it.

## Work-in-progress limits

Before claiming new work, look at the stage your work goes to next. If its `ready/` holds as many cards as the
settings allow (`wip`), stop: the desk finishes work before starting more.
