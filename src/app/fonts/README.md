# Local storefront fonts

The two runtime faces come from the user-supplied `fonts/` directory. Familjen now uses a format-only WOFF2 conversion; its original TTF remains here as retained source, not a runtime import. Root `fonts/` originals remain unchanged; no demo, italic, or static weight is added.

| Runtime file                              | Supplied source                                                           | Metadata                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `FamiljenGrotesk-VariableFont_wght.woff2` | `fonts/Familjen_Grotesk/FamiljenGrotesk-VariableFont_wght.ttf`            | Familjen Grotesk Regular; normal, variable weight 400–700 (default 400) |
| `MaisonNeueMono-Regular.woff2`            | `fonts/Maison Neue Mono/Web Fonts/63467b9cbd4a4d7eafb5e64946ecaa18.woff2` | Full name Maison Neue Mono; normal, weight 400                          |

Familjen Grotesk is the user-approved substitute for the reference F-Grotesk, not an exact typeface match. Its copyright and SIL OFL 1.1 are retained in `FamiljenGrotesk-OFL.txt`.

The maintainer confirmed rights to distribute Maison Neue Mono in this repository and use it as a webfont. This records the maintainer's confirmation, not an independent license audit or legal conclusion. The supplied demo includes a licensing caveat and an OnlineWebFonts attribution notice; it does not independently establish commercial embedding rights. The Familjen OFL does **not** apply to Maison.

`next/font/local` loads both faces in the root layout. Distinct generated CSS variables back the semantic sans/heading and mono aliases, plus the retained reference token names. The font's available variable range does not change the storefront's regular-400 typography. Weight, style, display, preload and metric-adjusted fallback configuration are unchanged.

## Familjen conversion provenance

Python fontTools with Brotli produced the verified 33,224-byte WOFF2 from the retained `FamiljenGrotesk-VariableFont_wght.ttf`, without subsetting. The separate semantic comparison passed for all 696 glyphs: coordinates, variations, cmap, metrics, variable axes/instances and name records. Unit tests guard configuration, the WOFF2 header and exact asset/license hashes; they do not repeat that semantic comparison or prove rendered equivalence.

Equivalent conversion command (documentation only; the trial copied the already-verified binary instead of regenerating it):

```sh
python -c 'from fontTools.ttLib import TTFont; f = TTFont("src/app/fonts/FamiljenGrotesk-VariableFont_wght.ttf"); f.flavor = "woff2"; f.save("src/app/fonts/FamiljenGrotesk-VariableFont_wght.woff2")'
```

Trial copy: `cp /tmp/clubvtg-perf-FamiljenGrotesk.woff2 src/app/fonts/FamiljenGrotesk-VariableFont_wght.woff2`. Source and destination SHA-256: `bf73b8a8d6c6336d234c3beafd20cf3e8b2e95eaeb1463e22b117c0087b49fa3`.

The conversion remains under the retained Familjen SIL OFL 1.1; the original TTF and license are unchanged.

## Verified browser AFTER

Independent verification received HTTP 200 `font/woff2`: 33,224 body bytes, no Content-Encoding, and the same SHA-256 as the copied asset. With mono unchanged at 16,296 bytes, measured encoded font bodies total 49,520 bytes versus 59,153 BEFORE: 9,633 fewer bytes (16.28% total; 22.48% Familjen).

Both fonts loaded with swap, preloads, fallback metrics and weights unchanged. Desktop/mobile home hardloads recorded CLS 0 and no overflow; search, filters, product navigation and cart/focus checks passed. Available BEFORE text-range width/height samples matched AFTER, but sampling is limited, not full pixel-equivalence proof.

Reload ResourceTiming was cached (transferSize/duration 0), not cold timing evidence. Explicit GET probes recorded 33,524/16,596 transfer bytes and 4.6/2.8 ms for Familjen/mono; these are neither normal-page measurements nor comparable cold-load timings. The byte reduction does not establish an LCP or loading-speed improvement.
