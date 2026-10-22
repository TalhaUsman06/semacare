# SEMACARE: Current Project Context

> This file is the compact source of truth for continuing SEMACARE in another ChatGPT conversation. Update it whenever a major product or architecture decision changes.

## Product purpose

SEMACARE is a privacy-first screenshot and picture-cleanup assistant. A user selects a local folder or a group of JPG, PNG, or WebP files. The app creates browser-local previews, classifies the images into explainable categories, extracts useful text where appropriate, highlights sensitive information, and lets the user decide what to keep, bin, rename, or export.

The product is web-first for the current MSc project, with a future Android application as the intended next platform. Originals, filenames, paths, and handles remain on the user's device by default.

## Current user workflow

1. Select a folder with the visible **Choose a folder** control, or select individual pictures.
2. Keep **Use local AI** enabled for browser-local analysis.
3. Review progress through the journey tracker and the live processing card.
4. Review category cards and individual image cards.
5. Correct categories or sensitive flags manually where necessary.
6. Move confirmed unwanted items to the recoverable local bin.
7. Restore items or permanently delete them only after confirmation.
8. Review structured extracted information in **View information** / **Information archive**.
9. Search the persistent local information index, including records whose original image has been deleted.
10. Export categories CSV, structured information CSV, structured information JSON, or renamed remaining images.

## Operational categories

The current interface uses these seven categories plus a separate sensitive filter:

| Category | Intended meaning |
|---|---|
| Receipts | Receipts, invoices, bills, payment confirmations and similar documents |
| Screenshots | Phone/desktop captures, websites, chats and app screens |
| Landscapes | Outdoor scenery, nature, sky, sea and places |
| People | Images where a face/person is detected or is the main subject |
| Memes | Captioned or meme-style images |
| Junk | Blank, very small, extremely low-information or visibly poor-quality images |
| Other | Images that do not fit the above categories confidently |

Sensitive is an overlay, not a replacement category. It can be triggered by extracted details such as names, addresses, account/IBAN-like values, payment information, dates, amounts, identity documents, or other document evidence. A receipt can therefore be both **Receipts** and **Sensitive**.

## Local processing

- MobileNet provides browser-local image labels.
- BlazeFace is used to improve People classification when faces are present.
- Tesseract.js performs local OCR for likely document/text images and on-demand information extraction.
- Filename and image-quality heuristics provide fallbacks when model results are weak.
- OCR is filtered into meaningful text, structured fields, and sensitive reasons; raw OCR noise should not be treated as reliable information.
- OCR progress is shown as `Extracting local text: X/Y complete` and is separate from the general classification phase.
- Each image tracks `ocrProcessed`, so JSON/CSV export does not rerun OCR for images already processed.

The browser loads model libraries from CDN. Therefore local processing is private with respect to image content, but the first model/OCR load still needs network access unless the libraries are later bundled or cached as a PWA.

## Local persistence and deletion model

IndexedDB database: `semacare-information`, object store: `records`.

Persistent information records include:

`id`, `filename`, `relative_path`, `category`, `classification_source`, `sensitive`, `sensitive_reasons`, `meaningful_fields`, `extracted_text`, `ocr_confidence`, `ocr_processed`, `face_count`, `status`, `binned_at`, `export_name`, and `updated_at`.

The app does not silently delete originals. The local bin stores review state and handles where available. Permanent deletion is recorded per file from the actual `removeEntry` result: successful removal preserves the extracted metadata record with `status: image_deleted`; missing permissions, missing handles, and per-file failures keep the record at `status: local_bin` with a deletion error. Cloud metadata cleanup is reported separately and cannot falsely change the physical deletion state. Clearing browser storage can remove this local archive.

## Export behavior

- **Categories CSV:** category-oriented spreadsheet export.
- **Information CSV:** one row per image; structured fields and meaningful text are kept inside that image's row rather than producing one row per OCR fragment.
- **Information JSON:** one structured record per image, with a top-level format/version/export timestamp.
- **View information:** readable in-app archive with search, key fields, sensitivity/deletion status, and expandable record JSON.
- **Renamed images:** exports remaining images using category-based names while preserving the original image format.
- **Performance report:** exports local-only timing evidence for model readiness, classification, OCR, IndexedDB writes, search, bin/deletion operations and exports, together with dataset and browser/device hints. Cache state, network, commit and tester details are added manually before reporting results.

