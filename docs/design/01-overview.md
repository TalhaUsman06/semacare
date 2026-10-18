# 01: Overview

## 1. What SEMACARE is

A web app (Chrome/Edge on desktop) that looks at the images in a folder the user picks,
understands what each one is using cloud AI, and sorts it into one of six categories:

| Category | Typical content |
|---|---|
| **Receipts** | Shop receipts, invoices, bills |
| **Screenshots** | Phone/desktop screen captures, web pages, chats |
| **Memes** | Images with short captions over a picture |
| **People** | Photos where people are the main subject |
| **Landscapes** | Nature, outdoor scenery, sky, sea |
| **Other** | Everything else |

The user reviews a category, unticks anything to keep, confirms, and the files move to a
24-hour recycle bin before being permanently removed from the folder.

## 2. Goals for the 5 Oct 2026 MVP

| # | Goal | How we will show it |
|---|---|---|
| G1 | End-to-end flow works: pick → analyse → review → delete → undo | Demo video, E2E checklist (T50) |
| G2 | Semantic categorisation | Precision/recall per category on 50 labelled images (T47) |
| G3 | Privacy-first | Thumbnails deleted after processing; privacy wipe; no filenames leave the device (T45) |
| G4 | Error prevention (Nielsen) | Confirm modal, review mode, recycle bin, reminder (T39–T41), tested in T50 |
| G5 | Speed | Time for 100 images, compared with the 30 s target (T48) |
| G6 | Cost | Measured cost per 1,000 images (T49) |

## 3. Scope

**In scope:** everything in [docs/README.md](../README.md) tasks T01–T54.

**Out of scope for the MVP:** Supabase Realtime, OPFS recycle bin, mobile app, video
files, HEIC decoding, user-defined categories, duplicate detection.

## 4. Users and environment

- **User:** someone on a desktop computer who wants to clean a cluttered folder
  (Screenshots, Downloads, Pictures).
- **Browser:** Google Chrome or Microsoft Edge on desktop (the File System Access API is required).
- **Other browsers** (Firefox, Safari, mobile) see a clear "not supported" message and can
  still view/export results if they get that far. The MVP only guarantees the message.

## 5. Decisions log

These are fixed. Don't re-open them during the build; write any doubts down for the dissertation.

| ID | Decision | Reason |
|---|---|---|
| D1 | **Web first**; mobile is future work. The supervisor has been informed. | 5-day deadline; the backend stays frontend-independent so mobile can reuse it. |
| D2 | **Supabase Auth login.** The browser sends the signed-in access token to the AWS API; Lambda verifies the token with Supabase Auth and derives the user ID from the verified response. | Prevents callers from impersonating another user by supplying an arbitrary ID. |
| D3 | **Two database paths.** The AWS backend uses its server-side Supabase service key; the optional metadata-only browser mode uses a publishable key and owner-scoped RLS. | Never expose the service key in the browser. |
| D4 | **Recycle bin = pending-delete list** in IndexedDB. Files stay on disk until the user empties the bin, or confirms the 24-hour expiry prompt. | Accepted by the student. Browsers cannot delete files in the background. Space is only freed when the bin is emptied. |
| D5 | **Textract only when Rekognition labels suggest text.** | Cuts cost and time. |
| D6 | **Region `eu-west-2` (London)** for AWS and Supabase. | Rekognition and Textract are both available there; fits UK GDPR. |
| D7 | **Thumbnails are 1024 px on the long edge, JPEG quality 0.75** (≈100–200 KB), not strictly 100 KB. | Textract needs text to be about 15 px tall; smaller thumbnails miss receipt text. Document this as a deviation from the proposal. |
| D8 | **Polling every 2 s** instead of Supabase Realtime. | Simpler; good enough for an MVP. |
| D9 | **AWS resources are created in the console once, and code is updated with `deploy.sh`.** | Fast to learn; the screenshots double as dissertation evidence. |
| D10 | **Filenames and paths never leave the device.** Only `image_id`, width, height, `is_png` and `name_hint` (true/false) are sent. | Privacy; `name_hint` is computed locally. |
| D11 | **Privacy auto-wipe is ON by default.** After results reach the browser, the scan's rows are deleted from Supabase. | Privacy-first default; the user can turn it off in Settings. |
| D12 | **MVP limit: 500 images per scan, 50 per upload-URL request.** | Protects the AWS bill; stated as a limitation. |
| D13 | **Rule-based categoriser (first match wins)**, in a pure Python function with unit tests. | Explainable, testable, tunable in minutes. |
| D14 | The proposal's **$0.12 per 1,000 images** claim is replaced by the measured figure (T49). | Rekognition alone is about $1 per 1,000 images. |

## 6. Constraints

- Deadline: **5 Oct 2026**; complete, working web app.
- Budget: aim for about $0 (free tier/credits); billing alert at $5.
- Dev machine: macOS 12.7 (Monterey), Node 22, Python 3.14 locally (Lambda runs Python 3.13).
- Folder access and deletion work only in Chrome/Edge desktop, and permission may be asked again each session.

## 7. Glossary

| Term | Meaning |
|---|---|
| Scan | One run over one picked folder; identified by `scan_id` (UUID) |
| `image_id` | Random UUID per image in a scan; the only image identifier that leaves the device |
| Handle | `FileSystemFileHandle` / `FileSystemDirectoryHandle`: the browser's reference to a real file/folder |
| Thumbnail | The 1024 px JPEG copy that is uploaded; the original is never uploaded |
| Bin | The pending-delete list in IndexedDB |
| Privacy wipe | `DELETE /scans/{scan_id}`: removes all cloud data for a scan |
