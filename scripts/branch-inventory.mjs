// Branch inventory + recovery-ledger check: unmerged work must stay visible and accounted for.
//
//   node scripts/branch-inventory.mjs            print every remote branch vs the authoritative line
//   node scripts/branch-inventory.mjs --check    exit 1 if a branch holds unique commits that
//                                                docs/branch-ledger.json does not account for
// Local and free: no CI minutes. Run it before a release and after creating or retiring a branch.
//
// "Unique" = commits not on the authoritative line AND not patch-equivalent to one that is
// (`git cherry`), so cherry-picks and rewrites do not count as missing work.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const run = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function inventory({ auth, refPrefix = 'refs/remotes/origin/', cwd = process.cwd() }) {
  const names = run(['for-each-ref', '--format=%(refname)', refPrefix], cwd).split('\n').filter(Boolean);
  const rows = [];
  for (const full of names) {
    const name = full.slice(refPrefix.length);
    if (name === 'HEAD' || full === auth || name === auth) continue;
    const ahead = Number(run(['rev-list', '--count', `${auth}..${full}`], cwd));
    const behind = Number(run(['rev-list', '--count', `${full}..${auth}`], cwd));
    const unique = run(['cherry', auth, full], cwd).split('\n').filter(l => l.startsWith('+')).length;
    rows.push({ name, full, tip: run(['rev-parse', full], cwd), ahead, behind, unique });
  }
  return rows;
}

const isAncestor = (a, b, cwd) => { try { run(['merge-base', '--is-ancestor', a, b], cwd); return true; } catch { return false; } };

/** Failure strings for branches whose unique work is not accounted for in the ledger. */
export function checkLedger(rows, ledger, { refPrefix = 'refs/remotes/origin/', cwd = process.cwd() } = {}) {
  const entries = new Map((ledger.branches ?? []).map(e => [e.branch, e]));
  const fails = [];
  for (const r of rows) {
    if (r.unique === 0) continue;                                   // everything on it is already on the authoritative line
    const e = entries.get(r.name);
    if (!e) { fails.push(`${r.name}: ${r.unique} unique commit(s) and no ledger entry (docs/branch-ledger.json)`); continue; }
    if (e.containedIn) {
      if (!isAncestor(r.tip, `${refPrefix}${e.containedIn}`, cwd)) fails.push(`${r.name}: no longer contained in ${e.containedIn}; new work needs review`);
    } else if (e.acceptedTip) {
      if (r.tip !== e.acceptedTip) fails.push(`${r.name}: tip moved (${e.acceptedTip.slice(0, 7)} -> ${r.tip.slice(0, 7)}) since it was reviewed`);
    } else if (e.status !== 'integration-branch') {
      fails.push(`${r.name}: ledger entry has neither containedIn nor acceptedTip`);
    } else if (r.behind !== 0) {
      fails.push(`${r.name}: integration branch is ${r.behind} commit(s) behind the authoritative line`);
    }
  }
  return fails;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { authoritativeLine } = JSON.parse(readFileSync('authoritative.json', 'utf8'));
  const auth = `refs/remotes/origin/${authoritativeLine}`;
  const rows = inventory({ auth });
  console.log(`authoritative line: ${authoritativeLine} @ ${run(['rev-parse', '--short', auth])}`);
  for (const r of rows) console.log(`${r.name.padEnd(52)} ahead ${String(r.ahead).padStart(3)}  behind ${String(r.behind).padStart(3)}  unique ${String(r.unique).padStart(3)}  ${r.tip.slice(0, 7)}`);
  if (process.argv.includes('--check')) {
    const fails = checkLedger(rows, JSON.parse(readFileSync('docs/branch-ledger.json', 'utf8')));
    for (const f of fails) console.error(`LEDGER: ${f}`);
    if (fails.length) process.exit(1);
    console.log('ledger OK: all unmerged work is accounted for');
  }
}
