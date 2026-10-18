# 02: Architecture

## 1. Component diagram

```
┌──────────────────────── BROWSER (Chrome/Edge desktop) ─────────────────────────┐
│  React + Vite + TS + Tailwind                                                  │
│                                                                                │
│  fs.ts ─ showDirectoryPicker(readwrite) ─ walk folder ─ handles Map (local)    │
│  thumbnail.worker.ts ×4 ─ createImageBitmap → OffscreenCanvas → JPEG 1024px    │
│  scanStore (Zustand)  ─ images, stages, results, timings                       │
│  upload.ts ─ PUT thumbnails to S3 (6 in parallel)                              │
│  api.ts ─ /upload-urls, /results (poll 2 s), /scans/{id}                       │
│  bin.ts (IndexedDB) ─ pending-delete items + handles  ─ removeEntry()          │
└──────────────┬──────────────────────────────┬──────────────────────────────────┘
               │ HTTPS (Supabase bearer token)│ HTTPS PUT (presigned URL)
     ┌─────────▼──────────────┐               │
     │ API Gateway HTTP API   │               │
     │ CORS: localhost+vercel │               │
     └──┬─────────┬────────┬──┘               │
        │         │        │                  │
 POST /upload-urls│  DELETE /scans/{id}       │
        │   GET /results   │                  │
┌───────▼──────┐ ┌▼───────┐ ┌▼───────────┐    │
│get_upload_   │ │get_    │ │delete_scan │    │
│urls (Lambda) │ │results │ │(Lambda)    │    │
└──┬────────┬──┘ └──┬─────┘ └──┬──────┬──┘    │
   │insert  │sign   │select    │delete│list+delete
   │rows    │URLs   │          │rows  │objects
   │        │       │          │      │       │
   │   ┌────▼───────┼──────────┼──────▼───────▼──────┐
   │   │ S3: semacare-thumbs-…  (private, SSE-S3,    │
   │   │ lifecycle: expire 1 day, CORS PUT)          │
   │   └────┬────────────────────────────▲───────────┘
   │        │ ObjectCreated (*.jpg)      │ delete_object
   │   ┌────▼────────────────────────────┴───────────┐
   │   │ process_image (Lambda, Python 3.13)         │
   │   │  1 detect_labels (Rekognition)              │
   │   │  2 detect_document_text (Textract, if text) │
   │   │  3 categorise()                             │
   │   │  4 PATCH images row                         │
   │   │  5 delete thumbnail                         │
   │   └────┬────────────────────────────────────────┘
   │        │ PATCH
┌──▼────────▼─────────────────────────────────┐
│ Supabase Auth + PostgreSQL (eu-west-2)       │
│  scans, images   (RLS on, no policies)      │
└─────────────────────────────────────────────┘
```

## 2. Components and responsibilities

| Component | Tech | Responsibility | Never does |
|---|---|---|---|
| Frontend | React 19, Vite, TS, Tailwind v4, Zustand, idb-keyval, React Router | Folder access, thumbnails, upload, show results, review, delete, bin | Holds AWS or Supabase keys |
| `get_upload_urls` | Lambda Python 3.13 | Validate the request, create scan and image rows, return presigned PUT URLs | Receives image bytes |
| `process_image` | Lambda Python 3.13, triggered by S3 | AI calls, categorise, write result, delete thumbnail | Keeps the thumbnail |
| `get_results` | Lambda Python 3.13 | Return a scan's rows to its owner | Returns other users' data |
| `delete_scan` | Lambda Python 3.13 | Privacy wipe: rows + leftover S3 objects | |
| S3 bucket | S3 | Short-lived thumbnail store | Public access |
| Supabase | PostgreSQL | Metadata (labels, category, OCR snippet) | Filenames, paths, images |

## 3. S3 key layout

```
{user_id}/{scan_id}/{image_id}.jpg
e.g. 6f1c…/a2b9…/0d3e….jpg
```
- `process_image` gets all three IDs from the key; no extra lookup is needed to find the owner.
- `delete_scan` removes the prefix `{user_id}/{scan_id}/`.

## 4. End-to-end sequence (one scan)

