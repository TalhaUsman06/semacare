# 05: AI Pipeline and Categorisation

## 1. `process_image` steps

```
S3 ObjectCreated  →  parse key  →  detect_labels  →  needs text?  ──yes──►  detect_document_text
                                                        │no                         │
                                                        ▼                           ▼
                                  read image row (width,height,is_png,name_hint) ◄──┘
                                                        ▼
                                                  categorise()
                                                        ▼
                                              PATCH images row (done)
                                                        ▼
                                         finally: delete S3 object
```

| # | Step | Detail |
|---|---|---|
| 1 | Parse key | `unquote_plus(record.s3.object.key)` → `user_id/scan_id/image_id.jpg`. Reject anything else (log + delete the object). |
| 2 | Labels | `rekognition.detect_labels(Image={"S3Object":{"Bucket":B,"Name":K}}, MaxLabels=25, MinConfidence=60)` |
| 3 | Text needed? | True if any label name is in `TEXT_LABELS` (§2) with confidence ≥ 60 |
| 4 | OCR | `textract.detect_document_text(Document={"S3Object":{"Bucket":B,"Name":K}})`. Join the `Text` of every `LINE` block with `"\n"`. Must happen **before** the delete. |
| 5 | Row meta | `GET images?id=eq.{image_id}&select=width,height,is_png,name_hint` |
| 6 | Categorise | `categorise(labels, ocr_text, width, height, is_png, name_hint)` → `(category, confidence)` |
| 7 | Save | PATCH with category, label names, `ocr_summary`, confidence, `textract_used`, `processing_ms`, `status='done'` |
| 8 | Delete | `s3.delete_object` in `finally`, so it runs even on error |
| 9 | On exception | PATCH `status='error'`, `error=str(e)[:200]`. **Don't re-raise**, so S3 doesn't retry and cause double billing. |

boto3 clients: `Config(retries={"max_attempts": 8, "mode": "adaptive"})`, created **outside** the handler (reused between invocations).

Lambda settings: runtime **python3.13**, memory **512 MB**, timeout **30 s**, async retry attempts **0**
(we handle errors ourselves), architecture arm64 or x86_64 (either is fine).

## 2. Label sets (edit in T32 after seeing real labels)

```python
TEXT_LABELS = {"Text", "Document", "Receipt", "Paper", "Page", "Menu", "Poster",
               "Screenshot", "Webpage", "Web Page", "File", "Label", "Invoice",
               "Letter", "Book", "Newspaper", "Business Card", "Advertisement", "Flyer",
               "Brochure", "Word", "Number", "Symbol", "Chart", "Diagram"}

RECEIPT_LABELS  = {"Receipt", "Invoice", "Bill"}
SCREEN_LABELS   = {"Text", "Screenshot", "Webpage", "Web Page", "File", "Electronics",
                   "Computer", "Monitor", "Screen", "Phone", "Mobile Phone", "Word", "Number"}
MEME_PIC_LABELS = {"Person", "Face", "Animal", "Pet", "Dog", "Cat", "Cartoon",
                   "Comics", "Poster", "Head", "Baby", "Bird"}
DOC_LABELS      = {"Document", "Page", "Paper", "Letter", "Receipt", "Invoice", "Menu"}
PEOPLE_LABELS   = {"Person", "Human", "Face", "Adult", "Man", "Woman", "Child",
                   "Boy", "Girl", "Selfie", "Portrait", "Head", "Smile", "Crowd"}
LANDSCAPE_LABELS= {"Landscape", "Nature", "Outdoors", "Scenery", "Mountain", "Sea",
                   "Ocean", "Beach", "Sky", "Sunset", "Sunrise", "Water", "Lake",
                   "Forest", "Tree", "Field", "Countryside", "Coast", "Shoreline",
                   "Horizon", "Cloud", "Desert", "Valley", "Mountain Range", "Hill"}
```

## 3. Categorisation rules: first match wins

Input: `labels` = list of `{name, confidence}`; `ocr` = str (may be empty); `width`, `height` (original);
`is_png`; `name_hint`.

