# SEMACARE (Web)

A privacy-first picture organiser. Local mode sorts images into **Receipts, Screenshots,
Landscapes, People, Memes, Other** using filename suggestions and manual review. An
optional, consent-based AWS mode uploads resized temporary thumbnails for Rekognition
and Textract classification. The AWS backend is implemented and tested but is not yet
deployed or connected to a live API.

MSc Computer Science project by Talha Usman (419280). Supervisor: Dr Michele Bottone.
Web MVP deadline: **5 October 2026**.

## Repository layout

```
SEMACARE/
├── docs/                 Design documents and the ordered task list (start here)
│   ├── README.md         Index and how to use the docs
│   ├── design/           What we are building and why
│   └── tasks/            T01 … T54, done strictly in order
├── frontend/             Local-first HTML, CSS, and JavaScript browser app
├── backend/              Python AWS Lambda functions
│   ├── get_upload_urls/  POST /upload-urls   → presigned S3 PUT URLs
│   ├── process_image/    S3 trigger          → Rekognition + Textract + categorise
│   ├── get_results/      GET /results        → scan results
│   ├── delete_scan/      DELETE /scans/{id}  → privacy wipe
│   ├── shared/           Supabase REST + HTTP helpers (bundled into every Lambda)
│   ├── scripts/          package.sh, deploy.sh, run_local.py, try_folder.py
│   └── tests/            pytest (categoriser unit tests + fixtures)
├── infra/                AWS config files: S3 CORS/lifecycle/policy, IAM policies (created in T21, T22, T31)
├── supabase/             schema.sql
└── evaluation/           labelled test set + metrics.py (accuracy, speed, cost)
```

## Where to start

Open [docs/README.md](docs/README.md), then do [T01](docs/tasks/step-01-setup.md).

## Free-tier browser mode

The app is in `frontend/`. Configure Supabase only if you want account sign-in and
cloud-saved scan/category metadata:

1. Copy `frontend/config.example.js` to `frontend/config.js` and set the Supabase
   project URL and **publishable/anon key**. Never use a `service_role` or `sb_secret_`
   key in the browser; publishable keys are designed for client apps and access is
   restricted by Auth and RLS. `config.js` is ignored by Git because it is
   project-specific.
2. In Supabase SQL Editor, run `supabase/client-rls.sql` after the existing
   `supabase/schema.sql`. This grants authenticated users access only to their own rows.
3. Enable Email auth in Supabase. For local testing, set the Site URL/redirect URL to
   `http://localhost:5173`; check the email if account confirmation is enabled.
4. From the project root, run
   `backend\.venv\Scripts\python.exe -m http.server 5173 --directory frontend` and open
   `http://localhost:5173` in Chrome or Edge. Create/sign into an app account, give
   metadata consent, then choose a folder or pictures.

Original pictures, names, and paths remain in the browser. In metadata-only mode,
Supabase stores scan and image IDs, dimensions, boolean hints, status, and categories
for the signed-in user. Filename suggestions are not AI results; manual edits are saved
to the database. The local bin does not delete or move original files. CSV exports are
marked with their classification source.

## AWS AI mode (optional; may incur charges)

The AWS backend uses one combined Lambda (`semacare-get-upload-urls`) for the HTTP API
routes and S3 image-processing events. Its package contains all four route/worker
handlers, so no additional Lambda functions are needed. The role must have the combined
permissions in `infra/iam/upload-urls-policy.template.json`; this includes Rekognition
and Textract permissions and can incur charges. Configure an S3 `ObjectCreated` trigger
on the bucket for the `.jpg` suffix, and connect API Gateway HTTP API routes
`POST /upload-urls`, `GET /results`, and `DELETE /scans/{scan_id}` to this same function.
To enable AI, set `apiUrl` in `frontend/config.js` to the HTTPS API Gateway base URL.
A signed-in user must enable both metadata consent and the separate AI thumbnail-upload
consent before choosing images. The browser converts images to temporary JPEG thumbnails
(maximum 1024 pixels); originals, filenames, and paths are not uploaded.
Rekognition/Textract classify thumbnails, which are deleted after processing. AWS
usage may be billable; a budget alert is not a spending cap.

Supabase Free has quotas and plan limits. This mode does not use AWS, upload images, or
make paid AI calls. The browser still works locally when Supabase is not configured.

The AWS backend contains unit-tested Lambda source for presigned upload URLs,
S3-triggered image processing, results retrieval, and scan deletion. The combined
package is ready for the existing Lambda, but API Gateway and the S3 trigger are not
yet configured. Configure these Lambda environment variables:
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_KEY`, `BUCKET_NAME`,
`AWS_REGION=eu-west-2`, and `URL_EXPIRY=300`. The service key must remain in Lambda,
never in the browser. Run backend tests with
`backend\.venv\Scripts\python.exe -m pytest -q backend\tests` on Windows (or
`python -m pytest -q tests` from `backend/` in an activated environment). Copy
`backend/.env.example` to `backend/.env` only for local Lambda testing; never commit
`.env`. Prepare Lambda ZIPs with `python backend/scripts/package.py`. Deployment,
API Gateway, and Rekognition/Textract remain optional and may incur AWS charges.
The ordered T01–T54 checklist in `docs/README.md` remains the source of truth for the
full project plan.
