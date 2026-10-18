# 04: Database (Supabase PostgreSQL)

Project region: **London (eu-west-2)**. The AWS pipeline uses the **secret key**
(new `sb_secret_…` style, or the legacy `service_role` JWT), which bypasses RLS.
The separate Free-tier browser mode uses Supabase Auth and a publishable/anon key with
the owner-scoped policies in `supabase/client-rls.sql`.

## 1. Schema: copy this into `supabase/schema.sql` in T19

```sql
-- SEMACARE schema v1
-- Run in Supabase → SQL Editor. Safe to re-run (drops and recreates).

drop table if exists images;
drop table if exists scans;

create table scans (
  id          uuid primary key,
  user_id     uuid not null,
  created_at  timestamptz not null default now()
);

create table images (
  id             uuid primary key,
  scan_id        uuid not null references scans(id) on delete cascade,
  user_id        uuid not null,
  -- sent by the browser (no filenames, no paths)
  width          int  not null check (width  between 1 and 100000),
  height         int  not null check (height between 1 and 100000),
  is_png         boolean not null default false,
  name_hint      boolean not null default false,
  -- written by process_image
  status         text not null default 'pending'
                 check (status in ('pending','done','error')),
  category       text
                 check (category in ('Receipts','Screenshots','Landscapes','People','Memes','Other')),
  labels         text[],
  ocr_summary    text check (char_length(ocr_summary) <= 200),
  confidence     real,
  textract_used  boolean not null default false,
  processing_ms  int,
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index images_scan_id_idx on images (scan_id);
create index scans_user_id_idx  on scans  (user_id);

-- keep updated_at fresh
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger images_updated_at before update on images
for each row execute function set_updated_at();

-- Lock the tables: RLS on, and NO policies → anon/publishable keys can read/write nothing.
-- Lambdas use the secret/service key, which bypasses RLS.
alter table scans  enable row level security;
alter table images enable row level security;
```

## 2. Tables

### `scans`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Generated in the browser |
| `user_id` | uuid | Anonymous ID from localStorage |
| `created_at` | timestamptz | |

### `images`
| Column | Type | Written by | Notes |
|---|---|---|---|
| `id` | uuid PK | get_upload_urls | = `image_id` |
| `scan_id` | uuid FK | get_upload_urls | Cascade delete |
| `user_id` | uuid | get_upload_urls | Copied for simple checks |
| `width`, `height` | int | get_upload_urls | Original dimensions, for the aspect-ratio rule |
| `is_png`, `name_hint` | bool | get_upload_urls | Screenshot signals |
| `status` | text | both | `pending` → `done` / `error` |
| `category` | text | process_image | One of the six |
| `labels` | text[] | process_image | Rekognition label names, conf ≥ 60, max 25 |
| `ocr_summary` | text ≤ 200 | process_image | First 200 chars of OCR text, whitespace collapsed |
| `confidence` | real | process_image | 0–100 (see 05-ai-pipeline §4) |
| `textract_used` | bool | process_image | For the cost analysis |
| `processing_ms` | int | process_image | For the speed analysis |
| `error` | text | process_image | Short message on failure |

## 3. Status life cycle

```
(insert by get_upload_urls) pending ──► done    (process_image success)
                                    └─► error   (process_image failure)
```
If the thumbnail never arrives (the browser upload failed), the row stays `pending`. The frontend
times it out after 180 s and shows it as error. The auto-wipe removes it anyway.

## 4. Supabase REST cheat-sheet (used by `backend/shared/supabase_rest.py`)

Base: `{SUPABASE_URL}/rest/v1`

| Action | Method + path | Extra headers |
|---|---|---|
| Get scan | `GET /scans?id=eq.{id}&select=id,user_id` | |
| Insert scan | `POST /scans` body `{id,user_id}` | `Prefer: return=minimal` |
| Count images | `GET /images?scan_id=eq.{id}&select=id` | `Prefer: count=exact`, read the `Content-Range` header (`0-9/10`) |
| Insert images | `POST /images` body `[ … ]` | `Prefer: return=minimal` |
| Update image | `PATCH /images?id=eq.{id}` body `{…}` | `Prefer: return=minimal` |
| List results | `GET /images?scan_id=eq.{id}&select=…` | |
| Delete scan | `DELETE /scans?id=eq.{id}` | `Prefer: return=minimal` |

Auth headers on every call:
- `apikey: <SUPABASE_SERVICE_KEY>`
- `Authorization: Bearer <SUPABASE_SERVICE_KEY>`: **only if the key is a legacy JWT** (starts with `eyJ`).
  New `sb_secret_…` keys are not JWTs, so send them in `apikey` only.

## 5. Free-tier browser mode

The local-first browser app can use Supabase Free for sign-in and metadata without
deploying the AWS pipeline. Run `supabase/client-rls.sql` after the base schema. The
publishable/anon key is used with authenticated sessions; RLS limits each operation to
`auth.uid()`. Never put a secret/service-role key in `frontend/`.

This mode writes scan and image IDs, user ID, dimensions, PNG/name-hint flags, status,
and category. It never sends original images, filenames, or paths. Initial categories
are filename guesses, not AI results. Image bytes and previews remain in the browser;
no image storage bucket or AWS call is used.
