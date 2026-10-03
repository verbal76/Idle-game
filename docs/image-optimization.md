# Image optimization (proposal, nothing applied)

Decision: splash and gear art stay as supplied. After Babylon deep imports
the page is 5.80 MB (was 9.39 MB), so there is no size pressure.

| Asset | Now | Embedded (base64) |
| --- | --- | --- |
| `menu-bg.png` splash, 941x1672 RGB | 1.83 MB | 2.44 MB |
| gear, 1262x1246 RGBA | 1.08 MB | 1.44 MB |

If headroom is ever needed: quantize the splash to a 256-colour PNG or
WebP (about 70% smaller, check banding on the sky), and shrink the gear to
the largest size it is drawn at (about 256 px) keeping alpha. Together
about -3 MB of page. Originals stay in `src/assets/` untouched; any change
is an owner art-approval call.
