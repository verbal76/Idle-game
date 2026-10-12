# Recovery ledger (read-only forensic audit, 2026-10-12)

Authoritative line: `claude/repo-gameplay-review-loq9rq` @ `41c8cfb` (OTA #83). Method: commit ancestry, merge bases, `git cherry` patch equivalence, file/diff comparison, PR history. Machine-readable acceptance list: `docs/branch-ledger.json`; re-run with `node scripts/branch-inventory.mjs --check`.

## Branch inventory (ahead / behind the authoritative line, unique = not patch-equivalent)

| Branch | Tip | Ahead | Behind | Unique | Classification |
| --- | --- | --- | --- | --- | --- |
| `Github-APK-Transition` | 5890e13 | 0 | 82 | 0 | Already integrated (ancestor) |
| `claude/android-snowboarding-game-UHUPI` | 54de686 | 0 | 125 | 0 | Already integrated (ancestor; the EAS cloud-build era) |
| `claude/add-steering-obstacles-WCPxr` | 11c2966 | 0 | 127 | 0 | Already integrated (ancestor) |
| `claude/identify-issues-2Hub5` | 9148bf5 | 0 | 161 | 0 | Already integrated (ancestor) |
| `claude/fix-ota-updates-rBtFA` | 7e12a93 | 1 | 84 | 0 | Integrated through an equivalent patch (icon re-encode hotfix, PR #62) |
| `claude/compile-teaching-document-zZQy6` | 2d64524 | 1 | 83 | 0 | Integrated through an equivalent patch (prune workflow, PR #63) |
| `Github-APK-Transition-snow` | bf96e84 | 1 | 62 | 1 | Intentionally different: disables its own OTA/APK publishing |
| `main` (default) | 968e195 | 3 | 82 | 3 | Intentional: publish stubs, owner-uploaded logo, weekly prune. Behind the live line |
| `claude/hold-api36-migration` | db672e2 | 11 | 0 | 11 | In integration: contained in the candidate |
| `claude/hold-save-export` | a59ab98 | 2 | 0 | 2 | In integration: contained in the candidate |
| `claude/infra-hold-about-splash-applying` (PR #65) | 201edba | 3 | 0 | 3 | In integration: contained in the candidate |
| `claude/hold-release-naming` (PR #66) | dc89f7e | 8 | 0 | 7 | In integration: contained in the candidate |
| `claude/hold-candidate-next` | see git | 33+ | 0 | 28+ | Integration branch: proposed next tip, not live |

Tags: `snow-build-106`, `snow-build-107` both point at `8827159` (an ancestor of the authoritative line). The APKs were built from `86b534d` and `bc1fb81` (both ancestors). Every release traces to active history; note the tag points at the release-creation commit, not the built commit. No unmerged or closed-unmerged pull request exists. No stash or non-branch refs.

## Missing-work ledger

| # | Where | What | Classification | Disposition |
| --- | --- | --- | --- | --- |
| 1 | `main` `1db858a` | Canonical logo `Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png` existed only on `main` | Recovered | Carried byte-identical into the candidate (SHA-256 pinned by a test) and wired into the splash |
| 2 | authoritative line `d894818` (2026-05-08, "test: magenta title color") | A throwaway OTA-delivery test deleted ~64 lines of CSS: title bounce, charge bar, gear, About/settings rows (all re-implemented later, OTA #66 onward) AND the canvas vignette, canvas saturation/contrast filter and the menu fade-in | Mostly integrated through later re-implementation; vignette/filter/fade-in missing | Unknown, owner review (visual identity changed since: arcade UI, new 3D look). Not restored |
| 3 | reverts `900963f` (ramp rotation), `2b25573`/`b94a747` (workflow hotfixes) | Deliberate reverts | Intentionally removed | None |
| 4 | `main` workflow stubs, snow `bf96e84` | Publishing disabled on stale lines | Intentional | None; keeps a stale line from downgrading players |
| 5 | `main` is 82 commits behind | The default branch is not the authoritative line, and the live copy of the APK workflow says "APKs only from main" while main's APK workflow is disabled | Architecture gap | OWNER DECISION: integrate the authoritative line into `main` (PR #64). Merging publishes an OTA unless the merge commit message contains `[skip ci]` |
| 6 | candidate vs live | 33+ commits of validated work (API 36, backup, diagnostics, splash, naming, gates) not yet on the live line | In integration | Promote via PR #65/#66 on owner authorization (publishes an OTA) |

Nothing else was found only on an abandoned branch: bug fixes, performance work, UI work, assets and build changes on the old branches are all ancestors of the authoritative line.
