#!/usr/bin/env node
// Proves a PUBLIC timeline leaks nothing private. Exit code 1 on any leak.
//   node viz/check-public.mjs --date 2026-11-09 [--pipeline <folder>]   builds the public timeline and checks it
//   node viz/check-public.mjs --file viz/out/timeline.json [--date …]   checks a file someone already generated
// Checks: (1) only known fields, no log text; (2) every speech line is built from a closed vocabulary (fixed phrases,
// role names, card ids, stage names, verdict words); (3) no digit run anywhere except inside card ids and instrument
// names in titles (so no run/strategy/portfolio/account ids, money, %, figures, times); (4) no money/percent signs,
// paths or file names; (5) every number that appears in the private log lines of that range is absent from the public
// output, and the private build does contain them (so the check has teeth).

import { readFileSync } from 'node:fs';
import { buildTimeline, ROLES, STAGE_NAMES } from './lib/pipeline.mjs';
import { args, pipelineDir } from './lib/args.mjs';

const a = args();
const date = a.date ?? (a.file ? null : new Date().toISOString().slice(0, 10));
const from = a.from ?? date, to = a.to ?? date;
const pub = a.file ? JSON.parse(readFileSync(a.file, 'utf8').replace(/^window\.DESK_TIMELINE = |;\s*$/g, ''))
  : buildTimeline(pipelineDir(a), { from, to, mode: 'public' });

const problems = [];
const fail = (where, what) => problems.length < 50 && problems.push(`${where}: ${what}`);

const VOCAB = new Set(`
  a an the of on to for at up and with from new lead research claimed claim pulled back re check sent defect conforms
  gate passed re-check retired cost parked waits platform unparked build failed ran out memory found has question
  running simulations smoke run backtest setting costs fixing data windows reading sources building checking trades
  writing card notions noting gap ranking focus list daily census report owner's owner declined ruling working
  counting portfolios done held answering duplicates dispatching desk business gone next stage send-back R V
  ${ROLES.join(' ')} ${Object.values(STAGE_NAMES).join(' ')}`.split(/\s+/).filter(Boolean));

const ALLOWED = {
  top: ['version', 'mode', 'range', 'newcomers'], range: ['from', 'to'], card: ['id', 'title', 'start', 'now'],
  event: ['t', 'role', 'seat', 'card', 'kind', 'say', 'refs', 'dispatched', 'to', 'from', 'est'],
};
const LOC = new RegExp(`^(${Object.keys(STAGE_NAMES).join('|')}):(ready|working|waiting)$`);
const QID = /^Q-\d{4}$/;

function noDigitsOutsideIds(where, s) {
  const stripped = s.replace(/\bQ-\d{4}\b/g, '').replace(/\bV\d\b/g, '');
  if (/(^|[^A-Za-z0-9])\d/.test(stripped)) fail(where, `a number outside a card id: "${s}"`);
  if (/[$€£%\\/]|\.(md|ya?ml|json)\b|https?:|pipeline|\b[PF]-\d{4}\b/i.test(s)) fail(where, `money, percent, a path or a private id: "${s}"`);
}

// (1) fields
if (pub.mode !== 'public') fail('mode', `is "${pub.mode}", not public`);
for (const k of Object.keys(pub)) if (![...ALLOWED.top, 'cards', 'events'].includes(k)) fail('top', `unknown field ${k}`);
for (const k of Object.keys(pub.range ?? {})) if (!ALLOWED.range.includes(k)) fail('range', `unknown field ${k}`);
for (const v of Object.values(pub.range ?? {})) if (v != null && !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail('range', `not a date: ${v}`);

for (const n of pub.newcomers ?? []) {
  if (Object.keys(n).some((k) => k !== 'role' && k !== 'seat') || !ROLES.includes(n.role) || !Number.isInteger(n.seat)) fail('newcomers', JSON.stringify(n));
}

for (const c of pub.cards) {
  for (const k of Object.keys(c)) if (!ALLOWED.card.includes(k)) fail(`card ${c.id}`, `unknown field ${k}`);
  if (!QID.test(c.id)) fail('card', `not a public card id: ${c.id}`);
  for (const l of [c.start, c.now]) if (l != null && !LOC.test(l)) fail(`card ${c.id}`, `unknown location ${l}`);
  // Titles may name instruments (DE40, US100): a digit run must sit inside a word.
  noDigitsOutsideIds(`card ${c.id} title`, c.title.replace(/\b[A-Z]{2,}\d+\b/g, ''));
}

pub.events.forEach((e, i) => {
  const where = `event ${i} (${e.role})`;
  for (const [k, v] of Object.entries(e)) {
    if (!ALLOWED.event.includes(k)) fail(where, `unknown field ${k}`);
    if (typeof v === 'number' && k !== 't' && k !== 'seat') fail(where, `a number in field ${k}`);
    if (k === 'est' && v !== true) fail(where, `est must be true or absent, not ${JSON.stringify(v)}`);
  }
  if (!ROLES.includes(e.role)) fail(where, `unknown role ${e.role}`);
  if (e.card != null && !QID.test(e.card)) fail(where, `card ${e.card}`);
  for (const r of e.refs ?? []) if (!QID.test(r)) fail(where, `ref ${r}`);
  for (const r of e.dispatched ?? []) if (!ROLES.includes(r)) fail(where, `dispatched ${r}`);
  for (const l of [e.to, e.from]) if (l != null && !LOC.test(l)) fail(where, `location ${l}`);
  // (2) closed vocabulary, (3) + (4)
  noDigitsOutsideIds(where, e.say);
  for (const w of e.say.replace(/\bQ-\d{4}\b/g, ' ').split(/[^A-Za-z'-]+/).filter(Boolean)) {
    if (!VOCAB.has(w) && !VOCAB.has(w.toLowerCase())) fail(where, `word outside the public vocabulary: "${w}" in "${e.say}"`);
  }
});

// (5) every number in the private lines of the range is absent from the public output
let privateNumbers = 0;
if (date || (from && to)) {
  const priv = buildTimeline(pipelineDir(a), { from, to, mode: 'private' });
  const numbers = new Set();
  for (const e of priv.events) for (const m of e.text.matchAll(/(?<![A-Za-z0-9])\d[\d.,]*\d|(?<![A-Za-z0-9])\d(?![A-Za-z0-9])/g)) numbers.add(m[0]);
  privateNumbers = numbers.size;
  const strings = [];
  const walk = (v, k) => {
    if (typeof v === 'string') strings.push(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) if (kk !== 'range') walk(vv, kk);
  };
  walk(pub);
  const blob = strings.map((s) => s.replace(/\bQ-\d{4}\b/g, ' ').replace(/\b[A-Z]{2,}\d+\b/g, ' ').replace(/\bV\d\b/g, ' ')).join('\n');
  for (const n of numbers) {
    if (new RegExp(`(?<![A-Za-z0-9])${n.replace(/[.]/g, '\\.')}(?![0-9])`).test(blob)) fail('cross-check', `private number ${n} appears in the public output`);
  }
  if (privateNumbers === 0) fail('cross-check', 'the private build has no numbers: the check proves nothing for this range');
}

if (problems.length) {
  console.error(`PUBLIC CHECK FAILED (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`PUBLIC CHECK PASSED: ${pub.events.length} events, ${pub.cards.length} cards; no log text, `
  + `every speech line inside the public vocabulary, none of the ${privateNumbers} numbers in the private lines leaked.`);
