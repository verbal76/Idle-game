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
| Controller glyph library "Input Prompts" by JulioCacko (`Source.zip`, SHA-256 `f6c75921...ded0`) | Asset license CC0 1.0 Universal, code MIT, per the owner's store-page screenshot (Unity Asset Store, published 2023-06-30, updated 2025-02-03, "no generative AI used") | Identified, not independently verified; the archive has no license file. Not imported (no controller input yet) |

Glyph archive contents (inspected, not committed): 1,633 files (1,580 PNG, 21 SVG), 128x128 px, families `Keyboard_Mouse` (505 PNG), `P4Gamepad` (315), `P5Gamepad` (315), `SGamepad` (230), `XGamepad` (215; Steam Deck ABXY prompts come from the Xbox family) in Default/Light/Alt/Alt 2/Retro (and Stylized/Vintage/Dark/White/Blanks) variants. Any future import must be a small curated subset loaded outside the inline page (page budget).
