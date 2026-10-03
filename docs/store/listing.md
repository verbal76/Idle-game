# Play Store listing drafts - Where's the Bottom?

Derived from the code at the repo HEAD (README.md, src/ui/*, src/game/*). Every feature below exists in the current build. Items marked OWNER TO CONFIRM cannot be verified from the repo.

## Title (max 30 chars)

**Where's the Bottom?** (19 chars)

## Short description (max 80 chars)

Pick one:

1. `Low-poly snowboarding: carve, jump, flip and chase the bottom of the mountain.` (78)
2. `An arcade snowboard game: carve, flip, land tricks and upgrade your rider.` (74)

## Full description (max 4000 chars)

```
Where's the Bottom? is a low-poly snowboarding arcade game for Android. Carve down an endless mountain, launch off kickers, land flips and spins, and spend the snowflakes you earn on upgrades.

TWO WAYS TO RIDE

Downhill - an endless, procedurally generated mountain with changing slopes, cliff drops, rocks, trees and kickers. Your rider keeps cruising while you steer, carve, jump and flip. Hit a rock and the run is over, so pick your line. You earn 1 snowflake for every 50 metres, plus tricks.

Half-pipe - an active bowl with speed strips, rings and lips that bounce you back in. Chain tricks, keep your ring streak alive and build a big combo.

EASY TOUCH CONTROLS

Big on-screen buttons: steer left and right, hold CARVE for a tighter turn, hold JUMP to charge and release to launch, and FLIP for a front flip (FLIP + CARVE for a back flip). In the air, steering spins your board. Plays in portrait or landscape.

TRICKS THAT PAY

- Flips and spins earn snowflakes.
- Land clean for full pay. Land sketchy and you keep riding but lose speed. Land badly and you bail.
- Ride switch for bonus pay on switch spins.
- Combine a flip and a spin in one jump for a cork bonus.
- Chain clean landings to build your combo multiplier.

PROGRESSION

- Ten upgrades: Top Speed, Jump Power, Edge Grip, Charge Rate, Spin Speed, Flip Speed, Flake Bonus, Ring Magnet, Combo Window and Grace.
- A summary after every run shows where your snowflakes came from, with NEW BEST badges for personal records.
- 15 one-time milestones and 3 daily challenges per day (plus a bonus for finishing all three).
- A Stats screen with your records and lifetime totals.

YOUR SAVE STAYS ON YOUR DEVICE

- Several local rider profiles on one device, each with its own progress.
- If the app is closed or crashes mid-run, you can collect that run the next time you open the game.
- No account or sign-in. Progress is stored on your phone.

NO ADS. NO IN-APP PURCHASES.
Snowflakes are earned by riding only and cannot be bought.

SETTINGS
Separate music and sound-effect volume, vibration on/off, skip track, and a built-in way to send a bug report or feature request by email.

Made by Hot Attic Games. We would love to hear what you think.
```

(The block above is about 2,200 characters, under the 4,000 limit. Re-check the count in Play Console after editing.)

Notes for the owner:
- Do NOT add "original soundtrack", "royalty-free music" or similar until the music provenance blocker is resolved (see SUMMARY.md).
- "No ads, no in-app purchases" is true for this build: no ad or billing library is in package.json, and no purchase code exists. Re-check before each release. OWNER TO CONFIRM that this will stay true at launch.
- The game checks for over-the-air updates. This is covered in the Data Safety and privacy policy documents, not in the store description.
- Do not make "works offline" a headline claim without testing. The game code makes no network calls itself and the music is bundled, so it should play offline, but the shell contacts Expo's update server whenever it is online. OWNER TO CONFIRM by testing a fresh install in airplane mode.

## Release notes (first version, max 500 chars per language)

```
First release! Ride an endless low-poly mountain or take on the half-pipe. Carve, jump, flip and spin, earn snowflakes, and upgrade your rider. Includes daily challenges, milestones, stats, and multiple local profiles.
```

## Category and tags

- Application type: Game
- Category: **Sports** (primary suggestion). Alternative: Arcade. Sports fits snowboarding; Arcade fits the trick-chain loop. Pick one in Play Console.
- Tags (Play Console offers a fixed list; choose the closest available): Arcade, Sports, Racing / Skiing & snowboarding if offered, Casual, Single player, Offline.
- Contact details required in Play Console: email (hotatticgames@gmail.com is the address in src/util/bugReport.ts - OWNER TO CONFIRM that this is the address to publish; it will be public), website (optional), phone (optional for most accounts).

## Things not to claim

- No "free of third-party code": the app uses Expo, React Native, Babylon.js (licences not reviewed here).
- No "kid-safe" or "family" claims (see content-rating.md and data-safety.md for the target-audience decision).
- No leaderboards, multiplayer, cloud save, controller support: none exist in the code.
