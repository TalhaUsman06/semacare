# Step 9: UI Screens (T36–T37)

Screen wording and behaviour are specified in [design/06-frontend.md §3](../design/06-frontend.md). Use the copy from the design exactly.

---

## T36 · Consent and Unsupported pages

| Depends on | Time | Complexity |
|---|---|---|
| T35 | 20 min | Low |

**Goal:** nothing is uploaded before explicit consent (GDPR, design §3.1). Unsupported browsers get a clear message (§3.9).

**Steps**
1. Build `src/pages/Consent.tsx`:
   - If consent already exists, redirect to `/select`.
   - Title, the five-paragraph privacy notice from the design (word for word), the consent checkbox, and a **Continue** button that's disabled until the box is ticked.
   - Continue calls `giveConsent()`, makes sure the user ID exists, and navigates to `/select`.
2. Build `src/pages/Unsupported.tsx` with the message from §3.9.
3. Test: delete `semacare.consent.v1` in DevTools → Application → Local Storage, then reload `/`.

**Done when**
- [ ] Continue is disabled until the checkbox is ticked; afterwards you land on `/select`
- [ ] Reloading `/` after consenting goes straight to `/select`
- [ ] Opening `/select` without consent redirects to `/`
- [ ] In Safari or Firefox, `/select` redirects to the Unsupported page

---

## T37 · Categories overview and CSV export

| Depends on | Time | Complexity |
|---|---|---|
| T36 | 40 min | Medium |

**Goal:** the category cards with counts and sizes (§3.4), the cloud-data status, and a CSV export used for the evaluation (§7).

**Steps**
1. Create `src/lib/categories.ts`:
   - `type Group = Category | "Unsupported"` and `GROUPS` in display order: Receipts, Screenshots, Memes, People, Landscapes, Other, Unsupported.
   - `GROUP_META`: emoji, badge classes (full Tailwind strings) and a one-line description per group.
   - `groupOf(item)`: `unsupported` stage → "Unsupported"; `done` → its category; anything else (errors) → "Other".
   - `isGroup(value)` type guard.
   - `selectedByDefault(item)`: true only for `done` images, so errors and unsupported files are never pre-selected for deletion.
2. Create `src/lib/csv.ts` with `exportScanCsv(scan)`:
   - Columns: `filename, rel_path, category, confidence, labels, ocr_summary, textract_used, processing_ms, status, size_bytes`.
   - Quote every field, escape `"` as `""`, join labels with `|`, and start the file with a UTF-8 BOM so Excel reads it correctly.
   - `status` is `done`, `unsupported` or `error`. Download as `semacare-results-<first 8 chars of scan id>.csv`.
3. Build `src/pages/Categories.tsx`:
   - Heading and summary: images analysed, time taken, size that could be freed.
   - Buttons **Export CSV** and **New scan**.
   - Banners: scan still running (link to `/scan`); green "Cloud data for this scan has been erased ✓" when wiped; otherwise "still stored" (or the wipe error) with an **Erase now** button calling `wipeCloudData`.
   - One card per group: emoji, name, description, count, total size, and a "Reviewed ✓" badge. Images with `binned` are excluded. Cards with a count of 0 are greyed out and not clickable. The Unsupported card is hidden when empty.
4. Run a scan, then export the CSV and open it in Numbers or Excel.

**Done when**
- [ ] The card counts add up to the number of images
- [ ] Empty categories are greyed out and can't be clicked
- [ ] The CSV has the 10 columns and one row per image
- [ ] "Erase now" removes the rows in Supabase and the banner turns green

**Pitfalls**
- Filenames appear only in this local CSV. They must never be sent to the API.
