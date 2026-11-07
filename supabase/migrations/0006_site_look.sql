-- Look and feel set by admins in the back office (collection "site", document "look"):
-- background colours, logo colours, screensaver, custom CSS. Everyone may read it.
drop policy if exists app_docs_public_read on public.app_docs;
create policy app_docs_public_read on public.app_docs for select using (collection in ('artwork', 'audio', 'site'));
