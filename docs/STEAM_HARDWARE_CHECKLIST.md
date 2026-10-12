# Steam Deck / Steam Machine checklist (studio standard v2.0, section 12)

Sources: Valve's hardware recommendations and compatibility pages (https://partner.steamgames.com/doc/steamhardware/recommendations, .../compat). Status is stated from evidence only; nothing here claims Valve Verified. "Pending" means not performed.

| # | Requirement | Status | Evidence / note |
| --- | --- | --- | --- |
| 12.1 | Complete controller functionality (launch, menus, gameplay, pause, save/load, exit; no mouse/keyboard) | **IMPLEMENTED, simulated-pad verified; hardware PENDING** | Standard-mapping gamepad + keyboard drive every screen and every gameplay action (docs/controller-input.md). A scripted simulated pad walks the real build from cold launch (profile creation) through menus, Settings, a run, pause/resume, disconnect, Half-pipe and quit (`npm run test:smoke:controller`); a deterministic test proves pad/keyboard rides equal the touch-path ride. No physical controller, Steam Input config or Deck has been used |
| 12.2 | Automatic Steam on-screen keyboard for text entry | **PENDING** | Profile names are typed in an HTML input; no Steamworks integration (`ShowFloatingGamepadTextInput`). Needs Steamworks. Controller-only players can still create a profile with the suggested random name ("Use this") and Reroll |
| 12.3 | Mixed mouse + joystick camera input | NOT APPLICABLE | No free camera control |
| 12.4 | Camera sensitivity calibration | NOT APPLICABLE | Fixed follow camera; do not change camera feel |
| 12.5 | 1280x800, 16:10, 16:9, other ratios; readable handheld text; no clipped UI | **PARTIAL** | Page smoke covers 320 px portrait and 844x390 landscape; the controller smoke runs the whole game at 1280x800 (screenshots reviewed, not on a device). Desktop window defaults to 1280x800; a Steam Deck (`SteamDeck=1`) or `WTB_FULLSCREEN=1` starts full screen. Not inspected on a Deck panel |
| 12.6 | Graphics API (Vulkan preferred) | UNVERIFIED | Chromium/Electron WebGL (ANGLE); Vulkan not tested; software GL only in CI |
| 12.7 | Portable codecs | PARTIAL | Music is MP3 (decoded by Chromium's bundled ffmpeg, present in both packages); playback not verified on Windows/Linux hardware |
| 12.8 | Graphics settings (Automatic/Quality/Cool) per device | NOT IMPLEMENTED | No graphics options exist |
| 12.9 | Offline single-player | PASS (design) / PENDING (Steam account test) | The game needs no network; update checks exist only on Android and fail gracefully. First launch on a fresh Steam account offline not tested |
| 12.10 | No external launcher | PASS | Direct launch into the game |
| 12.11 | Steam Deck performance measured | **PENDING** | No Deck available; no measurements exist |
| 12.12 | Suspend/resume, controller reconnect, extended play, clean exit | **PENDING (hardware); software paths implemented** | Controller hot connect/disconnect (pause on loss mid-run), focus repair, held-button suppression, a `wtb-suspend` pause hook (Electron powerMonitor suspend/lock) and a clean "Quit game" exit exist and are tested in software. Real suspend/resume, Bluetooth reconnect and extended play are not performed |
| 11 | Steam Cloud / save sync | **PENDING** | Not implemented; needs Steamworks credentials |
| 13 | Controller glyph library | **IMPLEMENTED; license confirmation PENDING (owner)** | 48 unmodified glyphs from the owner's pack (Xbox, PlayStation, Switch, keyboard; Deck uses Xbox-layout art) with per-file SHA-256; auto family detection, manual choice in Settings, no flicker under mixed input. The archive carries no license file: confirm CC0 on the original page (docs/THIRD_PARTY_ASSETS.md) |

Physical tests still required (owner, on a Deck/PC): launch from Steam, play a full run and a half-pipe run with a real controller (Xbox, PlayStation, Switch Pro and the Deck's own controls), stick dead zone and trigger feel, suspend/resume, Bluetooth disconnect/reconnect, Wi-Fi off launch, 1280x800 layout and text legibility, frame pacing and thermals. Steam Input, Steam Cloud and SteamPipe wait on a Steamworks App; no App ID exists or is assumed. Steam Deck Verified is not claimed.
