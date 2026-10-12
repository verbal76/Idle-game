# GitHub Actions budget policy (standing owner directive)

Actions minutes are shared across the studio's projects and the monthly budget is deliberately small. Default to proving things locally; use hosted Actions only when it gives necessary evidence.

## Ask before every hosted run

"Does this need GitHub Actions, or can I prove it locally?"

Local proof (free): `npx tsc && npx eslint . && npx vitest run && python3 -m unittest discover -s scripts/tests`, `npm run test:smoke` for UI changes, `npm run web:build` + `wc -c dist/index.html` (page budget), `npx expo export --platform android` after dependency changes.

Actions are appropriate for: final validation of a candidate that is approaching release/OTA; an APK/AAB the owner actually needs for physical testing or release; OTA publication with its safety gates; store/release builds; a platform check that cannot be reproduced locally (Gradle build, `zipalign -P 16`, `apksigner`).

Actions are NOT appropriate for: builds after every push; artifacts for OTA-only, docs or bookkeeping changes; re-running to see whether a flaky test passes; rebuilding the same SHA when a verified artifact exists; Windows/desktop artifacts nobody asked for.

Docs-only commits to any branch that triggers a workflow carry `[skip ci]` in the message.

## Inventory and what each costs

| Workflow | Triggers now | Cost per run | Notes |
| --- | --- | --- | --- |
| `eas-update.yml` (OTA) | push to the live line / `main`, except documentation, agent instructions, release tooling and other non-bundle paths (`paths-ignore`) | about 10 min (lint, tests, smoke, publish) | Release gate: kept in full. Before this audit a docs-only push ran everything AND published an OTA. |
| `eas-build.yml` (APK) | push to `main` for native changes; hold/candidate branches ONLY when the commit message contains `[build-apk]` (job-level `if`: a skipped job costs 0 min) | about 10 to 12 min | Editing docs or the workflow no longer starts anything. A newer `[build-apk]` push cancels the older in-progress run on that branch. Gradle cache is keyed on `package-lock.json` (it used to be keyed on generated files, so it never hit and saved ~1.5 GB every run). |
| `release-android.yml` (signed AAB+APK) | manual only, owner-confirmed | about 12 min | Fails first, before any build, if signing is not configured. |
| `ci.yml` | pull requests into `main`, not for docs-only PRs | about 6 min | Pre-merge gate; PRs into the live line do not run it. |
| `prune-artifacts.yml` | weekly + manual (was daily + after every APK build) | about 1 min | Keeps the newest 6 artifacts, never deletes one under 3 days old. Scheduled workflows run from the default branch (`main`). |

Release safety is unchanged: signing verification, the runtime-bump guard, the "never go backwards" ancestry check, the page-size budget, the placeholder refusal and the 16 KB / target-API / package gate are all still enforced.

## Getting an artifact when one is genuinely needed

Put `[build-apk]` in the commit message of a commit on `claude/hold-api36-migration` or `claude/hold-candidate-next` (after local validation). One build per candidate SHA: reuse the artifact (name, SHA-256, run id in the handoff) instead of rebuilding.
