#!/usr/bin/env node
// Turns the desk's pipeline/ folder into a replay timeline for viz/index.html.
//   node viz/build-timeline.mjs --date 2026-11-09                  one day, PUBLIC (redacted): the default
//   node viz/build-timeline.mjs --from 2026-11-07 --to 2026-11-09  a range of days
//   node viz/build-timeline.mjs --date 2026-11-09 --private        full log text, for the owner's eyes only
//   --pipeline <folder>  default $ATH_DESK_PIPELINE, else ../pipeline, else (in a git worktree) the main checkout's
//   --out <file.js>  default viz/out/timeline.js (public) or viz/out/private.js (private; open index.html?file=private)
// Writes <out> (window.DESK_TIMELINE = …, so the page works from file://) and the same data as .json beside it.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildTimeline } from './lib/pipeline.mjs';
import { args, pipelineDir, vizDir } from './lib/args.mjs';

const a = args();
const from = a.date ?? a.from ?? new Date().toISOString().slice(0, 10);
const to = a.date ?? a.to ?? from;
const mode = a.private ? 'private' : 'public';
const tl = buildTimeline(pipelineDir(a), { from, to, mode });
const out = resolve(a.out ?? resolve(vizDir, 'out', mode === 'public' ? 'timeline.js' : 'private.js'));
mkdirSync(dirname(out), { recursive: true });
const json = JSON.stringify(tl);
writeFileSync(out, `window.DESK_TIMELINE = ${json};\n`);
writeFileSync(out.replace(/\.js$/, '') + '.json', json);
console.log(`${mode.toUpperCase()} timeline ${from} → ${to}: ${tl.events.length} events, ${tl.cards.length} cards → ${out}`);
