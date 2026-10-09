# Category-entry image provenance

## Bundled illustrative photograph

- Local file: `clothing.jpg`.
- Title: **2008 Taipei In Style Outdoor Fashion Show Clothes Racks**.
- Creator: **Rico Shen**, verified in Wikimedia Commons' file-specific
  `imageinfo.extmetadata.Artist` and `Attribution` fields; credit links to the source in the UI.
- Source page:
  https://commons.wikimedia.org/wiki/File:2008_Taipei_In_Style_Outdoor_Fashion_Show_Clothes_Racks.jpg
- Download URL:
  https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a7/2008_Taipei_In_Style_Outdoor_Fashion_Show_Clothes_Racks.jpg/1280px-2008_Taipei_In_Style_Outdoor_Fashion_Show_Clothes_Racks.jpg
- Retrieved (UTC): **2026-10-05T22:12:01.490723+00:00**.
- Observed response: **HTTP 200**, **image/jpeg**, **320114 bytes**.
- Decoded dimensions: **1280 × 960** (verified with the installed `sharp` decoder).
- SHA-256: `6b2ee920da9c12e29fac2214353dc8eb099456f83e16792798ed5a1df61873dd`.
- Visual inspection: a rack of hanging garments, without people; suitable as generic clothing imagery.
  It does not depict ClubVTG inventory or assert any category's availability.

### License and modifications

- File-specific license: **CC BY-SA 4.0**, verified in Commons' metadata
  (`LicenseShortName`, `LicenseUrl`, `UsageTerms`, `AttributionRequired`).
- License URL: https://creativecommons.org/licenses/by-sa/4.0/
- Primary deed retrieved successfully via Node fetch (HTTP 200) on 2026-10-05:
  https://creativecommons.org/licenses/by-sa/4.0/deed.en
  (the preceding Python request to the canonical URL returned 403).
- Observed conditions: sharing and adaptation, including commercial use, are permitted;
  appropriate credit, a license link and disclosure of modifications are required.
  Adaptations must use the same license, with no additional restrictions.
  The deed warns that other rights may still apply and that no warranties are given.
- This bundled thumbnail and its display crops are offered under **CC BY-SA 4.0**.
  The downloaded thumbnail bytes are unchanged; CSS uses differing cover crops per tile.
  Visible source/creator/license links and `Recortes de encuadre` disclose this use.
  No endorsement by the photographer is claimed.

The Commons metadata was retrieved with one bounded public `imageinfo` query for
`File:2008 Taipei In Style Outdoor Fashion Show Clothes Racks.jpg`. No account,
authenticated API, application server or product database was accessed.

## Unsplash candidate: inspected but not bundled

- Candidate:
  https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=1200&q=85&fit=crop
- Observed: HTTP 200, image/jpeg, 105255 bytes, 1200 × 800;
  visual inspection showed hanging shirts.
- Primary license URL: https://unsplash.com/license
- The parent retrieved this primary page via **Firecrawl** on 2026-10-05,
  scrape receipt `01a10e1c-4a28-7708-bedf-90147dbdf7c8`, despite the earlier direct 401 responses.
- Parent-provided observed terms: free commercial/noncommercial downloading and use,
  no permission required, attribution appreciated but not required; irrevocable,
  nonexclusive worldwide copyright permission to download, copy, modify, distribute,
  perform and use. Selling unmodified images and compiling a competing service are prohibited.
- This general license verification did not verify this particular asset's author or free/paid
  status. Bounded source-page/metadata requests returned 401. The candidate was therefore
  replaced by the file-specifically licensed Commons photograph above; no Unsplash+ permission
  or author was inferred, and no Unsplash photograph remains bundled.

## Display policy

Prefer the first usable photo from a matching available product in the initial catalog data,
independently of the active filters. Exact category comparisons are unchanged.
For a category without a matching cover, distribute available initial-product photos
deterministically, using distinct URLs before repeating where possible. These covers carry
**Imagen ilustrativa · otra categoría**; they do not reclassify products or assert stock.
Only when no available product has a usable local/HTTPS cover, use the bundled rack photograph
with **Imagen ilustrativa** and visible Rico Shen/source/license credit outside the grid.
Product photos do not inherit that photograph's CC BY-SA license or attribution.
If either a product cover or the local image fails to load, retain the truthful
**Imagen no disponible** neutral fallback, with no retry loop. No Glein photographs are used.

## Composition and navigation bounds

The six existing categories render in this DOM/mobile order: Tops, Outerwear, Accesorios,
Calzado, Bottoms, Knitwear. Desktop places the first short-wide tile on the left, the tall-wide
tile on the right, and the two small tiles below the short tile. The final pair forms a
wide/tall block; ClubVTG does not invent the additional categories/editorial stock on Glein.
Rows follow measured viewport ratios: 31.25vw desktop (four tracks), 62.5vw mobile (two),
with 10px gaps, no arbitrary height caps. At 1440px the first tiles are 715×450 and 715×910;
at 390px they are 390×243.75 and 390×497.5. The retained 768px breakpoint is an implementation
choice, not an independently measured reference breakpoint.

Home contains the mosaic and a compact all-products action, not a second legacy catalog.
Category entry and all-products open the redesigned collection on the same `/`, using
`#catalog`; browser hash/history navigation and a visible return-home action are supported.
Only subcategory resets on category selection; return-home preserves every filter. The collection
uses a compact category select, one filter sheet at all viewports, and a full-width photo grid.
Inter/IBM Plex Mono remain substitutes; header/footer fidelity is separate M6 work and browser
visual acceptance remains pending. No pixel-identity or runtime acceptance is implied.
