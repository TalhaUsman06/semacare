# Step 12: Testing and Evaluation (T46–T51)

Method and reporting format: [design/08-testing-evaluation.md](../design/08-testing-evaluation.md).

---

## T46 · Build the labelled test set (50 images)

| Depends on | Time | Complexity |
|---|---|---|
| T45 | 45 min | Low |

**Goal:** an honest ground truth, created **before** running the scan.

**Steps**
1. Put 50 images in `evaluation/test-set/` that **weren't used for tuning** (T32). Target: Receipts 9, Screenshots 9, Memes 8, People 8, Landscapes 8, Other 8. Use your own images or free-licence ones. Keep their natural filenames.
2. Create `evaluation/test-set/labels.csv` by hand (the images are gitignored; this CSV is committed):
   ```csv
   filename,true_category
   IMG_2041.jpg,Receipts
   Screenshot 2026-08-02 at 10.11.png,Screenshots
   ```
3. For ambiguous images (e.g. a screenshot of a receipt), choose what a user would call it, and write the rule you used in the tracker notes.
4. Check the counts:
   ```bash
   python3 -c "import csv,collections;print(collections.Counter(r['true_category'] for r in csv.DictReader(open('evaluation/test-set/labels.csv',encoding='utf-8-sig'))))"
   ```

**Done when**
- [ ] 50 rows, using only the six category names, spelled exactly
- [ ] Every filename in the CSV exists in the folder

---

## T47 · Accuracy evaluation (`metrics.py`)

| Depends on | Time | Complexity |
|---|---|---|
| T46 | 40 min | Medium |

**Goal:** precision, recall and F1 per category, overall accuracy and a confusion matrix. This fixes the proposal's missing accuracy metric.

**Steps**
1. Create `evaluation/metrics.py` (standard library only) with three sub-commands that print Markdown:
   - `accuracy --labels <labels.csv> --results <export.csv>`: joins on `filename`; anything that isn't one of the six categories (error, unsupported) counts as "Other" and is reported separately. Prints the per-category table, overall accuracy, macro F1 and a 6×6 confusion matrix (rows = true, columns = predicted). Fails if `labels.csv` contains an unknown category.
   - `speed --results <export.csv>`: mean, median, p95 and max of `processing_ms` over `done` rows.
   - `cost --results <export.csv>`: cost per 1,000 images from the price constants at the top of the file and the measured share of `textract_used` rows (model in [design/05-ai-pipeline.md §6](../design/05-ai-pipeline.md)).
2. In the app: scan `evaluation/test-set`, click **Export CSV**, and move the file to `evaluation/results/run1.csv`.
3. Run:
   ```bash
   cd evaluation
   python3 metrics.py accuracy --labels test-set/labels.csv --results results/run1.csv | tee report-accuracy.md
   ```
4. Write 3–5 sentences on the main confusions in the matrix.
5. If you change rules after seeing run1, re-run as `run2.csv` and report **both**, stating that run2 was tuned on the test set.

**Done when**
- [ ] `evaluation/report-accuracy.md` contains the table and the matrix
- [ ] Your short analysis is written down

---

## T48 · Performance test (100 images)

| Depends on | Time | Complexity |
|---|---|---|
| T47 | 30 min | Low |

**Goal:** measure against the proposal's target: **100 thumbnails in under 30 seconds**.

**Steps**
1. Make a folder with exactly 100 supported images.
2. Note your connection speed (fast.com) and your Mac model.
3. Scan it **3 times**, a minute apart. After each run, copy `thumbs_s`, `uploads_s` and `total_s` from the console table.
4. Export the CSV of the middle run as `results/perf.csv`, then:
   ```bash
   python3 metrics.py speed --results results/perf.csv | tee report-speed.md
   ```
5. Report the **median** total and whether the 30 s target was met. If it wasn't, say why (e.g. Lambda concurrency of 10 from T31, upload speed) and what would fix it.

**Done when**
- [ ] A table with 3 runs × 3 timings, plus the median
- [ ] `evaluation/report-speed.md` exists

---

## T49 · Cost measurement

| Depends on | Time | Complexity |
|---|---|---|
| T48 | 30 min | Low |

**Goal:** the real cost per 1,000 images, replacing the proposal's $0.12 estimate (decision D14).

**Steps**
1. Open the AWS pricing pages for Rekognition (DetectLabels), Textract (Detect Document Text), Lambda and API Gateway (HTTP APIs) for London. Update the price constants and the "prices checked on" date in `metrics.py`.
2. Run:
   ```bash
   python3 metrics.py cost --results results/perf.csv | tee report-cost.md
   ```
3. The next day (billing lags up to 24 h), cross-check against Console → Billing → Bills.
4. Write a paragraph: the measured cost per 1,000 images, the share of images that needed Textract, how free-tier credits covered testing, and the correction to the proposal.

**Done when**
- [ ] `evaluation/report-cost.md` has the table with a real "prices checked on" date

---

## T50 · Browser and end-to-end tests

| Depends on | Time | Complexity |
|---|---|---|
| T49 | 60 min | Medium |

**Goal:** a pass/fail record for every scenario E1–E20 in [design/08-testing-evaluation.md §4](../design/08-testing-evaluation.md).

**Steps**
1. Create `evaluation/e2e-results.md` with a table: `# | Scenario | Chrome | Edge | Notes`.
2. Run E1–E20 in **Chrome**, then the main path (E1, E5, E6, E11, E14) in **Edge**.
3. Run E18 in **Firefox** and **Safari** (expect the Unsupported page).
4. Fix any failure and re-test that row.
5. Save screenshots of the key screens for the dissertation: consent, progress, categories, review, confirm modal, bin.

**Done when**
- [ ] Every row is marked Pass, or has a written explanation

---

## T51 · (Optional) Small usability test with SUS

| Depends on | Time | Complexity |
|---|---|---|
| T50 | 60–90 min | Low |

**Goal:** light evidence for the usability safeguards. **Skip this if you're behind schedule, or if the ethics approval doesn't cover it.**

**Steps**
1. 3–5 participants, each with a folder of non-sensitive images.
2. Tasks: (a) scan a folder, (b) delete the screenshots but keep one, (c) restore one file from the bin, (d) erase the cloud data.
3. Record task completion, time, errors and comments. Then give the 10-question **System Usability Scale** form.
4. Collect no personal data beyond the answers; don't record images or filenames.

**Done when**
- [ ] A SUS score per participant and the mean, plus 3–5 observations
