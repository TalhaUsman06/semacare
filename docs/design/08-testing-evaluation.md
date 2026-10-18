# 08: Testing and Evaluation Plan

## 1. Test levels

| Level | What | Tool | Task |
|---|---|---|---|
| Unit | `categorise()` rules (12 cases) | pytest | T29 |
| Integration | Supabase REST via curl | curl | T20 |
| Integration | AI services on a sample image | AWS CLI | T23 |
| Integration | One image: browser → S3 → Lambda → row → deleted | Chrome + Supabase table view | T31 |
| End-to-end | Full user flow checklist (§4) | Manual | T50 |
| Accuracy | 50 labelled images → precision/recall/F1, confusion matrix | `evaluation/metrics.py` | T46–T47 |
| Performance | 100 images, time per stage | On-screen timings | T48 |
| Cost | Calls counted → $ per 1,000 images | `metrics.py cost` | T49 |
| Browser | Chrome, Edge, Firefox, Safari | Manual | T50 |
| Usability (optional) | 3–5 participants, tasks + SUS | Form | T51 |

## 2. Accuracy method

- **Test set:** 50 of your own images. Aim for about 8 per category (Receipts 9, Screenshots 9, Memes 8, People 8, Landscapes 8, Other 8). No images of other people without their permission; use your own photos or public-domain images (e.g. Unsplash/Pexels licence).
- **Ground truth:** `evaluation/test-set/labels.csv`, created **before** running the scan (to avoid bias):
  ```
  filename,true_category
  receipt_01.jpg,Receipts
  ```
- **Run:** scan the folder in SEMACARE and **Export CSV** to `evaluation/results/run1.csv`.
- **Metrics per category:** precision = TP/(TP+FP), recall = TP/(TP+FN), F1; plus overall accuracy and a 6×6 confusion matrix.
- **Iteration:** tune thresholds once (T32 happens before this with *different* images). Report run1 honestly; if you tune after run1, report both run1 and run2 and say so.

## 3. Performance method

- 100 images (can include the 50 test images + 50 more), a normal home connection, and Chrome.
- Record from the Scan screen / `console.table`:
  - T_thumbs = thumbsDoneAt − startedAt
  - T_upload = uploadsDoneAt − startedAt
  - T_total = allDoneAt − startedAt
  - Mean and p95 `processing_ms` from the CSV
- Run 3 times; report the median. Compare with the 30 s target. Note your connection speed (e.g. from fast.com) and CPU.

## 4. End-to-end checklist (T50)

| # | Scenario | Expected |
|---|---|---|
| E1 | First visit | Consent shows; Continue is disabled until ticked |
| E2 | Consent, reload | Goes straight to Select Folder |
| E3 | Cancel the folder picker | No error; still on Select Folder |
| E4 | Pick an empty folder | "No JPG, PNG or WebP images" message |
| E5 | Pick a folder with 20 mixed images + 1 .txt + 1 .heic | 21 images found, .txt skipped, .heic → Unsupported |
| E6 | Run the scan | All three bars reach 100%; Categories shows counts that add up |
| E7 | S3 console after the scan | Bucket is empty |
| E8 | Supabase after the scan (auto-wipe ON) | No rows for that scan |
| E9 | Auto-wipe OFF, scan, then "Erase now" | Rows present, then gone |
| E10 | Open a category for the first time | Reminder shown; not shown again after dismissing |
| E11 | Untick 2 of 5, Move to bin | Confirm says 3; 3 move to the bin; files still on disk |
| E12 | Undo toast | Items return to the category |
| E13 | Restore from the bin | Item returns; file untouched |
| E14 | Empty bin | Permission prompt (if needed); files gone from Finder; "Freed x MB" |
| E15 | Item binned > 24 h ago (simulate via DevTools, T41) | Expiry banner; confirm deletes |
| E16 | File deleted in Finder before emptying the bin | Reported as "already gone"; no crash |
| E17 | Network off during upload | Errors counted; scan finishes; no auto-delete of errored images |
| E18 | Firefox / Safari | Unsupported page |
| E19 | Reload in the middle of a scan | Scan lost, bin kept (documented limitation) |
| E20 | Export CSV | File opens in Excel/Numbers with correct columns |

## 5. Results to put in the dissertation

- Table: precision/recall/F1 per category + overall accuracy.
- Figure: confusion matrix.
- Table: timings (median of 3), and whether the 30 s target was met.
- Table: cost per 1,000 images (measured Textract share), compared with the proposal's $0.12.
- Table: E1–E20 pass/fail.
- (Optional) SUS score and quotes.
