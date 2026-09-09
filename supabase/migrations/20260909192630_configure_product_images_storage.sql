-- Product images are public assets. Object writes remain default-deny because
-- src/app/api/upload/route.ts uses the trusted server-side service-role client.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- A public bucket permits asset reads. Do not add client INSERT, UPDATE, or
-- DELETE policies: service-role server code bypasses RLS while client mutation
-- remains denied by default.
