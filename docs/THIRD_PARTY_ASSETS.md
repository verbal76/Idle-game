# Third-party assets and licenses

Code dependencies: THIRD_PARTY_NOTICES.md (generated from package metadata; Electron, used only by the desktop shell, is MIT with Chromium's bundled licenses in `LICENSES.chromium.html` inside each package; its notice is not yet in THIRD_PARTY_NOTICES.md).

| Asset | Source / license | Status |
| --- | --- | --- |
| Fredoka, Lilita One fonts | SIL OFL 1.1 (texts in `src/assets/fonts/OFL-*.txt`) | Verified in repository; not shown in-app |
| Kenney models | CC0 per Kenney's site; source not recorded | Identified, unverified |
| Rocks / flowers / props `*.stl` | unknown | Missing evidence: owner |
| Music (3 MP3s) | ID3 "made with suno"; plan/license not documented | Missing evidence: owner (commercial risk) |
| Menu art, splash art, gear icon | "supplied" | Missing evidence: owner |
| Hot Attic Games logo | studio-owned | Verified |
| Controller glyph library "Input Prompts" by JulioCacko (`Source.zip`, SHA-256 `f6c75921...ded0`) | Asset license CC0 1.0 Universal, code MIT, per the owner's store-page screenshot (Unity Asset Store, published 2023-06-30, updated 2025-02-03, "no generative AI used") | **Shipped** (48 unmodified PNGs, `src/assets/glyphs/`, manifest with per-file SHA-256: `glyphs.json`). License identified from the screenshot only; **the archive has no license file, so the owner must confirm CC0 on the original download page and keep a copy before any public release** |

Glyph archive contents (inspected, not committed): 1,633 files (1,580 PNG, 21 SVG), 128x128 px, families `Keyboard_Mouse` (505 PNG), `P4Gamepad` (315), `P5Gamepad` (315), `SGamepad` (230), `XGamepad` (215; Steam Deck ABXY prompts come from the Xbox family) in Default/Light/Alt/Alt 2/Retro (and Stylized/Vintage/Dark/White/Blanks) variants. Imported subset: the face buttons, bumpers/triggers, D-pad, left stick and Start/Menu for Xbox, PlayStation and Switch (Switch is position-based) plus nine keyboard keys, copied byte for byte by `scripts/import-glyphs.mjs`; Xbox Menu exists only in `T_X_Sprite.png` and is shown by a CSS crop of that sheet. The pack has no Steam Deck family: the Deck uses the Xbox-layout artwork. The subset is inlined in the page (~0.3 MB base64; page is 6.72 MB of the 7.5 MB budget). See docs/controller-input.md.
