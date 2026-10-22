# SEMACARE Latency Measurement Report

## Scope

This report analyses six exported `semacare-performance` JSON reports collected on 22 October 2026 using the same 34-image dataset. The dataset contained 31 JPG files and 3 PNG files, totalling 52,305,075 bytes (approximately 49.9 MiB). Trial 1 was recorded as cold; Trials 2–6 were intended as warm runs.

The results are evidence for this device and dataset only. They must not be generalised to all computers or Android devices.

## Test conditions

| Field | Recorded value |
|---|---|
| Browser | VS Code integrated browser: Code 1.142.0, Chromium 150.0.7871.250, Electron 43.7.7 |
| Device | Lenovo 20EQS09400 |
| CPU | Intel(R) Core(TM) i7-6820HQ CPU @ 2.70GHz |
| RAM | 15.9 GB installed; browser report indicated 16 GB device memory |
| Operating system | Windows 10 Pro |
| Network | Online |
| Dataset | 34 images: 31 JPG, 3 PNG; 52,305,075 bytes |
| Cache state | Trial 1 cold; Trials 2–6 intended warm |
| Folder permissions | File-picker/directory-handle test; no permission failure recorded |
| Commit | `4a1fef4cb19e4fdc9571117afc29ee24f092d972` |
| Tester | Talha Usman |
| Date | 22 October 2026 |

## Run-level results

Times are milliseconds. `PERF-07` is the measured end-to-end scan duration from import through archive save and review readiness.

| Report | Cache | Model readiness | Classification batch | End-to-end | Failures |
|---|---:|---:|---:|---:|---:|
| 1 | Cold | 12,861 | 230,695 | 243,605 | 0 |
| 2 | Warm | 7,661 | 230,353 | 238,064 | 0 |
| 3 | Warm | 12,281 | 229,040 | 241,365 | 0 |
| 4 | Warm | 7,382 | 230,528 | 237,962 | 0 |
| 5 | Warm | 8,070 | 232,409 | 240,527 | 0 |
| 6 | Warm | 10,575 | 239,419 | 250,045 | 0 |

## Metric summary

The percentile calculations use all matching events across the six reports. For metrics with fewer than 20 observations, the median and maximum are shown, and p95 should be treated cautiously.

| Metric | Observations | Median | p95 | Maximum | Proposed target | Assessment |
|---|---:|---:|---:|---:|---|---|
| PERF-01 First interactive UI | 6 | 13,995 | 219,138 | 219,138 | Warm ≤3,000 ms | Not met; one 219-second outlier requires investigation |
| PERF-02 Local model readiness | 6 | 8,070 | 12,861 | 12,861 | Warm ≤15,000 ms | Within proposed target for these runs |
| PERF-03 Preview generation | 6 | 23 | 24 | 24 | ≤1,000 ms/image p95 | Recorded as a batch total, not per-image; do not claim target met without per-image instrumentation |
| PERF-04 Classification | 204 | 1,144 | 117,614 | 143,127 | ≤2,000 ms/image p95 | Not met; timings include severe outliers/queue effects |
| PERF-05 Face detection | 204 | 54 | 347 | 8,299 | ≤2,000 ms/image p95 | p95 within target; one model-start outlier is visible |
| PERF-06 OCR | 84 | 11,973 | 133,566 | 142,169 | ≤8,000 ms/image p95 | Not met; OCR is the dominant bottleneck |
| PERF-07 End-to-end analysis | 6 | 240,527 | 250,045 | 250,045 | Report actual | Median approximately 240.5 seconds for 34 images |
| PERF-08 IndexedDB write | 12 | 28 | 91 | 91 | ≤100 ms/record p95 | Recorded as transactions/batches; not directly comparable to a per-record target |
| PERF-09 Information search | 0 | — | — | — | ≤500 ms p95 | Not measured in these exports |
| PERF-10 Bin/restore update | 0 | — | — | — | ≤500 ms p95 | Not measured in these exports |
| PERF-11 Physical deletion | 0 | — | — | — | Report actual | Not measured in these exports |
| PERF-12 Export generation | 0 | — | — | — | ≤5,000 ms for 200 records | Not measured in these exports |
| PERF-13 Long tasks | 129 | 95 | 473 | 8,305 | No sustained freeze >2,000 ms | Most events were below 2 seconds, but outliers require review |

## Interpretation

1. The run completed successfully six times with no application-level failures recorded.
2. Model readiness improved in the intended warm runs and stayed below the proposed 15-second target.
3. OCR is the main performance problem. The median OCR event was approximately 12.0 seconds and the p95 was approximately 133.6 seconds. This explains the long waits observed during “Reading text in document images”.
4. The end-to-end scan took approximately four minutes for 34 images. At the median, throughput was approximately 0.14 images/second, or 8.5 images/minute.
5. PERF-01 contains a 219-second outlier. This should be reported as an observed anomaly, not silently discarded.
6. Search, bin/restore, physical deletion, CSV/JSON export, and renamed-image export still need dedicated interaction runs. Their absence from the files means they are pending, not passing.

## Evidence limitations

- The browser export does not encode the manually declared cold/warm state; that state was supplied from the test log.
- The reports do not contain CPU load, exact folder permission details, or a direct export-size measurement.
- PERF-03 and PERF-08 are recorded as batch/transaction timings, so per-image/per-record targets need more precise instrumentation before claiming compliance.
- The dataset is small and has a particular mixture of text-heavy, people, screenshot, and other images.
- The network was online, and this does not constitute a fully offline test.

## Required next measurements

Run separate evidence trials for:

1. Information search over the saved archive with 50 and 200 records.
2. Bin and restore operations for 10 and 50 disposable images.
3. Physical deletion using disposable copies, checking the original file after each attempt and recording `deletion_error`.
4. JSON, CSV, readable archive, and renamed-image exports, recording request-to-download time.
5. A larger dataset if an Android-scale claim is required.

Until these runs are completed, PERF-09 through PERF-12 should remain marked **Pending** in Chapter 10.
