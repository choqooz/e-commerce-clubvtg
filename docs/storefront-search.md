# Storefront search

The expandable header form submits “Buscar prendas” to the catalog.
Search runs locally over the products supplied to `CatalogContent`; it adds no search API.

## Matching and filter boundaries

- Matching is a trimmed, case-insensitive substring of title, brand, or description.
- Input is literal text, not a regular expression; blank input leaves results unfiltered.
- Category selection narrows products first, then existing filters, then text search.
- Search does not change filter counts or the category-scoped filter options.
- “Limpiar búsqueda” removes only the query; “Limpiar filtros” preserves the query.
- Category changes preserve search and other filter dimensions, clearing only subcategory.
- Result counts include the query, and empty results explain the current category/filter scope.

## URL and navigation

`/?q=lino#catalog` opens search results; `category` can further narrow the selection.
Submitting on `/` preserves category and unrelated query parameters, including repeated values.
Submitting from another route starts a catalog URL without that route's parameters.
Local submissions use native history and notify the shared collection subscription.
Back/Forward restores URL query and category; filter selections remain component state, not URL state.
A query alone without `category` or `#catalog` does not replace the home category entry.

## Verification

Run `npm test -- --no-cache src/lib/catalog-search.test.ts src/components/catalog-business-components.test.tsx src/components/navigation-storefront-presentation.test.tsx`.
These tests cover matching, URL boundaries, and filter composition; shallow navigation mocks do not prove mounted browser focus.
