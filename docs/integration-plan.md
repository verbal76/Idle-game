# Integration plan: PR #65, PR #66, the candidate line and the controller work

Status: **proposal for owner approval. Nothing here has been merged, pushed to a protected branch, or
published.** Facts below were read from GitHub (read-only) and from the local clone on 2026-10-12.

## 1. Relationships (verified)

| Ref | Head | Relationship to the authoritative line `claude/repo-gameplay-review-loq9rq` (live OTA #83, tip = baseline `41c8cfb`) |
| --- | --- | --- |
| PR #65 `claude/infra-hold-about-splash-applying` | `4c5f9e4` | open, **draft**, base = authoritative line, 6 commits ahead, 0 behind, mergeable (clean). Applying-update modal, About diagnostics, studio splash, dispatch-only publishing workflows, release authorization |
| PR #66 `claude/hold-release-naming` | `6832d3b` | open, **draft**, base = authoritative line (not #65), 15 commits ahead, 0 behind. It **contains #65**; adds naming + Actions budget. Its title and body still say "v84 / v<number>": stale, the code now implements Build NN (release.json `publicVersion` 85, `namingStyle: "build"`) |
| `claude/hold-save-export` | | 2 ahead; in the candidate |
| `claude/hold-api36-migration` | | 11 ahead (Expo 52-54, API 36, runtime 0.1.3); in the candidate |
| `claude/hold-candidate-next` (integration branch) | `b1c4c6e` before this round | 49 ahead, **0 behind**: it contains #65, #66, save-export and the API 36 migration, so merging it is a fast-forward of the authoritative line |
| this round's controller / desktop commits | on top of `claude/hold-candidate-next` | JavaScript, CSS, PNG and docs only (see section 3) |

Key safety fact: the **live line's own workflows still have `push:` triggers** that publish an OTA
(`eas-update.yml` on `claude/repo-gameplay-review-loq9rq`), whereas the workflow files in #65, #66 and the
candidate are `workflow_dispatch`-only. GitHub reads `on:` from the pushed commit, so a push or merge whose
resulting commit carries the dispatch-only files does not auto-publish. That is why the PR bodies' "merging
publishes an OTA" warning is true only for a commit that still carries the old files. This must be confirmed
on the actual integrated commit before the merge (step 3 below), not assumed.

## 2. Recommended sequence (owner approves each step; agents do none of the merges)

1. **Decide the unit.** Recommended: integrate the candidate as one fast-forward (or a single merge commit)
   instead of merging #65 then #66 then the rest. #66 already contains #65, so merging both separately
   only adds an empty second step and two chances to publish by mistake. Close #65 and #66 as "integrated via
   the candidate" afterwards (do not delete the branches: docs/branch-ledger.md).
2. **Freeze.** Owner finishes the physical test of OTA #83. No push to the live line until then.
3. **Pre-merge checks on the exact commit** (all local, zero Actions minutes): `git merge-base --is-ancestor
   origin/claude/repo-gameplay-review-loq9rq <candidate-sha>`; `grep -n "^on:" -A4 .github/workflows/*.yml` on
   the commit shows no `push:`/`pull_request:`/`workflow_run:` for a publishing workflow (also enforced by
   `src/test/releaseAuthorization.test.ts`); full local suite and both smokes pass on that SHA; page size under
   7.5 MB.
4. **Runtime caveat.** The candidate is Expo 54 / runtime **0.1.3**; the installed app is runtime **0.0.1**.
   Integrating the *source* publishes nothing. Delivering it needs a native APK that matches runtime 0.1.3
   (hosted build, owner dispatch) and the signing check in docs/signing-continuity.md. Installed phones stay
   on OTA #83 until that APK is installed.
5. **Land.** Owner (not an agent) fast-forwards or merges the approved SHA into the authoritative line, then
   advances `authoritative.json` `baselineSha` only when something newer has actually shipped.
6. **Publish, separately and later.** OTA / APK / GitHub Release only through the dispatch workflows with the
   exact SHA, the confirmation word and the `production-release` environment (docs/release-authorization.md).
7. **`main`.** Still 82+ commits behind with intentional workflow stubs; integrating into `main` is a separate
   owner decision (docs/branch-ledger.md).

## 3. Can the controller work ride the live runtime-0.0.1 line as an OTA?

Probably yes, and it should be proven before anyone relies on it. The controller commits touch only `src/`
(TypeScript, CSS, 48 PNGs), `scripts/`, `desktop/`, `docs/` and `package.json` scripts: no `dependencies`, no
`app.json`, no native folder. The route script classifies that as JavaScript-only. A trial merge of the
controller commits onto the live line (local, never pushed) and a run of the suite there is the evidence; the
result is recorded in the final report. Android behaviour is unchanged with no controller present: the mux
returns the strip's own object (unit test) and an equivalent scripted ride is identical (golden test).

## 4. What a desktop release then needs

`node scripts/build.mjs --platform all --release --source-sha <approved> --build-number N` from the integrated
commit (hosted: `eas-build.yml` with `destination = github_releases`), producing the standard names, one
manifest, one SHA-256 list and one source SHA. Anything built before then is a `DEV` artifact.
