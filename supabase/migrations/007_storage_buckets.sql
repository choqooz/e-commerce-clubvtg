-- Create storage buckets for AI try-on
INSERT INTO storage.buckets (id, name, public) VALUES ('user-uploads', 'user-uploads', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('ai-results', 'ai-results', false);

-- RLS: authenticated users can upload to their own folder
CREATE POLICY "Users can upload own photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'user-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

-- RLS: authenticated users can read their own uploads
CREATE POLICY "Users can read own uploads"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'user-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

-- RLS: authenticated users can read their own AI results
CREATE POLICY "Users can read own AI results"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'ai-results' AND (storage.foldername(name))[1] = auth.uid()::text);
