# Step 7: AI Processing and Categorisation (T29–T32)

By the end of this step, every uploaded thumbnail is analysed within seconds, its row becomes `done` with a category,
and the thumbnail is deleted from S3. The full specification is [design/05-ai-pipeline.md](../design/05-ai-pipeline.md).

Terminal setup:
```bash
cd ~/Desktop/SEMACARE/backend && source .venv/bin/activate && set -a && source .env && set +a
```

---

## T29 · Categoriser and unit tests

| Depends on | Time | Complexity |
|---|---|---|
| T28 | 30 min | Medium |

**Goal:** the six rules from design §3 as a **pure function** (no AWS, no network), proven by tests.

**Steps**
1. Create `backend/process_image/categoriser.py` with:
   - The label sets from design §2 as module constants.
   - `best_conf(labels, names)`: highest confidence among labels whose name is in `names` (0 if none).
   - `needs_text(labels)`: true when `best_conf(labels, TEXT_LABELS) >= 60`.
   - `receipt_hits(ocr)`: keyword matches on word boundaries, currency symbols, and the price pattern (counted once).
   - `is_screen_ratio(width, height)`: `1.54–1.80` or `1.95–2.40`.
   - `categorise(labels, ocr, width, height, is_png, name_hint)` → `(category, confidence)`, checking the rules **in the order of design §3**; first match wins.
2. Create `backend/tests/test_categoriser.py` with the 12 cases from design §5, plus one test for `needs_text` and one for `is_screen_ratio`.
3. Run `pytest -q`.

**Done when**
- [ ] `14 passed`

**Pitfalls**
- The order of the rules is part of the design. If you change it, update `05-ai-pipeline.md` and explain why in the dissertation.
- Test case 6 (a meme on a 4:3 photo with a `Text` label) only passes because 4:3 is deliberately not a "screen ratio".

---

## T30 · Write the `process_image` Lambda

| Depends on | Time | Complexity |
|---|---|---|
| T29 | 40 min | Medium |

**Goal:** the S3-triggered pipeline from design §1: labels → (OCR) → categorise → save → **always** delete the thumbnail.

**Steps**
1. Create `backend/process_image/handler.py`:
   - Create the `s3`, `rekognition` and `textract` clients **outside** the handler, with `retries={"max_attempts": 8, "mode": "adaptive"}`.
   - For each record: URL-decode the key with `unquote_plus`, and match it against `{uuid}/{uuid}/{uuid}.jpg`. If it doesn't match, log it, delete the object and stop.
   - `detect_labels` (MaxLabels 25, MinConfidence 60).
   - If `needs_text(labels)`: `detect_document_text`, join the `LINE` blocks with newlines. This must happen **before** the delete, because Textract reads the image from S3.
   - Read `width, height, is_png, name_hint` from the image row, call `categorise`, and PATCH the row with the fields in [design/03-api.md §4](../design/03-api.md). `ocr_summary` is whitespace-collapsed and cut to 200 characters.
   - Log one JSON line per image: scan ID, image ID, category, confidence, whether Textract ran, milliseconds, and labels. **Never log OCR text.**
   - On any exception: log it and PATCH `status: "error"`. **Don't re-raise**: an S3 retry would bill the AI calls twice.
   - In `finally`: delete the S3 object.
2. Test locally on a real thumbnail. Scan `semacare-test` in the app (uploads only), then:
   ```bash
   KEY=$(aws s3 ls "s3://$BUCKET_NAME" --recursive | head -1 | awk '{print $4}')
   printf '{"Records":[{"s3":{"bucket":{"name":"%s"},"object":{"key":"%s"}}}]}' "$BUCKET_NAME" "$KEY" > tests/events/s3_put.local.json
   python scripts/run_local.py process_image tests/events/s3_put.local.json
   ```
3. Check the row and the bucket, then clean up (`aws s3 rm … --recursive`, `delete from scans;`).

**Done when**
- [ ] The local run logs a `done` event with sensible labels
- [ ] The row has `status = done`, a category, labels and `processing_ms`
- [ ] The object was deleted from S3

**Pitfalls**
- `*.local.json` event files contain your real bucket and user ID. They're already gitignored.

---

## T31 · Deploy `process_image`, connect the S3 trigger, end-to-end check

| Depends on | Time | Complexity |
|---|---|---|
| T30 | 40 min | Medium |

**Goal:** every `.jpg` uploaded to the bucket automatically runs `semacare-process-image`.

