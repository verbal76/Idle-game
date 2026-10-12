# Controller, keyboard and button prompts

Status: implemented and tested in software (unit tests, a headless gameplay-equivalence test, and a
Playwright run against a **simulated** gamepad). **Not yet tested on physical controllers or a Steam
Deck** (see "What is not verified"). Touch on Android is unchanged.

One rule governs everything here: **controllers and the keyboard produce the same actions the touch
controls already produce. No gameplay changed, no mechanic or difficulty was added.**

## 1. What the touch controls do today (the reference)

| Touch control | Action | Behaviour (unchanged) |
| --- | --- | --- |
| Steering strip, position from the centre | **steer** (analog -1..1) | dead zone 0.07, full steering at 0.62, curve 1.35 (`src/input/steerMap.ts`); in the air the same input spins the board |
| Steering strip, outer ends (>= 0.8, released below 0.66) | **carve** | deeper lean (~40% more), faster response, and the **back-flip modifier** (FLIP while carving = back flip) |
| JUMP (hold) | **jump** | hold to charge, release to launch; every jump needs a fresh press (`game/jumpCharge.ts`) |
| FLIP (hold) | **flip** | front flip; with carve held = back flip |
| Pause button / Android Back | **pause** | opens the pause menu; Back again resumes; sub-panels take their own Back |
| Menus | tap | every control is a normal button / slider / toggle; each screen marks its Back/Cancel with `data-back` |

The game reads exactly four inputs per frame (`GameInput` in `src/scene/Game.ts`): `leftStick().x`,
`forwardHeld()` (carve), `jumpHeld()`, `flipHeld()`. There is no camera control, no second analog axis
and no other action, so the right stick has no job and is not mapped.

## 2. Mapping (every action to every input)

### In a run

| Action | Gamepad (standard mapping) | Keyboard | Touch |
| --- | --- | --- | --- |
| Steer | **Left stick X** (dead zone 0.14, rescaled; a full throw = the strip at 0.75) or **D-pad left/right** | Left/Right or A/D | steering strip |
| Carve (and back-flip modifier) | **LB** or **LT** (held) | Shift, Up or W | strip's outer ends |
| Jump (hold to charge, release to launch) | **South** (A / Cross / B on Switch) or **RT** | Space | JUMP |
| Flip | **West** (X / Square / Y on Switch) or **RB** | F | FLIP |
| Pause / resume | **Start** (Menu / Options / Plus) | Esc or P | pause button |
| Back (same as Android Back) | **East** (B / Circle / A on Switch) | Esc | Android Back |
| Right stick, North, Select, L3, R3 | (nothing: no action exists for them) | | |

Why the stick never auto-carves: on touch, carve is the outer zone of the strip; with a stick that would
make a hard push carve by accident. A full stick throw maps to strip position 0.75 (full steering, below
the 0.8 carve threshold) and carve is its own button. The *combination* (stick + carve + flip) produces
exactly the same four inputs touch produces.

### In menus, overlays and the pause menu

| Action | Gamepad | Keyboard |
| --- | --- | --- |
| Move focus | D-pad or left stick (dominant axis; holds repeat after 380 ms, then every 130 ms) | Arrow keys or W/A/S/D |
| Select / press | **South** | Enter or Space (the browser presses the focused control) |
| Adjust a slider | Left / Right (steps of 5%) | Left / Right |
| Back / Cancel | **East** (the same `handleBack` the Android button uses) | Esc |
| Pause / resume | **Start** | P |

Rules: up/down wrap (a list never dead-ends); a screen that is only text scrolls with up/down; the first
press on a screen with no focus only shows the focus ring (it never presses anything); Back at a root
screen (main menu, launch prompt) does nothing on a pad (it never exits the app); typing in a text field is
never intercepted.

## 3. Shared action layer

```
touch (SteerStrip, ActionButtons)  --\
keyboard (KeyboardSource)           ---+--> createGameInput() --> GameInput --> Game (unchanged)
gamepad (InputHub, 1 poll / frame)  --/
gamepad + keyboard nav events --> MenuNav --> element.click() / slider input / handleBack()
```

* `src/input/actions.ts`: the action vocabulary and the button/key tables (one place to read the mapping).
* `src/input/gamepad.ts`: pure functions: dead zone, stick to strip position (reuses `steerFromPosition`),
  family detection from `Gamepad.id`, hold repeat.
* `src/input/hub.ts`: polls `navigator.getGamepads()` per frame; hot connect/disconnect; hot-swap between
  pads; edge events for menus; suppression (below).
* `src/input/keyboard.ts`: the keyboard as a third source.
* `src/input/mux.ts`: **`leftStick()` returns the touch strip's own object whenever no other source is
  steering**, so a phone behaves byte-for-byte as before; a thumb on the strip wins steering if both are
  active; buttons OR together.
* `src/input/menuNav.ts`: spatial focus movement over the *existing* DOM (no menu was rewritten), focus
  repair after a screen swap, visible focus ring only for pad/keyboard users.
* `src/input/system.ts`: the single owner, created once at boot; the run registers three hooks
  (`inPlay`, `menu`, `padLost`).

**Held-button suppression.** The South press that chooses "Downhill" or "Resume" is still down when the
run takes over. `releaseAll()` (run start, resume, any overlay closing) marks every currently-held pad
button and key as ignored until it is released, so a menu confirm can never start a jump charge. Steering
is never suppressed.

