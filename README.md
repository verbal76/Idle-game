# Idle-game

Android stylized snowboarding game with two modes:

- **Half-pipe** — active twin-stick gameplay. Left stick steers, right-stick
  flick gestures execute spins / flips / grabs. The only on-screen button is
  pause.
- **Downhill** — idle/tap clicker. The rider auto-descends a procedural
  mountain. Tap-jump and right-stick flips are the only interventions; the
  run continues until you fall.

Runs are continuous — there is no restart button. A run ends when the rider
falls; the summary shows banked currency and returns to the main menu.

## Tech

- **Unity 6 LTS** with URP mobile renderer
- Android phone, ARM64, IL2CPP, landscape locked
- Local-only profiles (multiple) with JSON saves under `Application.persistentDataPath`

## Getting started

1. Install **Unity 6 LTS (6000.0.x)** with the **Android Build Support** module
   (NDK + JDK + SDK).
2. Clone the repo. Make sure `git lfs` is installed before pulling.
3. Open the project in Unity Hub. The first open will regenerate `.meta`
   files and resolve packages — commit those changes back.
4. **Edit › Project Settings › Player › Android**:
   - Default Orientation: **Landscape Left**
   - Use Animated Auto-Rotation: **off**, only Landscape Left + Right enabled
   - Scripting Backend: **IL2CPP**
   - Target Architectures: **ARM64** only
   - Minimum API Level: **26 (Android 8.0)**
5. **Edit › Project Settings › Quality**: tune mobile tier, disable MSAA,
   enable sustained-performance mode.
6. Switch platform to Android and **File › Build & Run** to a connected
   device.

## Branch policy

All active development happens on `claude/android-snowboarding-game-UHUPI`
until the v1 skeleton lands.

## Project layout

```
Assets/_Project/Scripts/
  Core/        bootstrap, scene routing, service locator
  Profiles/    local profile system + JSON save store
  Input/       twin-stick provider + right-stick flick recognizer
  Player/      rider controller, physics, trick resolver, ragdoll
  World/       chunk streamer + half-pipe / downhill generators
  Modes/       run state machine + per-mode logic
  Scoring/     score, combos, trick dictionary
  Idle/        currency + unlock services
```

See `/root/.claude/plans/i-want-to-start-smooth-fairy.md` for the full v1 plan.