**Steps**
1. Create the function:
   ```bash
   ./scripts/package.sh process_image
   aws logs create-log-group --log-group-name /aws/lambda/semacare-process-image 2>/dev/null
   aws logs put-retention-policy --log-group-name /aws/lambda/semacare-process-image --retention-in-days 7
   aws lambda create-function --function-name semacare-process-image \
     --runtime python3.13 --architectures arm64 --handler handler.lambda_handler \
     --role "arn:aws:iam::$ACCOUNT_ID:role/semacare-process-image-role" \
     --zip-file fileb://dist/process_image.zip --timeout 30 --memory-size 512 \
     --environment "Variables={SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY}" \
     --query FunctionArn --output text
   aws lambda wait function-active --function-name semacare-process-image
   ```
2. Turn off automatic retries (we handle errors ourselves):
   ```bash
   aws lambda put-function-event-invoke-config --function-name semacare-process-image \
     --maximum-retry-attempts 0 --maximum-event-age-in-seconds 3600 >/dev/null
   ```
3. Allow S3 to invoke it:
   ```bash
   aws lambda add-permission --function-name semacare-process-image --statement-id s3-invoke \
     --action lambda:InvokeFunction --principal s3.amazonaws.com \
     --source-arn "arn:aws:s3:::$BUCKET_NAME" --source-account "$ACCOUNT_ID" >/dev/null
   ```
4. Create `infra/s3-notification.template.json`: one `LambdaFunctionConfigurations` entry with the function ARN (placeholder `ACCOUNT_ID`), event `s3:ObjectCreated:*`, and a key filter for suffix `.jpg`. Then:
   ```bash
   sed "s/ACCOUNT_ID/$ACCOUNT_ID/" ../infra/s3-notification.template.json > /tmp/s3-notification.json
   aws s3api put-bucket-notification-configuration --bucket "$BUCKET_NAME" \
     --notification-configuration file:///tmp/s3-notification.json
   ```
5. Check your Lambda concurrency limit (it affects speed):
   ```bash
   aws lambda get-account-settings --query AccountLimit.ConcurrentExecutions
   ```
   If it's **10** (common for new accounts), write that in the tracker notes and report it in the evaluation.
6. End-to-end: scan about 5 images in the app. Within about 10 s:
   - every row in Supabase is `done`
   - `aws s3 ls "s3://$BUCKET_NAME" --recursive` prints nothing
   - `aws logs tail /aws/lambda/semacare-process-image --since 10m` shows one `done` line per image
7. Clean up: `delete from scans;`.

**Done when**
- [ ] Rows become `done` automatically
- [ ] The bucket is empty afterwards
- [ ] The logs show labels but no OCR text

**Pitfalls**
- "Unable to validate destination" on the notification: step 3 hasn't run, or the bucket name in it is wrong.
- `AccessDeniedException` from Rekognition in the logs: the role policy (T22) lacks `s3:GetObject`, which Rekognition needs to read the image as the caller.

---

## T32 · Tune the rules with real labels

| Depends on | Time | Complexity |
|---|---|---|
| T31 | 45 min (time-box it) | Medium |

**Goal:** fix obvious mis-categorisations **before** the evaluation, using a separate tuning set (never the T46 evaluation images).

**Steps**
1. Make `~/Pictures/semacare-tune` with 15–20 images (about 3 per category) that you won't use in the evaluation.
2. Create `backend/scripts/try_folder.py <folder>`. For each JPG/PNG/WebP in the folder it:
   1. reads the dimensions with macOS `sips -g pixelWidth -g pixelHeight`
   2. makes a 1024 px JPEG copy with `sips -Z 1024 -s format jpeg -s formatOptions 75` (the same as the browser worker)
   3. uploads it to `s3://$BUCKET_NAME/try/`, calls Rekognition (and Textract when `needs_text`), runs `categorise`
   4. prints a table row: file, category, confidence, whether Textract ran, top labels
   5. deletes the copy. Nothing is written to Supabase.
3. Run it: `python scripts/try_folder.py ~/Pictures/semacare-tune`
4. For each wrong row, choose the smallest fix: add a missing label name to a set, or adjust a threshold. Think twice before changing the rule order.
5. For every fix, add a regression test using the real labels the script printed. Run `pytest -q`.
6. Deploy: `./scripts/deploy.sh process_image`
7. Copy the final label sets and thresholds into `docs/design/05-ai-pipeline.md` §2–3, so the design matches the code.
8. Write the before/after accuracy on the tuning set in the tracker notes (e.g. "12/18 → 16/18").

**Done when**
- [ ] The tuning set is mostly correct (aim for at least 80%); don't over-fit to single images
- [ ] `pytest -q` passes with your new tests
- [ ] The design doc matches the deployed rules

**Pitfalls**
- Stop after 45 minutes. The evaluation measures honest accuracy; it doesn't need to be perfect.
- Each run costs about $0.02 for 20 images.