**Hot connect / disconnect.** A pad is picked up the moment the browser reports it; the press that woke it
is a baseline, not a menu action. If the pad in use disconnects mid-run the run **pauses** (so it can be
reconnected); a touch player with a stray pad is never paused. All held state is cleared on disconnect.

**Focus regain.** `window` focus re-polls the pad and repairs focus; blur releases held controls (the
existing behaviour); sleep/lock on desktop pauses the run (see section 6).

## 4. Button prompts and glyphs

Source of the artwork: the owner-supplied pack (`Source.zip`, "Input Prompts" by JulioCacko; store listing
screenshot shows CC0 1.0 for assets, MIT for code, 128x128 px). 48 files of it are copied **byte for byte**
to `src/assets/glyphs/<family>/<slot>.png` by `scripts/import-glyphs.mjs`; `src/assets/glyphs/glyphs.json`
records the archive SHA-256, each file's source path and SHA-256, and `"modified": false`. A unit test
re-hashes every shipped file.

| Prompt style | Artwork | Notes |
| --- | --- | --- |
| Xbox | `XGamepad/Default` coloured A/B/X/Y, LB/RB/LT/RT, D-pad, L stick | **Menu** exists only inside `T_X_Sprite.png` (cell at 0,1680): shown by a CSS crop of the unedited sheet |
| PlayStation | `P5Gamepad/Default` Cross/Circle/Square/Triangle, L1/R1/L2/R2, Options | |
| Switch | `SGamepad/Default`: **position-based**, so South = B, East = A, West = Y, North = X | Plus for Start |
| Steam Deck | Xbox-layout artwork | the pack has no Deck set; Deck face buttons are Xbox-positioned |
| Keyboard | `Keyboard_Mouse/White` | arrows, Space, Shift, F, Esc, Enter |
| Touch | none | the prompt bar is hidden for touch |

* **Auto-detect** (default): the last device *deliberately* used wins (a button press, a key, a tap; stick
  drift and mouse movement do not count). The pad family comes from `Gamepad.id` (Microsoft 045e, Sony
  054c, Nintendo 057e, Valve 28de); an unknown pad shows the Xbox layout.
* **Manual**: Settings > Button prompts cycles Auto / Xbox / PlayStation / Switch / Steam Deck / Keyboard.
  The row appears only for pad/keyboard users and the choice is a device preference in `localStorage`
  (`wtb.promptStyle`), not part of any profile save. It never forces prompts onto a touch screen.
* **No flicker under mixed input**: after the prompts change source they hold for 700 ms
  (`PROMPT_DWELL_MS`); the bar re-renders only when its content would change.
* The bar shows Move/Select/Back in menus, + Adjust on a slider, and Steer/Jump/Flip/Carve/Pause in a run.

**License verification still required.** The archive contains **no license file**. The only evidence is the
owner's screenshot of the store listing (CC0 1.0 assets, MIT code). Before any public release the owner must
confirm the license on the original download page and keep a copy of that page; attribution is not required
by CC0 but is courteous. `docs/THIRD_PARTY_ASSETS.md` records this as an open item.

## 5. Page budget

The glyphs add about 0.3 MB of base64 to the single inline page (`dist/index.html` was 6.72 MB with them,
budget 7.5 MB, hard failure on Android near 10 MB). Only the slots actually used are shipped.

## 6. Desktop shell (Electron) and Steam Deck

* `desktop/preload.js` exposes `window.wtbDesktop = { platform, steamDeck, quit() }` and nothing else
  (context isolation and sandbox stay on). "Quit game" calls it on desktop (it posts `quit:app` on Android).
* `SteamDeck=1` in the environment (Steam sets it on a Deck) or `WTB_FULLSCREEN=1` / `--fullscreen` starts
  full screen; F11 toggles. Windowed default is 1280x800 (16:10).
* Suspend / screen lock are forwarded to the page as `wtb-suspend`: the run pauses and saves, exactly like
  backgrounding on Android. Resume does not auto-unpause.
* A Deck starts with Xbox-layout prompts; keyboard-only desktops start with keyboard prompts.

## 7. What is verified, and what is not

Verified in software: the mapping tables; deterministic equivalence of rides driven by pad, keyboard and
the touch path (`src/scene/Game.controller.test.ts`: identical trajectory and scoring in Downhill and
Half-pipe); touch identity of `leftStick()`; hot connect/disconnect; repeat timing; focus movement and
wrapping; slider adjust; held-button suppression; prompt family selection, dwell, manual choice, storage;
glyph integrity; and a controller-only walk-through of the real built game with a simulated pad
(`npm run test:smoke:controller`: cold launch to profile creation, menus, Settings, a run with steer /
jump / flip / carve, pause/resume, disconnect, quit to menu, Half-pipe).

**Not verified (no hardware here):** physical Xbox / PlayStation / Switch / Steam Deck controllers,
Steam Input behaviour, rumble, analog-trigger feel and stick calibration on real hardware, Bluetooth
connect/disconnect on Android, suspend/resume on a real Deck, frame pacing and thermals on a Deck. A
simulated pad proves the software path only. Steam Deck Verified is **not** claimed.

Steam Input, Steam Cloud and SteamPipe depend on a Steamworks App that does not exist yet; no App ID
is assumed or invented anywhere in the repository.
