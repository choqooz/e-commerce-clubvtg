# Transactional email branding and app icons

## Email mark and fallback

`EmailBrand` is shared by receipt and dispatch emails, independently of the UI `BrandMark`.
It serves `public/branding/clubvtg/clubvtg-horizontal-black-512.png`, a transparent 512 × 179 PNG.
HTML retains intrinsic dimensions and displays the image at 180px wide with automatic height.
The image URL is absolute, resolved at render time through `getPublicAppOrigin()`.
Set `NEXT_PUBLIC_APP_URL` to the public HTTPS origin in production, without credentials, path, query, or fragment.
Production rejects missing or invalid origins and local, private, or recognized tunnel hosts; there is no production localhost fallback.
Email uses neither inline SVG nor an image-optimization URL or embedded data image.
When remote images are blocked, visible text still reads “ClubVTG — Información de tu pedido”.
Order details, amounts, tracking information, and the message heading remain text, not image content.

## Icons and manifest

Next file conventions own `src/app/favicon.ico`, `icon.svg`, `apple-icon.png`, and `manifest.webmanifest`.
The ICO contains the approved small symbol in 16px, 32px, and 48px PNG frames.
The SVG adapts its fill to light/dark preference; the Apple icon is 180 × 180.
The manifest references `icon-192.png`, `icon-512.png`, and `maskable-512.png` under `/branding/clubvtg/`.
Only the maskable icon declares `purpose: "maskable"`; preserve the approved asset bytes.
Do not add competing public-root icons or manual icon/manifest metadata links.

## Verification and production limits

Run `npm test -- --no-cache src/components/emails/email-brand.test.tsx src/components/brand-icons.test.ts`.
Tests check asset hashes/dimensions, rendered email text/URLs, origin rejection, and icon conventions.
They do not prove live email delivery, inbox rendering, public asset reachability, installed-app behavior, or production deployment.
Before release, verify the deployed PNG/icon URLs and inspect real-client rendering with images enabled and blocked.
