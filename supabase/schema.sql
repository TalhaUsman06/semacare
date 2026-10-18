-- SEMACARE schema v1
-- Non-destructive: creates missing objects and does not drop existing tables.

create table if not exists public.scans (
  id uuid primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.images (
  id uuid primary key,
  scan_id uuid not null references public.scans(id) on delete cascade,
  user_id uuid not null,
  width int not null check (width between 1 and 100000),
  height int not null check (height between 1 and 100000),
  is_png boolean not null default false,
  name_hint boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'done', 'error')),
  category text
    check (category in ('Receipts', 'Screenshots', 'Landscapes', 'People', 'Memes', 'Other')),
  labels text[],
  ocr_summary text check (char_length(ocr_summary) <= 200),
  confidence real,
  textract_used boolean not null default false,
  processing_ms int,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists images_scan_id_idx on public.images (scan_id);
create index if not exists scans_user_id_idx on public.scans (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'images_updated_at'
      and tgrelid = 'public.images'::regclass
      and not tgisinternal
  ) then
    create trigger images_updated_at
    before update on public.images
    for each row execute function public.set_updated_at();
  end if;
end;
$$;

alter table public.scans enable row level security;
alter table public.images enable row level security;
