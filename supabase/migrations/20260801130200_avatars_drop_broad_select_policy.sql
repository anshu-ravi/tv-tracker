-- Public buckets serve objects by URL regardless of RLS SELECT policies, so a
-- broad SELECT policy only adds file-listing exposure. Drop it (advisor
-- 0025): avatar URLs keep working; clients can no longer enumerate the bucket.
drop policy if exists "avatars_public_read" on storage.objects;
