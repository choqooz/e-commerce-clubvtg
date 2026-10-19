# ClubVTG identity

Use the approved complete horizontal mark rather than rebuilding the wordmark as text.
The published assets are `public/branding/clubvtg/clubvtg-horizontal-black.svg`
and `public/branding/clubvtg/clubvtg-horizontal-white.svg`.
Both retain the intrinsic 554 × 194 proportions; select the appropriate tone without recoloring.

## Shared UI component

`src/components/brand-mark.tsx` exports `BrandMark` with `tone`, `alt`, and `className` props.
It defaults to black, `alt="clubvtg"`, and a 180px width with automatic height.
It uses unoptimized `next/image` so the approved SVG is served directly.
Preserve the complete artwork: do not crop, stretch, apply filters, or recreate its lettering.
Header, footer, and desktop/mobile administration share this component.
Header and footer home links carry “clubvtg — Inicio” and use an empty image alt to avoid duplication.
The administration label “Admin” stays separate from the mark; the mark is not a page heading.

## Clerk sign-in

The root `ClerkProvider` supplies the black SVG to both modal and standalone sign-in.
Its shared logo box is centered with `alignSelf: "center"` and `marginInline: "auto"`.
The box is 180px wide, constrained to its container, with a 554 / 194 aspect ratio.
The image keeps automatic height and no maximum-height crop; route overrides inherit these settings.
Existing localization, sign-out destination, and managed authentication controls remain unchanged.

## Verification

Run `npm test -- --no-cache src/components/brand-mark.test.tsx src/components/navigation-storefront-presentation.test.tsx src/components/storefront-chrome.test.tsx`.
The tests use published SVGs, not a local branding archive; email PNGs and browser icons are not required.
Check actual modal and standalone sign-in at mobile and desktop widths separately from shallow tests.
