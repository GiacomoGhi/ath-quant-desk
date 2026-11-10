#!/usr/bin/env node
// The visual desk's small server: no dependencies, Node 22.
//   node viz/server.mjs [--port 8787] [--pipeline <folder>] [--private]
// Serves the page, the replay timeline (GET /api/timeline?date=YYYY-MM-DD or ?from=…&to=…) and LIVE events
// (GET /api/live, Server-Sent Events) by watching the pipeline folder, and what a viewer can open (GET /api/library,
// GET /api/doc?key=…). The privacy mode is the server's, fixed at start: PUBLIC unless --private. A public server
// redacts every event before it leaves this process, serves the desk's own documents but none of the pipeline's
// (no lead, card, log or report), and serves only the page's own files (never viz/out/, where a private export may sit).

import { createServer } from 'node:http';
import { readFileSync, watch } from 'node:fs';
import { join } from 'node:path';
import { buildTimeline, snapshot, eventKeys } from './lib/pipeline.mjs';
import { library, readDoc } from './lib/library.mjs';
import { args, pipelineDir, vizDir } from './lib/args.mjs';

const a = args();
const root = pipelineDir(a);
const mode = a.private ? 'private' : 'public';
const port = Number(a.port ?? 8787);
const host = a.host ?? '127.0.0.1';

const FILES = { '/': 'index.html', '/index.html': 'index.html', '/desk.js': 'desk.js', '/engine.js': 'engine.js', '/people.js': 'people.js', '/floor.js': 'floor.js', '/inspect.js': 'inspect.js' };
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8' };

const clients = new Set();
let known = new Set(eventKeys(root, mode).map((k) => k.key));

function send(res, type, data) { res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); }

function rescan() {
  let keyed;
  try { keyed = eventKeys(root, mode); } catch (err) { console.error('rescan failed:', err.message); return; }
  const fresh = keyed.filter((k) => !known.has(k.key));
  known = new Set(keyed.map((k) => k.key));
  if (!fresh.length) return;
  console.log(`${new Date().toISOString().slice(11, 19)} ${fresh.length} new event(s) → ${clients.size} viewer(s)`);
  for (const res of clients) for (const k of fresh) send(res, 'desk', k.event);
}

let timer = null;
const soon = () => { clearTimeout(timer); timer = setTimeout(rescan, 400); };
try { watch(root, { recursive: true }, soon); } catch (err) { console.warn('watch unavailable, polling only:', err.message); }
setInterval(rescan, 10_000);
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20_000);

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/timeline') {
      const date = url.searchParams.get('date');
      const from = url.searchParams.get('from') ?? date ?? new Date().toISOString().slice(0, 10);
      const to = url.searchParams.get('to') ?? date ?? from;
      if (![from, to].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) { res.writeHead(400).end('bad date'); return; }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(buildTimeline(root, { from, to, mode })));
      return;
    }
    if (url.pathname === '/api/library') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(library(root, join(vizDir, '..'), mode)));
      return;
    }
    if (url.pathname === '/api/doc') {
      const doc = readDoc(root, join(vizDir, '..'), mode, url.searchParams.get('key') ?? '');
      if (!doc) { res.writeHead(mode === 'private' ? 404 : 403).end(mode === 'private' ? 'not found' : 'private'); return; }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(doc));
      return;
    }
    if (url.pathname === '/api/live') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      send(res, 'snapshot', snapshot(root, mode));
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    const file = FILES[url.pathname];
    if (!file) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[file.split('.').pop()], 'cache-control': 'no-store' });
    res.end(readFileSync(join(vizDir, file)));
  } catch (err) {
    console.error(err);
    res.writeHead(500).end('error');
  }
}).listen(port, host, () => {
  console.log(`visual desk (${mode.toUpperCase()}) on http://${host}:${port}/  — pipeline: ${root}`);
  console.log(`  replay: http://${host}:${port}/?date=${new Date().toISOString().slice(0, 10)}   live: http://${host}:${port}/?live`);
});
