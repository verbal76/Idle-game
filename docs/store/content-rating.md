# IARC content-rating questionnaire inputs

Play Console -> App content -> Content rating. The questionnaire is answered by the owner; these are the facts from the game, ready to tick against each question. The final rating comes from IARC, not from this document. Re-check if features change.

Category to pick in the questionnaire: **Game** (not social/communication).

## Facts about the game

- Cartoon / low-poly snowboarding. Player rides, jumps, does flips and spins.
- "Bad" outcomes: hitting a rock ends a run (a crash sound and short vibration, rider tumbles), a bad landing is a "bail" (a 1.5 s tumble, then recovery). Source: README tricks section, src/scene/Game.ts, src/audio/SoundFx.ts (`bail`, `crash` recipes).
- No blood, gore, injury text, weapons, enemies, fighting, or death. A grep of src for blood/injur/gore finds nothing in game text.
- No text chat, no user-generated content shared with others, no online features at all. The only free text the player enters is a local profile name (max 32 chars) that never leaves the device unless they paste it into an email.
- No real-money purchases, no loot boxes, no gambling or simulated gambling. "Snowflakes" are earned by riding; upgrades cost snowflakes (src/game/shop, README).
- No ads.
- No location sharing, no personal-info sharing with other users.
- No drugs, alcohol, tobacco, sexual content, nudity, profanity. Generated profile names are whimsical (e.g. "Stinky Donut", "Crusty Pickle"; list in src/util/whimsicalNames.ts, reviewed: no profanity). Players may type any name locally.
- The upgrade shop and daily/milestone rewards are standard in-game reward loops with in-game currency only.

## Questionnaire inputs

| Topic | Answer | Basis |
|---|---|---|
| Violence (any) | No. Optionally "cartoon crashes/falls, no injury shown" if the form asks about mild/slapstick | Tumbles only; no blood, no harm shown |
| Blood / gore | No | |
| Fear / horror | No | |
| Sexual content / nudity | No | |
| Profanity / crude humour | No (name generator uses food/animal/object words; wording is silly, not crude) | whimsicalNames.ts |
| Controlled substances (drugs, alcohol, tobacco) | No | |
| Gambling / simulated gambling / contests for money | No | |
| Users can interact or exchange content/chat | No | No online features |
| Shares user's location with other users | No | |
| Allows purchase of digital goods | No | No billing |
| Unrestricted web access | No | The WebView only shows the bundled game; `mailto:` links open the OS email app, other schemes are handed to the OS (src/shell/navigation.ts). No in-game browser or links to the web. |
| Contains ads | No | |
| Collects personal info (for the rating form) | Describe per data-safety.md; no accounts or personal info collected by the app | |

## Expected outcome (not guaranteed)

Likely lowest age bands: ESRB Everyone, PEGI 3, USK 0, IARC Generic 3+, ClassInd Livre. Confirm in Play Console; the owner must answer truthfully and submit.

## Target audience and Families Policy (separate Play Console declaration)

A low content rating does not decide the target-audience answer. The art style is cartoonish, so it may be seen as appealing to children. Options:
1. **13+ (or 18+), not directed at children**: simplest. The privacy policy and Data Safety then follow the general rules. Risk: Google may judge the app as appealing to children anyway.
2. **Includes children under 13**: Families Policy applies (restrictions on SDKs, identifiers, data collection, and an extra Families self-certification). The `EAS-Client-ID` and Expo update client would need review against the policy, and a privacy policy rated for children is required. OWNER TO DECIDE and keep the privacy policy consistent.

## Other declarations

- News app: No. COVID-19 app: No. Government app: No. Financial features: No. Health features: No.
- Data safety and privacy policy URL: see data-safety.md and privacy-policy-requirements.md.
