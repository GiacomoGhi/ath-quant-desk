// Tiny command-line helpers shared by the viz scripts.
import { dirname, resolve, isAbsolute } from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const vizDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = resolve(vizDir, '..');

export function args(argv = process.argv.slice(2)) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    a[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return a;
}

// In a git worktree, .git is a file ("gitdir: <main>/.git/worktrees/<name>") and the pipeline/ folder, being
// gitignored, lives only in the main checkout. Follow the pointer back to it (no git process needed).
function mainCheckout() {
  try {
    const dotGit = resolve(repoDir, '.git');
    if (statSync(dotGit).isDirectory()) return null;
    const gitdir = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'))?.[1]?.trim();
    if (!gitdir) return null;
    const wt = isAbsolute(gitdir) ? gitdir : resolve(repoDir, gitdir);
    const common = readFileSync(resolve(wt, 'commondir'), 'utf8').trim();
    return dirname(resolve(wt, common)); // <main>/.git → <main>
  } catch { return null; }
}

// The pipeline folder: --pipeline, else $ATH_DESK_PIPELINE, else this checkout's pipeline/, else (in a worktree) the
// main checkout's pipeline/. Exits with a clear message when none exists.
export function pipelineDir(a) {
  const given = a.pipeline ?? process.env.ATH_DESK_PIPELINE;
  if (given) {
    const p = resolve(String(given));
    if (existsSync(p)) return p;
    fail(`pipeline folder not found: ${p} (from ${a.pipeline ? '--pipeline' : '$ATH_DESK_PIPELINE'})`);
  }
  const tried = [resolve(repoDir, 'pipeline')];
  const main = mainCheckout();
  if (main) tried.push(resolve(main, 'pipeline'));
  const hit = tried.find((p) => existsSync(p));
  if (hit) return hit;
  fail(`no pipeline folder found. Looked in:\n  ${tried.join('\n  ')}\n`
    + 'Point the script at the desk\'s pipeline folder, for example:\n'
    + '  node viz/build-timeline.mjs --date 2026-11-09 --pipeline <path to the desk>/pipeline\n'
    + '  or set ATH_DESK_PIPELINE to that folder');
}

function fail(msg) {
  console.error(msg);
  process.exit(2);
}
