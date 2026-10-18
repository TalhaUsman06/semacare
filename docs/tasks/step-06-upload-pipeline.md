# Step 6: Upload Pipeline (T24–T28)

By the end of this step, thumbnails travel from the browser to S3 and a `pending` row exists for each one.
They aren't analysed yet (that's Step 7).

Terminal setup for backend tasks:
```bash
cd ~/Desktop/SEMACARE/backend && source .venv/bin/activate && set -a && source .env && set +a
```

---

## T24 · Shared Python helpers (`supabase_rest.py`, `responses.py`)

| Depends on | Time | Complexity |
|---|---|---|
| T23 | 20 min | Low |

**Goal:** a tiny Supabase client using only the standard library (so nothing needs packaging), and API response helpers, shared by all Lambdas.

**Steps**
1. Create `backend/shared/supabase_rest.py` (calls are listed in [design/04-database.md §4](../design/04-database.md)):
   - Reads `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from the environment.
   - Always sends the `apikey` header. Sends `Authorization: Bearer …` **only** when the key starts with `eyJ` (legacy JWT).
   - Functions: `select(path)`, `insert(table, rows)`, `upsert(table, rows, ignore_duplicates=False)`, `update(table, filters, patch)`, `delete(table, filters)`, `count(table, filters)` (reads the `Content-Range` header).
   - Raises `SupabaseError` with the HTTP status and the first 300 characters of the response on failure.
2. Create `backend/shared/responses.py`:
   - `is_uuid(value)`, `response(status, body)`, `error(status, code, message)`
   - `get_user_id(event)`: the `x-user-id` header if it's a valid UUID, else `None`
   - `parse_json(event)`: handles `isBase64Encoded`; raises `ValueError` on invalid JSON
3. Smoke test:
   ```bash
   python -c "from shared import supabase_rest as db; print(db.select('scans?select=id&limit=1'))"
   ```

**Done when**
- [ ] The smoke test prints `[]` (or rows), not an error

**Pitfalls**
- Don't name the file `http.py`: it would clash with Python's own `http` module.

---

## T25 · Write the `get_upload_urls` Lambda

| Depends on | Time | Complexity |
|---|---|---|
| T24 | 40 min | Medium |

**Goal:** `POST /upload-urls` exactly as specified in [design/03-api.md §1](../design/03-api.md).

**Steps**
1. Create `backend/get_upload_urls/handler.py` with `lambda_handler(event, context)`:
   1. 400 if `x-user-id` is missing/invalid, the body isn't JSON, or validation fails. Validate: `scan_id` is a UUID; `files` has 1 or more items; each has a unique UUID `image_id`, integer `width`/`height` in 1–100000 (reject booleans), boolean `is_png` and `name_hint`.
   2. 413 if there are more than 50 files.
   3. Upsert the scan with "ignore duplicates", then read it back: 403 if it belongs to another user.
   4. 413 if existing images + new images would exceed 500.
   5. **Upsert** the image rows with `status: "pending"`, so a retried request doesn't fail.
   6. Return one presigned `put_object` URL per image: key `{user_id}/{scan_id}/{image_id}.jpg`, `ContentType: image/jpeg`, expiry `URL_EXPIRY` (300 s).
2. Create the S3 client with the **regional endpoint** (`https://s3.eu-west-2.amazonaws.com`), `signature_version="s3v4"` and virtual addressing. A global-endpoint URL on a new bucket redirects, and the browser reports that as a CORS error.
3. Create two test events in `backend/tests/events/` in API Gateway v2 format: `upload_urls.json` (valid; reuse the T20 test IDs) and `upload_urls_bad.json` (`x-user-id: "not-a-uuid"`).
4. Run locally:
   ```bash
   python scripts/run_local.py get_upload_urls tests/events/upload_urls.json
   python scripts/run_local.py get_upload_urls tests/events/upload_urls_bad.json
   ```
5. Upload a real JPEG to the returned URL:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X PUT -H "Content-Type: image/jpeg" \
     --data-binary @"$HOME/Pictures/semacare-test/<any>.jpg" "<PASTE_URL>"
   aws s3 ls "s3://$BUCKET_NAME" --recursive
   ```
6. Clean up: `aws s3 rm "s3://$BUCKET_NAME" --recursive`, and in the SQL editor `delete from scans;`.

**Done when**
- [ ] The valid event returns 200 with a `https://<bucket>.s3.eu-west-2.amazonaws.com/…` URL
- [ ] The bad event returns 400
- [ ] The PUT returns 200 and the object appears under `<user>/<scan>/<image>.jpg`
- [ ] Running the valid event twice still returns 200

**Pitfalls**
- `SignatureDoesNotMatch` (403) on PUT: the `Content-Type` header must be exactly `image/jpeg`.

---

## T26 · Deploy the `get_upload_urls` Lambda

| Depends on | Time | Complexity |
|---|---|---|
| T25 | 20 min | Low |

**Goal:** the function runs in AWS with its own least-privilege role.

**Steps**
1. Package and create:
   ```bash
   ./scripts/package.sh get_upload_urls
   aws logs create-log-group --log-group-name /aws/lambda/semacare-get-upload-urls 2>/dev/null
   aws logs put-retention-policy --log-group-name /aws/lambda/semacare-get-upload-urls --retention-in-days 7
   aws lambda create-function --function-name semacare-get-upload-urls \
     --runtime python3.13 --architectures arm64 --handler handler.lambda_handler \
     --role "arn:aws:iam::$ACCOUNT_ID:role/semacare-upload-urls-role" \
     --zip-file fileb://dist/get_upload_urls.zip --timeout 10 --memory-size 256 \
     --environment "Variables={SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY,BUCKET_NAME=$BUCKET_NAME,URL_EXPIRY=300}" \
     --query FunctionArn --output text
   aws lambda wait function-active --function-name semacare-get-upload-urls
   ```
