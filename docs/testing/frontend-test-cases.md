# SEMACARE Frontend Test Cases

This is the browser acceptance suite for the local-first implementation. Run the automated contract tests with:

```powershell
node --test tests/frontend-contract.test.mjs
```

The tests that require a real folder, browser permissions, IndexedDB, OCR models, or an external account are manual acceptance tests. Use a copy of a test folder; never test deletion against irreplaceable originals.

## Automated coverage

The contract suite checks that the app exposes selection controls, local AI consent, progress tracking, categories, recycle-bin actions, the information archive, JSON/CSV/image exports, privacy wording, IndexedDB persistence, OCR progress state, per-image JSON display, and the no-secret frontend contract.

## Manual acceptance cases

| ID | Scenario | Expected result |
|---|---|---|
| F01 | Open without Supabase configuration | Local organiser loads; no fatal error; account is optional |
| F02 | Open in Chrome/Edge desktop | Folder and file pickers are usable |
| F03 | Pick mixed JPG, PNG, WebP and unsupported files | Supported images are selected; unsupported files are ignored; originals are unchanged |
| F04 | Cancel folder selection | Cancellation appears and existing state is unchanged |
| F05 | Pick individual pictures | Selected count and previews appear |
| F06 | Disable local AI and select files | Filename/manual fallback works without claiming AI classification |
| F07 | Enable local AI and scan a mixed folder | Local classification completes without uploading image content |
| F08 | Watch classification progress | Phase, count, percentage, progress bar, and ETA update accurately |
| F09 | Watch OCR on document-heavy images | The card says `Extracting local text: X/Y complete`; completion reaches the total |
| F10 | Re-export JSON after OCR completed | OCR is not rerun; export completes quickly and contains records |
| F11 | Review category cards | Counts add up to visible non-binned images |
| F12 | Review a People image with a face | People is suggested when face detection succeeds; manual correction remains available |
| F13 | Review blank, tiny, or blurry images | Junk can be suggested with a visible quality reason |
| F14 | Review receipt/bank/address/identity image | Sensitive reasons appear; category and Sensitive remain separate |
| F15 | Correct a category manually | Category changes and is not falsely labelled as AI classification |
| F16 | Toggle sensitive manually | Sensitive state and reason display update and persist locally |
| F17 | Search the information archive | Filename, extracted text, fields, category and sensitive reasons are searchable |
| F18 | Open View information | One readable record appears per image; key details and full JSON are expandable |
| F19 | Export information CSV with 10 images | Exactly 10 image rows plus one header row; OCR fragments create no extra rows |
| F20 | Export information JSON | Valid JSON has one record per image plus format/version metadata |
| F21 | Select visible images | Only currently visible filtered images become selected |
| F22 | Move selected images to local bin | Images leave the active view and appear in the recoverable bin; originals are not silently deleted |
| F23 | Restore from local bin | Images return with category and metadata intact |
| F24 | Permanently delete after confirmation | Only confirmed items are deleted when permissions allow; metadata remains as `image_deleted` |
| F25 | Search after original deletion | Archive still finds the saved extracted record |
| F26 | Clear local archive | IndexedDB records are removed after confirmation; original files are unchanged |
| F27 | Export renamed images | Remaining images download in original formats with category names and no collisions |
| F28 | Refresh after a scan | Active review state may be lost, but persistent archive remains available |
| F29 | Use AWS without explicit consent | No image upload occurs; local processing remains available |
| F30 | Sign in and enable metadata consent | Only metadata is sent to Supabase; image data, filenames and paths stay local |
| F31 | AWS or Supabase unavailable | Recoverable error appears and local results remain usable |
| F32 | Resize to tablet/mobile width | Layout stays readable and controls remain reachable |
| F33 | Keyboard-only navigation | Controls, archive search, details and confirmations are reachable and visibly focused |
| F34 | Browser console during local scan | No uncaught app errors; model failures show an actionable fallback |

## Backend and service coverage

Run backend unit tests with dummy credentials so no real AWS account is used:

```powershell
$env:AWS_ACCESS_KEY_ID = "testing"
$env:AWS_SECRET_ACCESS_KEY = "testing"
$env:AWS_SESSION_TOKEN = "testing"
$env:AWS_DEFAULT_REGION = "eu-west-2"
& ".\.venv\Scripts\python.exe" -m pytest -q backend/tests
```

The backend suite covers categorisation, upload URL validation, authentication, response helpers, image processing, Supabase REST behavior, results, deletion, entrypoint routing, and local runner behavior. Live AWS Rekognition/Textract, S3 trigger, API Gateway and Supabase deployment checks must be run separately because they can incur charges or change external data.

## Evidence to record

Record the date, browser/version, image count, category ground truth, predicted category, sensitive result, OCR meaningful/garbage result, processing time, export validity, and manual corrections. Keep live-service tests separate from local tests and never commit credentials or private test images.