Helpers:
- `conf(set)` = highest confidence among labels whose name is in `set` (0 if none)
- `words` = number of word tokens in `ocr` (`re.findall(r"\w+", ocr)`)
- `ratio` = `max(width,height) / min(width,height)`
- `screen_ratio` = `1.54 ≤ ratio ≤ 1.80` (16:10 to 16:9 desktop; deliberately excludes 4:3 and 3:2 camera photos) **or** `1.95 ≤ ratio ≤ 2.40` (phone 19.5:9, 20:9)
- `receipt_hits` = number of distinct matches in lowercase `ocr` of:
  - keywords: `total`, `subtotal`, `sub total`, `vat`, `tax`, `receipt`, `invoice`, `amount due`,
    `change`, `cash`, `card`, `visa`, `mastercard`, `balance`, `qty`
  - symbols: `£`, `$`, `€`
  - price pattern: `\b\d+[.,]\d{2}\b` (counts once if present)

| Order | Category | Rule | Confidence stored |
|---|---|---|---|
| 1 | **Receipts** | `receipt_hits ≥ 3` **or** `conf(RECEIPT_LABELS) ≥ 80` **or** (`receipt_hits ≥ 2` and `conf(DOC_LABELS) ≥ 70`) | `min(99, 60 + 10 × receipt_hits)` or the label confidence, whichever is higher |
| 2 | **Screenshots** | `name_hint` **or** (`screen_ratio` and `conf(SCREEN_LABELS) ≥ 70` and (`is_png` or `words ≥ 5`)) | `95` if `name_hint`, else `conf(SCREEN_LABELS)` |
| 3 | **Memes** | `3 ≤ words ≤ 40` and `conf(MEME_PIC_LABELS) ≥ 70` and `conf(DOC_LABELS) < 70` | `conf(MEME_PIC_LABELS) × 0.9` |
| 4 | **People** | `conf(PEOPLE_LABELS) ≥ 80` | `conf(PEOPLE_LABELS)` |
| 5 | **Landscapes** | `conf(LANDSCAPE_LABELS) ≥ 75` and `conf(PEOPLE_LABELS) < 80` | `conf(LANDSCAPE_LABELS)` |
| 6 | **Other** | Anything else | `0` |

Why this order: text-based signals (receipt, screenshot, meme) are the most specific, and a
receipt photo often also contains a person's hand ("Person"), so they are checked first.

## 4. `ocr_summary`

```python
summary = re.sub(r"\s+", " ", ocr).strip()[:200]
```
Store `None` if empty. **Privacy:** this can contain personal data from the user's own
images (names on receipts). This is why the auto-wipe is ON by default (D11).

## 5. Required unit tests (`backend/tests/test_categoriser.py`, T29)

| # | Input (summary) | Expected |
|---|---|---|
| 1 | OCR "TESCO … SUBTOTAL 10.40 VAT 2.00 TOTAL £12.40", labels Text 99 | Receipts |
| 2 | Label Receipt 92, no OCR | Receipts |
| 3 | `name_hint=True`, anything else | Screenshots |
| 4 | 1170×2532 PNG, labels Text 95, OCR 30 words | Screenshots |
| 5 | 1920×1080 JPEG, labels Webpage 88, OCR 50 words | Screenshots |
| 6 | 4032×3024 JPEG, labels Person 95 + Text 90, OCR "WHEN YOU FINALLY FIX THE BUG" | Memes (4:3 is not a screen ratio) |
| 7 | Labels Person 97, Face 96, no OCR | People |
| 8 | Labels Landscape 90, Mountain 88, Sky 95 | Landscapes |
| 9 | Labels Landscape 90, Person 92 | People |
| 10 | Labels Food 90, Plate 85 | Other |
| 11 | Empty labels, empty OCR | Other |
| 12 | Document 90, OCR "Dear Sir … 300 words" | Other (not a meme; >40 words and document) |

## 6. Cost model (verify prices on the AWS pricing pages in T49)

| Item | Unit price (approx., eu-west-2, first tier) | Per 1,000 images |
|---|---|---|
| Rekognition DetectLabels | ~$1.00 / 1,000 images | $1.00 |
| Textract DetectDocumentText | ~$1.50 / 1,000 pages | $1.50 × (share of images needing text) |
| Lambda | 512 MB × ~2 s | ≈ $0.02 |
| S3 PUT/GET/DELETE + storage | | < $0.01 |
| API Gateway HTTP | ~$1.00–1.29 / million requests | < $0.01 |

Example: if 40% of images trigger Textract, the cost is about **$1.00 + 0.40×$1.50 + ~$0.03 ≈ $1.63 per 1,000 images**.
New-account free-tier allowances or credits may make testing free. The proposal's $0.12 figure is corrected in the dissertation.
