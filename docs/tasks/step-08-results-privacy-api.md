# Step 8: Results and Privacy API (T33–T35)

By the end of this step, the browser receives results while the scan runs, and the cloud data can be wiped.
Contracts: [design/03-api.md §2 and §3](../design/03-api.md).

Terminal setup:
```bash
cd ~/Desktop/SEMACARE/backend && source .venv/bin/activate && set -a && source .env && set +a
```

To test these endpoints you need a real scan's IDs. After scanning in the app, in the DevTools console:
```js
localStorage.getItem("semacare.userId"); localStorage.getItem("semacare.lastScanId")
```
Then in the terminal: `U=<userId>; S=<lastScanId>`.

---

## T33 · `get_results` Lambda and `GET /results` route

| Depends on | Time | Complexity |
|---|---|---|
| T32 | 30 min | Low |

**Goal:** return a scan's results to its owner only.

**Steps**
1. Create `backend/get_results/handler.py`:
   - 400 if `x-user-id` or the `scan_id` query parameter isn't a valid UUID.
   - 404 unless a scan exists with that ID **and** that `user_id`.
   - Select the image rows (fields listed in the API doc, `limit=1000`), rename `id` to `image_id`, and return them with `counts` of `pending`, `done` and `error`.
2. Create and deploy:
   ```bash
   ./scripts/package.sh get_results
   aws logs create-log-group --log-group-name /aws/lambda/semacare-get-results 2>/dev/null
   aws logs put-retention-policy --log-group-name /aws/lambda/semacare-get-results --retention-in-days 7
   aws lambda create-function --function-name semacare-get-results \
     --runtime python3.13 --architectures arm64 --handler handler.lambda_handler \
     --role "arn:aws:iam::$ACCOUNT_ID:role/semacare-api-role" \
     --zip-file fileb://dist/get_results.zip --timeout 10 --memory-size 256 \
     --environment "Variables={SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY}" \
     --query FunctionArn --output text
   ```
3. Add the route in the console: API Gateway → `semacare-api` → Routes → Create → **GET** `/results` → Attach integration → Create and attach → Lambda `semacare-get-results` (leave "Grant API Gateway permission" ticked).
4. Test:
   ```bash
   curl -s "$API_URL/results?scan_id=$S" -H "x-user-id: $U" | python3 -m json.tool | head -30
   curl -s -o /dev/null -w "%{http_code}\n" "$API_URL/results?scan_id=$S" -H "x-user-id: 22222222-2222-4222-8222-222222222222"
   curl -s -o /dev/null -w "%{http_code}\n" "$API_URL/results?scan_id=nope" -H "x-user-id: $U"
   ```

**Done when**
- [ ] The first call returns `counts` and one entry per image, with categories
- [ ] Another user's ID gets **404**; a bad scan ID gets **400**

---

## T34 · `delete_scan` Lambda and `DELETE /scans/{scan_id}` route

| Depends on | Time | Complexity |
|---|---|---|
| T33 | 30 min | Low |

**Goal:** the privacy wipe.

**Steps**
1. Create `backend/delete_scan/handler.py`:
   - The same 400 and 404 checks as `get_results` (`scan_id` comes from `pathParameters`).
   - List the S3 objects under `{user_id}/{scan_id}/` with a paginator, and delete each page with `delete_objects`.
   - Delete the scan row; the image rows go via `ON DELETE CASCADE`.
   - Return `{ scan_id, deleted_objects, deleted: true }`.
2. Create and deploy (it needs `BUCKET_NAME`):
   ```bash
   ./scripts/package.sh delete_scan
   aws logs create-log-group --log-group-name /aws/lambda/semacare-delete-scan 2>/dev/null
   aws logs put-retention-policy --log-group-name /aws/lambda/semacare-delete-scan --retention-in-days 7
   aws lambda create-function --function-name semacare-delete-scan \
     --runtime python3.13 --architectures arm64 --handler handler.lambda_handler \
     --role "arn:aws:iam::$ACCOUNT_ID:role/semacare-api-role" \
     --zip-file fileb://dist/delete_scan.zip --timeout 15 --memory-size 256 \
     --environment "Variables={SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY,BUCKET_NAME=$BUCKET_NAME}" \
     --query FunctionArn --output text
   ```
3. Add the route: **DELETE** `/scans/{scan_id}` → new Lambda integration → `semacare-delete-scan`.
4. Test with the scan from T33:
   ```bash
   curl -s -X DELETE "$API_URL/scans/$S" -H "x-user-id: $U"; echo
   curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$API_URL/scans/$S" -H "x-user-id: $U"   # → 404
   ```

**Done when**
- [ ] The first DELETE returns `"deleted": true`
- [ ] The second returns **404**, and the rows are gone from Supabase
- [ ] The CORS preflight for `DELETE` from `http://localhost:5173` is allowed (the same `OPTIONS` test as T27, with `Access-Control-Request-Method: DELETE`)

---

## T35 · Frontend results polling (scan runner v3)

| Depends on | Time | Complexity |
|---|---|---|
| T34 | 40 min | Medium |

**Goal:** the "Analysing" bar fills while uploads are still running. The scan finishes when every image is `done` or `error`, or after 180 s without progress.

**Steps**
1. Add to `src/lib/api.ts` (part 2): the `ResultRow` and `ResultsResponse` types, `getResults(scanId)` and `deleteScan(scanId)`.
2. Create `src/lib/poll.ts` with `pollResults(scanId, uploadsFinished)`:
   - Every `POLL_INTERVAL_MS`: stop if the store's scan ID changed. If at least one image is `uploaded`, call `getResults` and copy `done`/`error` rows into the store (never overwrite an image that's already final).
   - A failed poll is logged and retried on the next tick.
   - Stop when uploads are finished and no image is `uploaded` or `uploading`.
   - If the number of finished images hasn't changed for `POLL_STALL_TIMEOUT_MS`, mark the waiting images `error` ("Timed out waiting for analysis") and stop.
3. Update `src/lib/scanRunner.ts` to **version 3**:
   - Start `pollResults` **before** `uploadAll`, so both run at the same time; await it after uploads finish.
   - If cancelled, mark images that never started as `error` ("Cancelled").
   - Set `allDoneAt` and `finished: true` (remove the temporary lines from v1/v2), and print the timings with `console.table`: images, done, errors, unsupported, `thumbs_s`, `uploads_s`, `total_s`.
   - Add `wipeCloudData(scanId)`: calls `deleteScan`; a 404 also counts as wiped; sets `wiped` or `wipeError` on the scan. **Don't call it automatically yet** (that's T43).
4. Scan `semacare-test` and watch the three bars.

**Done when**
- [ ] "Analysing" fills up while "Uploading" is still going
- [ ] The console shows the timing table, then the page moves to `/categories`
- [ ] DevTools → Network: `results?scan_id=…` is requested about every 2 s and stops when the scan is done
- [ ] Clean up with `delete from scans;` (the auto-wipe comes in T43)

**Pitfalls**
- If "Analysing" never finishes, check the Lambda logs: `aws logs tail /aws/lambda/semacare-process-image --since 5m`.