2. Invoke it in the cloud:
   ```bash
   aws lambda invoke --function-name semacare-get-upload-urls \
     --payload fileb://tests/events/upload_urls.json /tmp/out.json >/dev/null && cat /tmp/out.json; echo
   ```
3. Clean up the test scan (`delete from scans;`).
4. From now on, deploy code changes with `./scripts/deploy.sh get_upload_urls`.

**Done when**
- [ ] `/tmp/out.json` has `"statusCode": 200` and a URL
- [ ] The console shows the function using role `semacare-upload-urls-role`

**Pitfalls**
- "The role defined for the function cannot be assumed": the role is too new. Wait 10 s and retry.
- "Unable to import module 'handler'": the zip layout is wrong. `unzip -l dist/get_upload_urls.zip` must show `handler.py` and `shared/` at the top level.

---

## T27 · Create the API Gateway HTTP API and CORS

| Depends on | Time | Complexity |
|---|---|---|
| T26 | 30 min | Medium |

**Goal:** a public HTTPS endpoint `POST /upload-urls` with CORS for `localhost:5173` and throttling ([design/07-security-privacy.md §5](../design/07-security-privacy.md)).

**Steps (console, region London)**
1. API Gateway → Create API → **HTTP API** → Build.
2. Add integration → Lambda → `semacare-get-upload-urls`. API name `semacare-api`.
3. Route: method **POST**, path **`/upload-urls`**, target that Lambda.
4. Stage `$default` with auto-deploy on → Create. (The console adds the Lambda invoke permission.)
5. Left menu → **CORS** → Configure:
   - Allow origin `http://localhost:5173`
   - Allow headers `content-type`, `x-user-id`
   - Allow methods `GET`, `POST`, `DELETE`, `OPTIONS`
   - Max age `3600`
6. Throttling:
   ```bash
   API_ID=$(aws apigatewayv2 get-apis --query "Items[?Name=='semacare-api'].ApiId" --output text); echo $API_ID
   aws apigatewayv2 update-stage --api-id "$API_ID" --stage-name '$default' \
     --default-route-settings ThrottlingBurstLimit=40,ThrottlingRateLimit=20 >/dev/null
   ```
7. Copy the **Invoke URL** (no trailing slash) into `backend/.env` as `API_URL=` and `frontend/.env.local` as `VITE_API_URL=`.
8. Test:
   ```bash
   set -a; source .env; set +a
   python -c "import json;print(json.load(open('tests/events/upload_urls.json'))['body'])" > /tmp/body.json
   curl -s -X POST "$API_URL/upload-urls" -H "content-type: application/json" \
     -H "x-user-id: 22222222-2222-4222-8222-222222222222" --data @/tmp/body.json; echo
   curl -s -i -X OPTIONS "$API_URL/upload-urls" -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type,x-user-id" | grep -i access-control
   ```
9. Clean up: `delete from scans;`.

**Done when**
- [ ] The POST returns `{"expires_in": 300, "uploads": [...]}`
- [ ] The preflight shows `access-control-allow-origin: http://localhost:5173`
- [ ] Both `.env` files contain the API URL

---

## T28 · Frontend upload client (`api.ts`, `upload.ts`, scan runner v2)

| Depends on | Time | Complexity |
|---|---|---|
| T27 | 40 min | Medium |

**Goal:** after thumbnails are made, the browser asks for URLs (50 at a time) and uploads 6 thumbnails in parallel.

**Steps**
1. Create `src/lib/api.ts` (part 1):
   - `class ApiError extends Error` with `status` and `code` fields (assign them in the constructor body).
   - An internal `call(method, path, body?)` that adds the `x-user-id` header, turns network failures into `ApiError(0, "network", …)`, and non-2xx responses into `ApiError(status, error, message)`.
   - `getUploadUrls(scanId, files)` → `POST /upload-urls`.
   - `putThumbnail(url, blob)` → `PUT` with header `Content-Type: image/jpeg`.
2. Create `src/lib/upload.ts` with `uploadAll(scanId, ids, isCancelled)`:
   - For each batch of 50: request URLs with `withRetry`. If that fails, mark the whole batch `error` ("Could not start upload: …") and continue.
   - Then `runPool` with concurrency 6: set `uploading`, PUT with `withRetry`, then `uploaded` or `error` ("Upload failed").
   - Send only `image_id`, `width`, `height`, `is_png`, `name_hint`. **No filenames.**
3. Update `src/lib/scanRunner.ts` to **version 2**: after thumbnails, call `uploadAll` for the `thumb_ready` images and set `uploadsDoneAt`. Keep the temporary `finished: true` at the end.
4. **Restart** `npm run dev` (to pick up `VITE_API_URL`) and scan `semacare-test`.
5. Check:
   ```bash
   aws s3 ls "s3://$BUCKET_NAME" --recursive | wc -l      # = number of supported images
   ```
   Supabase → `images`: one `pending` row per image.
6. Clean up: `aws s3 rm "s3://$BUCKET_NAME" --recursive` and `delete from scans;`.

**Done when**
- [ ] The "Uploading" bar reaches n/n
- [ ] The S3 object count and the row count both equal the number of supported images
- [ ] DevTools → Network: the `upload-urls` request body contains no filenames; PUT requests return 200
- [ ] Unsupported files weren't uploaded

**Pitfalls**
- A CORS error on the **PUT** means the S3 CORS rule is wrong (T21). On the **POST**, the API Gateway CORS is wrong (T27).
- Empty `VITE_API_URL`: requests go to `localhost:5173/upload-urls` and fail. Restart the dev server after editing `.env.local`.
