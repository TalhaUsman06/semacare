# SEMACARE Docs: Index

## Current source of truth

Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) first when continuing development in a new
chat or with a new contributor. It describes the implemented local-first workflow,
current categories, OCR and persistent information archive, export behavior, AWS status,
limitations, and Android direction. The older ordered task plan below is retained as
project history and planning material; it is not a guarantee that every task still
matches the current implementation.

## Testing

The current frontend acceptance matrix is in [testing/frontend-test-cases.md](testing/frontend-test-cases.md).
It separates automated contract tests, browser acceptance tests, and live AWS/Supabase
checks so privacy and cost-sensitive tests are not accidentally run against real data.

## How to use these docs

1. Read the **design** files once, in order (about 30 minutes). They explain *what* to build and *why*.
2. Work through the **tasks** **strictly in order**: T01, then T02, then T03, and so on.
   - Do not start a task until the one before it passes its **"Done when"** checks.
   - Each task lists **Depends on**. If a dependency isn't done, stop and finish it first.
   - When a task is finished, tick it in the tracker below (`[ ]` becomes `[x]`) and commit:
     `git commit -m "T0X: <task title>"`.
3. If a task fails, write the problem in the **Notes** column of the tracker. That becomes material for the dissertation's "Challenges" section.

## Design documents

| # | File | What it covers |
|---|---|---|
| 01 | [design/01-overview.md](design/01-overview.md) | Scope, goals, decisions log, constraints |
| 02 | [design/02-architecture.md](design/02-architecture.md) | Components, data flow, S3 key layout, sequence |
| 03 | [design/03-api.md](design/03-api.md) | Exact request/response contracts for every endpoint |
| 04 | [design/04-database.md](design/04-database.md) | Supabase schema (SQL), status life cycle |
| 05 | [design/05-ai-pipeline.md](design/05-ai-pipeline.md) | Rekognition/Textract calls, categorisation rules |
| 06 | [design/06-frontend.md](design/06-frontend.md) | Screens, routes, state, worker, UX copy |
| 07 | [design/07-security-privacy.md](design/07-security-privacy.md) | IAM policies, CORS, data retention, GDPR |
| 08 | [design/08-testing-evaluation.md](design/08-testing-evaluation.md) | Test plan, accuracy/speed/cost method |
| 09 | [design/09-limitations-future-work.md](design/09-limitations-future-work.md) | For the dissertation |

## Task files

| Step | File | Tasks |
|---|---|---|
| 1 | [tasks/step-01-setup.md](tasks/step-01-setup.md) | T01–T05 Setup and Prerequisites |
| 2 | [tasks/step-02-scaffolding.md](tasks/step-02-scaffolding.md) | T06–T13 Project Scaffolding |
| 3 | [tasks/step-03-folder-thumbnails.md](tasks/step-03-folder-thumbnails.md) | T14–T18 Folder Access and Thumbnails |
| 4 | [tasks/step-04-database.md](tasks/step-04-database.md) | T19–T20 Database |
| 5 | [tasks/step-05-aws-storage-iam.md](tasks/step-05-aws-storage-iam.md) | T21–T23 S3, IAM and AI Service Check |
| 6 | [tasks/step-06-upload-pipeline.md](tasks/step-06-upload-pipeline.md) | T24–T28 Upload Pipeline |
| 7 | [tasks/step-07-ai-processing.md](tasks/step-07-ai-processing.md) | T29–T32 AI Processing and Categorisation |
| 8 | [tasks/step-08-results-privacy-api.md](tasks/step-08-results-privacy-api.md) | T33–T35 Results and Privacy API |
| 9 | [tasks/step-09-ui-screens.md](tasks/step-09-ui-screens.md) | T36–T37 UI Screens |
| 10 | [tasks/step-10-delete-recycle-bin.md](tasks/step-10-delete-recycle-bin.md) | T38–T41 Review, Delete and Recycle Bin |
| 11 | [tasks/step-11-hardening.md](tasks/step-11-hardening.md) | T42–T45 Privacy Settings and Hardening |
| 12 | [tasks/step-12-testing-evaluation.md](tasks/step-12-testing-evaluation.md) | T46–T51 Testing and Evaluation |
| 13 | [tasks/step-13-deployment.md](tasks/step-13-deployment.md) | T52–T54 Deployment and Submission |

Each task has the same layout: what it depends on, time and complexity, the goal, numbered steps, a **Done when** checklist, and pitfalls.
The tasks say exactly what each file must do; the source code itself is written when the task is started.

## Day plan (deadline 5 Oct 2026)

Work starts on 1 Oct, so the plan is tight. T51 is optional; skip it first if you fall behind.