```
User        Browser                      API/Lambdas               S3             Supabase
 │ consent   │                               │                      │                │
 │──────────►│ save consent, user_id         │                      │                │
 │ pick dir  │                               │                      │                │
 │──────────►│ walk → N images, image_ids    │                      │                │
 │           │ workers → thumbnails          │                      │                │
 │           │ POST /upload-urls (≤50)──────►│ upsert scan, insert  │                │
 │           │                               │ images(pending) ─────┼───────────────►│
 │           │◄──────────── URLs ────────────│ sign PUT URLs        │                │
 │           │ PUT thumb (×6 parallel) ──────┼─────────────────────►│                │
 │           │                               │◄── ObjectCreated ────│                │
 │           │                               │ process_image:       │                │
 │           │                               │  Rekognition/Textract│                │
 │           │                               │  PATCH row(done) ────┼───────────────►│
 │           │                               │  delete object ─────►│                │
 │           │ GET /results (every 2 s) ────►│ select rows ─────────┼───────────────►│
 │           │◄────────── rows ──────────────│                      │                │
 │           │ all done → DELETE /scans/{id} (auto-wipe ON) ────────┼──── rows gone ─►│
 │ review    │                               │                      │                │
 │ confirm   │ move to bin (IndexedDB)       │                      │                │
 │ empty bin │ requestPermission → removeEntry()  (files gone)      │                │
```

## 5. Image stage life cycle (frontend)

```
found → thumbnailing → thumb_ready → uploading → uploaded → done
             │                            │           │
             └──► unsupported             └──► error  └──► error (AI failed / timeout)
```
- `unsupported`: the browser can't decode it (e.g. HEIC, corrupt file). It's still listed under "Unsupported" and is never uploaded.
- `error`: the upload or AI step failed after retries. It's shown in "Other" with a warning icon, and never auto-deleted.

## 6. Where data lives

| Data | Location | Lifetime |
|---|---|---|
| Original files | User's disk | Until the user empties the bin |
| File/dir handles | Memory (scan), IndexedDB (bin items) | Scan: until tab closes; bin: until purged/restored |
| Thumbnails (local preview) | Object URLs in memory | Until tab closes |
| Thumbnails (cloud) | S3 | Seconds (deleted after processing); max 1 day (lifecycle) |
| Labels, category, OCR snippet | Supabase | Until privacy wipe (auto by default) |
| `user_id`, consent, settings | localStorage | Until browser data is cleared |

## 7. Frontend module map

| Module | Purpose | Task |
|---|---|---|
| `src/config.ts` | All tunable constants | T09 |
| `src/lib/identity.ts` | Get or create the anonymous `user_id` | T10 |
| `src/lib/consent.ts` | Read/write consent | T10 |
| `src/lib/support.ts` | Detect File System Access API support | T10 |
| `src/lib/settings.ts` | `autoWipe` setting + last scan id | T10 (UI in T42) |
| `src/lib/format.ts` | Bytes, seconds, "3 h ago" | T11 |
| `src/state/toastStore.ts` | Toast messages with an optional Undo action | T11 |
| `src/components/*` | Button, Card, Banner, ProgressBar, Modal, Toaster, BlobImage | T11 (Layout T12/T38, Guards T18, ConfirmDeleteModal T39) |
| `src/lib/fs.ts` | Pick folder, walk (T14); permission + safe delete (T38) | T14, T38 |
| `src/state/scanStore.ts` | Zustand store + handles Map | T15 |
| `src/workers/thumbnail.worker.ts` | Make one thumbnail | T16 |
| `src/lib/pool.ts` | `runPool`, `withRetry`, `sleep` | T17 |
| `src/lib/thumbnails.ts` | Worker pool | T17 |
| `src/lib/scanRunner.ts` | Orchestrates a scan: thumbnails → upload + poll → auto-wipe | T18 (v1), T28 (v2), T35 (v3), T43 (final) |
| `src/lib/api.ts` | All HTTP calls to API Gateway | T28, T35 |
| `src/lib/upload.ts` | Batched presign + parallel PUT | T28 |
| `src/lib/poll.ts` | Results polling | T35 |
| `src/lib/categories.ts` | Group names, emoji, colours, `groupOf()` | T37 |
| `src/lib/csv.ts` | Export results CSV | T37 |
| `src/lib/bin.ts` | Recycle bin in IndexedDB + permanent delete | T38 |
| `src/state/binStore.ts` | Bin items for the header count and the bin page | T38 |
| `src/lib/devtools.ts` | Dev-only helper to age bin items | T41 |
| `src/pages/*` | One file per screen | T12 (placeholders), T18, T36–T42 |
