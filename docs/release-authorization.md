# Release authorization and promotion

**Integration is not publication.** Merging, pushing, tagging, bumping a version or editing docs never publishes anything. Five separate steps, each explicit:

| Step | What it is | Trigger | Publishes? |
| --- | --- | --- | --- |
| 1. Code integration | merge a validated PR into the authoritative line | owner merges | No |
| 2. Development validation | local checks (`npx tsc && npx eslint . && npx vitest run && python3 -m unittest discover -s scripts/tests`, smoke for UI) | local | No |
| 3. Native build generation | APK artifact for testing | commit message `[build-apk]` on a branch, or owner dispatch of `eas-build.yml` | Artifact only |
| 4. OTA publishing | `eas-update.yml` | owner dispatch + exact SHA + `publish-ota` + environment approval | Yes (OTA) |
| 5. Production release | GitHub Release (`eas-build.yml` `release` job) or signed AAB/APK (`release-android.yml`) | owner dispatch + exact SHA + confirm word + environment approval | Yes |

## Every automatic publishing path that existed, and its fix

| Path | Before | Now |
| --- | --- | --- |
| Push to the live line | `eas-update.yml` ran lint, tests, smoke and PUBLISHED an OTA on every push not in `paths-ignore` (including docs) | No push trigger exists: dispatch only |
| Merge of the live line into `main` (PR #64) | `main` would take the live `eas-update.yml` and `eas-build.yml`: an OTA plus a GitHub Release on that merge | Both workflows have no automatic publish trigger; `[skip ci]` is no longer needed or relied on |
| Push to `main` | `eas-build.yml` created a GitHub Release (`softprops/action-gh-release`) | Builds only; the Release is a separate dispatch-only `release` job behind the environment |
| Push to `claude/android-snowboarding-game-UHUPI` | its own old copy ran an EAS cloud build and an OTA publish | Neutralized with a disabled-workflow commit (nothing deleted) |
| Tags, `release`, `workflow_run`, `workflow_call`, `repository_dispatch`, `pull_request_target` | none existed | Banned by a test over every workflow file |
| Old copies on stale branches | trigger only on pushes to branches named in their own lists (`main`, UHUPI) | `main` and UHUPI are stubs; the rest cannot fire |

`src/test/releaseAuthorization.test.ts` proves it: the publishers have no automatic trigger, every workflow containing a publishing command needs `environment: production-release`, a typed confirmation and `verify-approved-source.mjs`, and mutated copies (a push trigger added, the release job's dispatch guard removed) fail the tests.

## How the owner authorizes a publication

1. Decide the exact commit: the integrated tip of the authoritative line (full 40-character SHA; `git rev-parse origin/claude/repo-gameplay-review-loq9rq`).
2. GitHub > Actions > the workflow > Run workflow:
   - OTA: **EAS Update (OTA)**: `source_sha`, `confirm` = `publish-ota`, optional `ota_label` (for example `OTA #84`).
   - Coordinated build: **APK Build (GitHub-hosted)** (the primary build workflow) with `platform` (android, windows, linux or all), `source_sha`, `build_number` (must equal `release.json`), `destination` = `local_only` (workflow artifacts) or `github_releases` (one GitHub Release "Title Build NN" with the selected platforms, `build-manifest.json`, `checksums.sha256`; also needs `confirm` = `publish-release`). An Android-only `[build-apk]` commit still produces an artifact for playtesting.
   - Signed AAB/APK: **Release Android** with `source_sha`, `confirm` = `build-signed-release` (needs the signing secrets).
3. Approve the **`production-release`** environment when GitHub asks. One-time setup (owner, Settings > Environments > New environment `production-release`): add yourself as a required reviewer and restrict "Deployment branches" to the authoritative line. Even without that setup, nothing publishes unless someone with write access runs the workflow and types the confirmation word.

## Exact-SHA verification (`scripts/verify-approved-source.mjs`)

Fails closed unless: the approved value is a full 40-character lowercase SHA; the commit exists; the job checked out THAT SHA (`ref: <sha>`, never a branch) and `git rev-parse HEAD` equals it; it contains the authoritative baseline (`authoritative.json`); and it is reachable from `origin/<authoritative line>`, so a descendant that was never merged is refused. Every later step uses the approved SHA (`APPROVED_SHA` / `SOURCE_SHA`), never `GITHUB_SHA` or a branch name, so a branch moving during the run cannot change the source. The OTA stamps `extra.ota.commit` with it; the build manifest records it (`make-release-manifest.mjs` also throws if `SOURCE_SHA` and the checkout disagree); the release job re-verifies, checks the artifact hash and the manifest's source SHA, and creates the tag at that commit (`target_commitish`).

OTA safeguards kept: lint, unit tests, smoke, page-size budget, placeholder refusal, "never go backwards" (the live update's source commit must be an ancestor), channel re-link and delivery verification. New: the changes since the live update's commit are classified by `release-route.sh`; a native change cannot ship as an OTA.

## Promotion sequence (for later owner approval; nothing here has been done)

Facts: PR #65 (`infra-hold-about-splash-applying`) and PR #66 (`hold-release-naming`, stacked on #65) both target the live line. `hold-save-export` (Back up & restore; no PR) is stacked on #65. `hold-api36-migration` is stacked on save-export and is NOT OTA-compatible: it moves the runtime to 0.1.3 (`app.json`), so an OTA built from it is invisible to the installed runtime-0.0.1 app. The candidate (`hold-candidate-next`) contains all of it plus the release-safety work. A branch being 0 commits behind the live line says nothing about whether it is release-ready.

1. Do NOT merge PR #64 into `main` yet. It changes nothing for the installed game and is no longer a publishing risk, but it is not on the critical path.
2. Merge PR #65, then PR #66 (or #66 alone: it contains #65). They now carry the dispatch-only workflows, so the merge itself cannot publish. JS-only, runtime stays 0.0.1: OTA-compatible.
3. Integrate `hold-save-export` (JS-only, runtime 0.0.1) into the live line the same way. Expect ONE textual conflict: `scripts/smoke.mjs` (PR #65/#66 add the studio-splash smoke step and save-export adds the backup step at the same spot); keep both steps (the candidate's `scripts/smoke.mjs` is the correct merged file). A trial merge of #66 + save-export onto the live line was run locally: classification `native=false` (JS-only), `app.json` version 0.0.1, `release.json` 84, tsc/eslint clean and 286 unit tests pass. It needs its own validation: it touches the save/profile code, so run the full smoke and have the owner export a backup on the device before anything else changes.
4. Owner approves **OTA v84**: dispatch `eas-update.yml` with the integrated tip SHA (release.json = 84). Players on runtime 0.0.1 get backup, diagnostics, the studio splash, and the naming.
5. Owner exports a backup (Settings > Back up) and keeps it off the phone.
6. Integrate the migration (API 36 / runtime 0.1.x). No OTA is published for it; it is a native change: build the APK (v85) from the integrated SHA, install it over the existing app ONLY after the signing question is settled (docs/signing-continuity.md). Then runtime-0.1.x OTAs flow.
7. Last: PR #64 into `main`, so the default branch matches the authoritative line.

Steps that could affect OTA compatibility: 3 (touches saves), 4 (the publish), 6 (runtime bump). Steps that could trigger publishing under the OLD live workflows: merging PR #65 alone before it carried the new workflows, and PR #64 into `main`: both are closed by this change (the new workflows are in #65 and #66).