| Day | Date | Tasks | Goal by end of day |
|---|---|---|---|
| 1 | Thu 1 Oct | T01–T18 | Tools and accounts ready; the app picks a folder and makes thumbnails |
| 2 | Fri 2 Oct | T19–T32 | Images go from the browser to S3 to AI to a Supabase row |
| 3 | Sat 3 Oct | T33–T41 | Results, all screens, review, delete and recycle bin work |
| 4 | Sun 4 Oct | T42–T50 | Privacy wipe, hardening, and the accuracy, speed and cost figures |
| 5 | Mon 5 Oct | T52–T54 | Deployed, demo recorded, submitted |

## Progress tracker

| ✓ | ID | Task | Notes |
|---|---|---|---|
| [x] | T01 | Install and verify local tools | 1 Oct: Node 22.18, npm 10.9, Python 3.14.3, Git 2.37.1, AWS CLI 2.37.7, Chrome + Edge |
| [x] | T02 | Initialise the Git repository | 1 Oct: local repo + first commit done; identity set for this repo only. GitHub push still pending (repo not created yet) |
| [ ] | T03 | Create and secure the AWS account and CLI profile | |
| [ ] | T04 | Set AWS billing alerts | |
| [ ] | T05 | Create the Supabase project and store secrets | |
| [ ] | T06 | Scaffold the frontend (Vite + React + TypeScript) | |
| [ ] | T07 | Add Tailwind CSS | |
| [ ] | T08 | Install libraries and configure TypeScript | |
| [ ] | T09 | Frontend configuration and environment | |
| [ ] | T10 | Anonymous identity, consent, browser support and settings | |
| [ ] | T11 | Shared UI components and helpers | |
| [ ] | T12 | Routing shell with placeholder pages | |
| [ ] | T13 | Backend skeleton, Python virtual environment and scripts | |
| [ ] | T14 | Folder picker and recursive image walk (`fs.ts`) | |
| [ ] | T15 | Scan store (Zustand) and handles map | |
| [ ] | T16 | Thumbnail Web Worker | |
| [ ] | T17 | Worker pool with progress (`pool.ts`, `thumbnails.ts`) | |
| [ ] | T18 | Folder → thumbnails flow (Select Folder and Scan Progress pages) | |
| [ ] | T19 | Create the Supabase schema | |
| [ ] | T20 | Verify Supabase REST access with curl | |
| [ ] | T21 | Create the S3 bucket (private, encrypted, lifecycle, CORS) | |
| [ ] | T22 | Create the IAM roles (least privilege) | |
| [ ] | T23 | Test Rekognition and Textract from the CLI | |
| [ ] | T24 | Shared Python helpers (`supabase_rest.py`, `responses.py`) | |
| [ ] | T25 | Write the `get_upload_urls` Lambda | |
| [ ] | T26 | Deploy the `get_upload_urls` Lambda | |
| [ ] | T27 | Create the API Gateway HTTP API and CORS | |
| [ ] | T28 | Frontend upload client (`api.ts`, `upload.ts`, scan runner v2) | |
| [ ] | T29 | Categoriser and unit tests | |
| [ ] | T30 | Write the `process_image` Lambda | |
| [ ] | T31 | Deploy `process_image`, connect the S3 trigger, end-to-end check | |
| [ ] | T32 | Tune the rules with real labels | |
| [ ] | T33 | `get_results` Lambda and `GET /results` route | |
| [ ] | T34 | `delete_scan` Lambda and `DELETE /scans/{scan_id}` route | |
| [ ] | T35 | Frontend results polling (scan runner v3) | |
| [ ] | T36 | Consent and Unsupported pages | |
| [ ] | T37 | Categories overview and CSV export | |
| [ ] | T38 | Recycle bin storage, safe delete helpers and header count | |
| [ ] | T39 | Category Review page and Confirm modal | |
| [ ] | T40 | Recycle Bin page: restore and permanent delete | |
| [ ] | T41 | 24-hour expiry prompt | |
| [ ] | T42 | Settings page (privacy toggle) | |
| [ ] | T43 | Automatic privacy wipe after a scan | |
| [ ] | T44 | Error handling and edge cases | |
| [ ] | T45 | Security check | |
| [ ] | T46 | Build the labelled test set (50 images) | |
| [ ] | T47 | Accuracy evaluation (`metrics.py`) | |
| [ ] | T48 | Performance test (100 images) | |
| [ ] | T49 | Cost measurement | |
| [ ] | T50 | Browser and end-to-end tests | |
| [ ] | T51 | (Optional) Small usability test with SUS | |
| [ ] | T52 | Deploy the frontend to Vercel | |
| [ ] | T53 | Production smoke test | |
| [ ] | T54 | Demo recording, README, tag v1.0, submission | |
