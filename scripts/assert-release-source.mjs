// Release builds must come from the authoritative product history, never from an abandoned or
// unrelated branch: HEAD must CONTAIN the baseline commit recorded in authoritative.json (the
// source of the live release). Fails visibly (never skips) when ancestry cannot be proven,
// including in a shallow clone.
//
//   node scripts/assert-release-source.mjs [--head <sha>]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Returns { ok, reason }. Pure apart from reading git. */
export function checkReleaseSource({ baselineSha, head = 'HEAD', cwd = process.cwd() }) {
  if (!/^[0-9a-f]{40}$/.test(baselineSha ?? '')) return { ok: false, reason: 'authoritative.json has no valid baselineSha' };
  try {
    if (git(['rev-parse', '--is-shallow-repository'], cwd) === 'true') {
      return { ok: false, reason: 'shallow clone: ancestry cannot be verified (check out with fetch-depth: 0)' };
    }
    try { git(['cat-file', '-e', `${baselineSha}^{commit}`], cwd); }
    catch { return { ok: false, reason: `baseline ${baselineSha.slice(0, 7)} is not in this checkout: this is not the product's history` }; }
    try { git(['merge-base', '--is-ancestor', baselineSha, head], cwd); }
    catch { return { ok: false, reason: `${head} does not contain the authoritative baseline ${baselineSha.slice(0, 7)}: it is a divergent or outdated branch` }; }
  } catch (e) {
    return { ok: false, reason: `git failed: ${String(e.message).split('\n')[0]}` };
  }
  return { ok: true, reason: `contains authoritative baseline ${baselineSha.slice(0, 7)}` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--head');
  const head = i > 0 ? process.argv[i + 1] : 'HEAD';
  const { baselineSha, authoritativeLine } = JSON.parse(readFileSync('authoritative.json', 'utf8'));
  const r = checkReleaseSource({ baselineSha, head });
  if (!r.ok) { console.error(`::error::release source refused: ${r.reason} (authoritative line: ${authoritativeLine})`); process.exit(1); }
  console.log(`release source OK: ${head} ${r.reason}`);
}
