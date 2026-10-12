// Exact release-source authorization. A release (OTA, signed build, GitHub Release) is built from
// ONE approved commit, never from "whatever the branch points at now".
//
//   node scripts/verify-approved-source.mjs <approved-sha>
//
// Fails closed unless ALL hold:
//   1. the approved value is a full 40-character lowercase SHA;
//   2. that commit exists in this checkout;
//   3. the checked-out HEAD IS that commit (the workflow checked out the SHA, not a branch);
//   4. it contains the authoritative baseline (authoritative.json): the product's one history;
//   5. it is reachable from the authoritative line (origin/<authoritativeLine>), i.e. it has been
//      integrated: a descendant of the live branch that was never merged is not an approved release.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkReleaseSource } from './assert-release-source.mjs';

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function verifyApprovedSource({ approvedSha, baselineSha, authoritativeLine, cwd = process.cwd(), lineRef }) {
  if (!/^[0-9a-f]{40}$/.test(approvedSha ?? '')) return { ok: false, reason: 'approved source must be a full 40-character lowercase commit SHA' };
  try { git(['cat-file', '-e', `${approvedSha}^{commit}`], cwd); }
  catch { return { ok: false, reason: `approved commit ${approvedSha.slice(0, 7)} does not exist in this checkout` }; }
  const head = git(['rev-parse', 'HEAD'], cwd);
  if (head !== approvedSha) return { ok: false, reason: `checked-out HEAD ${head.slice(0, 7)} is not the approved commit ${approvedSha.slice(0, 7)}` };
  const anc = checkReleaseSource({ baselineSha, head: approvedSha, cwd });
  if (!anc.ok) return anc;
  const ref = lineRef ?? `refs/remotes/origin/${authoritativeLine}`;
  try { git(['merge-base', '--is-ancestor', approvedSha, ref], cwd); }
  catch { return { ok: false, reason: `approved commit ${approvedSha.slice(0, 7)} is not on the authoritative line ${authoritativeLine}: integrate it first, then approve the integrated commit` }; }
  return { ok: true, reason: `${approvedSha.slice(0, 7)} is HEAD, contains baseline ${baselineSha.slice(0, 7)} and is on ${authoritativeLine}` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { baselineSha, authoritativeLine } = JSON.parse(readFileSync('authoritative.json', 'utf8'));
  const r = verifyApprovedSource({ approvedSha: process.argv[2], baselineSha, authoritativeLine });
  if (!r.ok) { console.error(`::error::release source refused: ${r.reason}`); process.exit(1); }
  console.log(`approved release source OK: ${r.reason}`);
}
