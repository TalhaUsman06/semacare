# 03: API Contracts

Base URL: `VITE_API_URL`, e.g. `https://abc123.execute-api.eu-west-2.amazonaws.com`
(API Gateway **HTTP API**, `$default` stage, Lambda proxy **payload format 2.0**).

## Common rules

| Rule | Value |
|---|---|
| Identity header | `Authorization: Bearer <Supabase access token>` on **every** request; the backend verifies it with Supabase Auth and derives the user ID. A caller-supplied user ID is never trusted. |
| Content type | `application/json` (requests with bodies and all responses) |
| IDs | All IDs are lowercase UUIDs, validated with `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| CORS | Handled by API Gateway (not by Lambda code). Origins: `http://localhost:5173`, production Vercel URL. Headers: `content-type`, `authorization`. Methods: `GET, POST, DELETE, OPTIONS` |
| Error body | `{ "error": "<code>", "message": "<human text>" }` |

| HTTP | `error` code | When |
|---|---|---|
| 400 | `bad_request` | Missing/invalid field, invalid UUID, invalid JSON |
| 401 | `unauthorized` | Missing, invalid, or expired Supabase access token |
| 503 | `auth_unavailable` | Supabase Auth could not verify the token |
| 403 | `forbidden` | Scan exists but belongs to a different authenticated user |
| 404 | `not_found` | Scan doesn't exist (or isn't owned by the caller, for GET/DELETE) |
| 413 | `too_many` | More than 50 files in one request, or the scan would exceed 500 images |
| 500 | `server_error` | Unexpected error (details only in CloudWatch logs) |

---

## 1. `POST /upload-urls`

Creates the scan (if new) and the image rows, and returns one presigned S3 PUT URL per image.

**Request**
```http
POST /upload-urls
Authorization: Bearer <Supabase access token>
Content-Type: application/json

{
  "scan_id": "a2b9c0de-3f41-4a8b-9c77-1e2d3c4b5a69",
  "files": [
    { "image_id": "0d3e…", "width": 1170, "height": 2532, "is_png": true,  "name_hint": true  },
    { "image_id": "7c1a…", "width": 4032, "height": 3024, "is_png": false, "name_hint": false }
  ]
}
```

| Field | Type | Rules |
|---|---|---|
| `scan_id` | uuid | Required |
| `files` | array | 1–50 items |
| `files[].image_id` | uuid | Required, unique within the request |
| `files[].width`, `height` | int | 1–100000; **original** image size (after EXIF rotation) |
| `files[].is_png` | bool | Original file was PNG |
| `files[].name_hint` | bool | Filename looked like a screenshot (computed in the browser) |

**Behaviour**
1. Validate everything. On any failure, return 400 and write nothing.
2. `GET scans?id=eq.{scan_id}`. If it exists with another `user_id`, return 403. If it doesn't exist, insert it.
3. Count the existing images for the scan. If `count + len(files) > 500`, return 413.
4. Insert all image rows with `status='pending'` (a single POST with an array).
5. For each image, create a presigned `put_object` URL:
   `Key = {user_id}/{scan_id}/{image_id}.jpg`, `ContentType = image/jpeg`, `ExpiresIn = 300`.

**Response 200**
```json
{
  "expires_in": 300,
  "uploads": [
    { "image_id": "0d3e…", "url": "https://semacare-thumbs-….s3.eu-west-2.amazonaws.com/…?X-Amz-…" }
  ]
}
```

**Browser upload** (per item):
```http
PUT <url>
Content-Type: image/jpeg      ← must match exactly, or S3 returns 403 SignatureDoesNotMatch
<jpeg bytes>
```
Success = HTTP 200 from S3.

---

## 2. `GET /results?scan_id={uuid}`

**Request**
```http
GET /results?scan_id=a2b9c0de-…
Authorization: Bearer <Supabase access token>
```

**Behaviour:** check that the scan exists and is owned by the caller (otherwise 404), then
`GET images?scan_id=eq.{scan_id}&select=id,status,category,labels,ocr_summary,confidence,textract_used,processing_ms,error`.

**Response 200**
```json
{
  "scan_id": "a2b9c0de-…",
  "counts": { "pending": 3, "done": 95, "error": 2 },
  "images": [
    {
      "image_id": "0d3e…",
      "status": "done",
      "category": "Screenshots",
      "labels": ["Text", "Screenshot", "Electronics"],
      "ocr_summary": "Flight BA 245 London Heathrow → …",
      "confidence": 91.2,
      "textract_used": true,
      "processing_ms": 1840,
      "error": null
    }
  ]
}
```
`category`, `labels`, `ocr_summary` and `confidence` are `null` while `status = "pending"`.

---

## 3. `DELETE /scans/{scan_id}` (privacy wipe)

**Request**
```http
DELETE /scans/a2b9c0de-…
Authorization: Bearer <Supabase access token>
```

**Behaviour**
1. Check the scan exists and is owned by the caller (otherwise 404).
2. List the S3 objects under `{user_id}/{scan_id}/` and delete them (`delete_objects`, up to 1000 per call).
3. `DELETE scans?id=eq.{scan_id}`. Image rows are removed by `ON DELETE CASCADE`.

**Response 200**
```json
{ "scan_id": "a2b9c0de-…", "deleted_objects": 0, "deleted": true }
```
Calling it twice returns 404 the second time; the frontend treats 404 as "already wiped".

---

## 4. `process_image` (internal, S3 event, no HTTP)

Trigger: `s3:ObjectCreated:*` with suffix `.jpg`.
Input: the standard S3 event. The key must be URL-decoded with `urllib.parse.unquote_plus`.
Output: a PATCH to `images?id=eq.{image_id}` with

```json
{
  "status": "done",
  "category": "Receipts",
  "labels": ["Receipt", "Text", "Paper"],
  "ocr_summary": "TESCO … TOTAL £12.40 …",
  "confidence": 90.0,
  "textract_used": true,
  "processing_ms": 2210,
  "error": null
}
```
or, on failure, `{ "status": "error", "error": "<short message>", "processing_ms": … }`.
The thumbnail is **always** deleted (in `finally`).
