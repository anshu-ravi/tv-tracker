-- Public 'avatars' bucket for the single user's profile photo. Public read so
-- the stored avatar_url renders without signed URLs; writes limited to
-- authenticated (single-user app, same rationale as the catalog write policies).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_authenticated_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars');

create policy "avatars_authenticated_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars')
  with check (bucket_id = 'avatars');

create policy "avatars_authenticated_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars');
