-- Sound files for tracks. Staff upload them from each release page; everyone can play them.
-- Files live in the public "audio" bucket; app_docs collection "audio" holds one document per
-- track (id "<release id>_<position>") with the file's URL, so the site knows what to play.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', true, 524288000,
        array['audio/mpeg','audio/mp3','audio/mp4','audio/aac','audio/x-m4a','audio/flac','audio/x-flac','audio/wav','audio/x-wav','audio/wave','audio/ogg','audio/aiff','audio/x-aiff'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists audio_public_read on storage.objects;
create policy audio_public_read on storage.objects for select using (bucket_id = 'audio');
drop policy if exists audio_staff_write on storage.objects;
create policy audio_staff_write on storage.objects for insert with check (bucket_id = 'audio' and public.is_staff());
drop policy if exists audio_staff_update on storage.objects;
create policy audio_staff_update on storage.objects for update using (bucket_id = 'audio' and public.is_staff());
drop policy if exists audio_staff_delete on storage.objects;
create policy audio_staff_delete on storage.objects for delete using (bucket_id = 'audio' and public.is_staff());

-- The public site reads artwork overrides and the track sound-file list.
drop policy if exists app_docs_public_artwork on public.app_docs;
drop policy if exists app_docs_public_read on public.app_docs;
create policy app_docs_public_read on public.app_docs for select using (collection in ('artwork', 'audio'));
