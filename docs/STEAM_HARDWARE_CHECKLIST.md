# Steam Deck / Steam Machine checklist (studio standard v2.0, section 12)

Sources: Valve's hardware recommendations and compatibility pages (https://partner.steamgames.com/doc/steamhardware/recommendations, .../compat). Status is stated from evidence only; nothing here claims Valve Verified. "Pending" means not performed.

| # | Requirement | Status | Evidence / note |
| --- | --- | --- | --- |
| 12.1 | Complete controller functionality (launch, menus, gameplay, pause, save/load, exit; no mouse/keyboard) | **FAIL** | Touch/pointer only; no gamepad, keyboard or Steam Input mapping. Default Steam Input "mouse" template could drive menus but not steering. Owner decision on the control scheme |
| 12.2 | Automatic Steam on-screen keyboard for text entry | **PENDING** | Profile names are typed in an HTML input; no Steamworks integration (`ShowFloatingGamepadTextInput`). Needs Steamworks |
| 12.3 | Mixed mouse + joystick camera input | NOT APPLICABLE | No free camera control |
| 12.4 | Camera sensitivity calibration | NOT APPLICABLE | Fixed follow camera; do not change camera feel |
| 12.5 | 1280x800, 16:10, 16:9, other ratios; readable handheld text; no clipped UI | **PARTIAL** | Page smoke covers 320 px portrait and 844x390 landscape; desktop window defaults to 1280x800 and the packaged Linux build booted at that size. Layout at 1280x800 not visually inspected on a device |
| 12.6 | Graphics API (Vulkan preferred) | UNVERIFIED | Chromium/Electron WebGL (ANGLE); Vulkan not tested; software GL only in CI |
| 12.7 | Portable codecs | PARTIAL | Music is MP3 (decoded by Chromium's bundled ffmpeg, present in both packages); playback not verified on Windows/Linux hardware |
| 12.8 | Graphics settings (Automatic/Quality/Cool) per device | NOT IMPLEMENTED | No graphics options exist |
| 12.9 | Offline single-player | PASS (design) / PENDING (Steam account test) | The game needs no network; update checks exist only on Android and fail gracefully. First launch on a fresh Steam account offline not tested |
| 12.10 | No external launcher | PASS | Direct launch into the game |
| 12.11 | Steam Deck performance measured | **PENDING** | No Deck available; no measurements exist |
| 12.12 | Suspend/resume, controller reconnect, extended play, clean exit | **PENDING** | Not performed. Clean exit and cold launch exercised headless on Linux only |
| 11 | Steam Cloud / save sync | **PENDING** | Not implemented; needs Steamworks credentials |
| 13 | Controller glyph library | **BLOCKED (scope)** | `Source.zip` inspected (docs/THIRD_PARTY_ASSETS.md); nothing to prompt until controller input exists |

Physical tests still required (owner, on a Deck/PC): launch from Steam, play a full run and a half-pipe run with a controller (after input exists), suspend/resume, Wi-Fi off launch, 1280x800 layout, frame pacing.
