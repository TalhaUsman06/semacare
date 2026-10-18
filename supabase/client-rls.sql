-- Run after schema.sql to allow authenticated users to manage only their own metadata.
-- Images and filenames are not stored in Supabase by the free-tier browser flow.

alter table public.scans enable row level security;
alter table public.images enable row level security;

grant select, insert, delete on public.scans to authenticated;
grant select, insert, update, delete on public.images to authenticated;

drop policy if exists scans_select_own on public.scans;
create policy scans_select_own
  on public.scans for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists scans_insert_own on public.scans;
create policy scans_insert_own
  on public.scans for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists scans_delete_own on public.scans;
create policy scans_delete_own
  on public.scans for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists images_select_own on public.images;
create policy images_select_own
  on public.images for select to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.scans
      where scans.id = images.scan_id
        and scans.user_id = (select auth.uid())
    )
  );

drop policy if exists images_insert_own on public.images;
create policy images_insert_own
  on public.images for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.scans
      where scans.id = images.scan_id
        and scans.user_id = (select auth.uid())
    )
  );

drop policy if exists images_update_own on public.images;
create policy images_update_own
  on public.images for update to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.scans
      where scans.id = images.scan_id
        and scans.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.scans
      where scans.id = images.scan_id
        and scans.user_id = (select auth.uid())
    )
  );

drop policy if exists images_delete_own on public.images;
create policy images_delete_own
  on public.images for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.scans
      where scans.id = images.scan_id
        and scans.user_id = (select auth.uid())
    )
  );
