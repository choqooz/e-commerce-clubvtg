# Local storefront fonts

Only the two runtime faces are copied from the user-supplied `fonts/` directory. Originals remain unchanged; no demo, alternate format, italic, or static weight is bundled.

| Runtime file                            | Supplied source                                                           | Metadata                                                                |
| --------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `FamiljenGrotesk-VariableFont_wght.ttf` | `fonts/Familjen_Grotesk/FamiljenGrotesk-VariableFont_wght.ttf`            | Familjen Grotesk Regular; normal, variable weight 400–700 (default 400) |
| `MaisonNeueMono-Regular.woff2`          | `fonts/Maison Neue Mono/Web Fonts/63467b9cbd4a4d7eafb5e64946ecaa18.woff2` | Full name Maison Neue Mono; normal, weight 400                          |

Familjen Grotesk is the user-approved substitute for the reference F-Grotesk, not an exact typeface match. Its copyright and SIL OFL 1.1 are retained in `FamiljenGrotesk-OFL.txt`.

The maintainer confirmed rights to distribute Maison Neue Mono in this repository and use it as a webfont. This records the maintainer's confirmation, not an independent license audit or legal conclusion. The supplied demo includes a licensing caveat and an OnlineWebFonts attribution notice; it does not independently establish commercial embedding rights. The Familjen OFL does **not** apply to Maison.

`next/font/local` loads both faces in the root layout. Distinct generated CSS variables back the semantic sans/heading and mono aliases, plus the retained reference token names. The font's available variable range does not change the storefront's regular-400 typography.