## AWS status

The AWS path exists as an optional backend but is not the default user path at present.

- Region: `eu-west-2` (London).
- Deployed CloudFormation/SAM stack: `semacare-ai`.
- Existing S3 bucket: `semacare-thumbs-tu-9822`.
- API base previously deployed: `https://oe8jltoy47.execute-api.eu-west-2.amazonaws.com`.
- The combined Lambda supports upload URL generation, results, deletion, and S3-triggered image processing.
- Rekognition and Textract are used by the backend path.
- AWS upload requires explicit user consent and should only receive resized temporary thumbnails.
- The frontend currently keeps AWS image processing paused while local processing is validated. Do not expose Supabase service/secret keys in the browser.

## Supabase status

Supabase is optional for account sign-in and metadata synchronisation. Local processing and the local archive should remain usable without it. Browser configuration must use the publishable/anon key; the service key belongs only in Lambda/server configuration.

## Main source files

| File | Responsibility |
|---|---|
| `frontend/index.html` | App structure, controls, views and export actions |
| `frontend/app.js` | State, local AI/OCR, categorisation, archive, bin, exports and interactions |
| `frontend/styles.css` | Visual system, responsive layout and archive/progress styling |
| `frontend/config.js` | Local project configuration; do not commit secrets |
| `frontend/favicon.svg` | Browser tab icon |
| `backend/process_image/categoriser.py` | AWS-side categorisation rules |
| `backend/process_image/handler.py` | AWS image-processing worker |
| `backend/get_upload_urls/handler.py` | Presigned upload URL endpoint |
| `backend/get_results/handler.py` | Results endpoint |
| `backend/delete_scan/handler.py` | Cloud scan deletion endpoint |
| `infra/template.yaml` | SAM/CloudFormation infrastructure |
| `supabase/schema.sql` | Database schema |

## Known limitations

1. Browser-local model accuracy is not guaranteed; manual review remains essential.
2. OCR can fail on blur, low resolution, handwriting, stylised text, rotated images, Urdu/Arabic and other non-Latin content.
3. Images with no real text can produce OCR gibberish; low-confidence or noisy OCR must be suppressed from meaningful fields.
4. A receipt, identity document, bank screen, or address image may be sensitive even when the category is otherwise correct.
5. Local AI libraries currently come from CDNs, so offline-first processing is not complete.
6. The browser cannot reliably move/delete arbitrary files without permission and supported File System Access APIs; Chrome/Edge desktop remain the strongest target.
7. IndexedDB is persistent but device/browser-local, not a replacement for a synchronised database or backup.
8. AWS can incur usage charges and has service quotas; it should remain opt-in with budget alerts and per-scan limits.
9. Android is not implemented yet. The web app should be treated as the behavioural prototype and API contract for a future Android client.

## Recommended next product work

1. Improve OCR quality gates: language/script detection, confidence thresholds, gibberish detection, duplicate-token checks, and document-region preprocessing.
2. Improve People classification evaluation with a labelled test set and explicit face/person test cases.
3. Add a clear privacy review screen for sensitive records before export or deletion.
4. Bundle/cache local models for a real offline/PWA mode.
5. Add duplicate/near-duplicate detection and an explicit duplicate category.
6. Add IndexedDB scan/session persistence so a refresh can recover the current review.
7. Create an Android client using the same local processing concepts and backend contracts; use Android MediaStore/Photo Picker and Recently Deleted semantics.
8. Keep measurable evaluation records: accuracy by category, OCR precision, false-sensitive rate, processing time, and AWS cost per 1,000 images.

## How to continue this project in ChatGPT

For a new conversation, provide this file first and say:

> Treat `docs/PROJECT_CONTEXT.md` as the current source of truth. Inspect the attached repository before proposing changes. Preserve privacy-first behavior, local processing, one information record per image, recoverable deletion, and explicit user review. Do not reintroduce cloud uploads or expose secrets unless explicitly requested.

Then attach or upload the repository as a ZIP, excluding `node_modules`, build output, secrets, `.env`, and generated caches. For a focused task, also attach only the relevant source files and the exact error/screenshot. Ask the new chat to inspect the code before editing and to update this context file whenever behavior changes.
