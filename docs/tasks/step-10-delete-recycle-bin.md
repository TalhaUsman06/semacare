# Step 10: Review, Delete and Recycle Bin (T38–T41)

This step implements the four usability safeguards from the proposal (Nielsen: *error prevention* and *user control and freedom*):
review mode with unticking, the confirmation modal, the 24-hour recycle bin, and the "Review before deleting" reminder.

**Always test deletion on copies.** Before this step:
```bash
cp -R ~/Pictures/semacare-test ~/Pictures/semacare-delete-test
```
Scan **`semacare-delete-test`** for every test in this step.

---

## T38 · Recycle bin storage, safe delete helpers and header count

| Depends on | Time | Complexity |
|---|---|---|
| T37 | 40 min | High |

**Goal:** bin items (with their file handles) survive page reloads in IndexedDB (decision D4), and files can be deleted safely.

**Steps**
1. Add to `src/lib/fs.ts`:
   - `ensureWritePermission(dir)`: `queryPermission({ mode: "readwrite" })`, then `requestPermission` if needed. It only works inside a click handler.
   - `deleteFile(file, parent, expected)` → `"deleted" | "missing" | "changed" | "failed"`. It first re-reads the file and returns `"changed"` **without deleting** if the size or modified time differs from the scan. Then `parent.removeEntry(file.name)`. A `NotFoundError` returns `"missing"`.
2. Create `src/lib/bin.ts`:
   - `interface BinItem { id, scanId, name, relPath, size, lastModified, category, ocrSummary, thumbBlob?, folderName, file, parent, root, binnedAt }`
   - An idb-keyval store: database `semacare`, store `bin`, keyed by image ID.
   - `addToBin(items)`, `removeFromBin(ids)`, `clearBin()`, `listBin()` (newest first), `isExpired(item, now)`.
   - `makeBinItems(images, scan, category)`: builds the records using the `handles` map and one shared `binnedAt` timestamp.
   - `permanentlyDelete(items)`: asks permission **once per picked folder** (compare roots with `isSameEntry`), deletes each file, removes `deleted` and `missing` items from the bin, and returns a summary `{ deleted, missing, changed, failed, denied, freedBytes }`.
3. Create `src/state/binStore.ts`: `items`, `refresh()`, and an `expiredItems(items)` helper.
4. Update `src/components/Layout.tsx` (final): refresh the bin on mount, show **Recycle bin (n)** in the header, and on every page except `/bin` show an amber banner when items have passed 24 hours, linking to `/bin`.

**Done when**
- [ ] `npx tsc -b` prints nothing
- [ ] The header shows **Recycle bin (0)**
- [ ] DevTools → Application → IndexedDB shows database `semacare` with store `bin`

**Pitfalls**
- Storing a `FileSystemFileHandle` in IndexedDB works in Chrome and Edge. After a reload the handle still points to the file, but permission must be granted again.

---

## T39 · Category Review page and Confirm modal

| Depends on | Time | Complexity |
|---|---|---|
| T38 | 50 min | High |

**Goal:** review a category, untick what to keep, confirm, and move to the bin with **Undo** (design §3.5 and §3.6).

**Steps**
1. Create `src/components/ConfirmDeleteModal.tsx`: title "Move {k} {Category} to the recycle bin?", the body text from design §3.6, **Cancel** (default focus) and a red **Move to bin** button. It can't be closed while busy.
2. Build `src/pages/CategoryReview.tsx`:
   - Redirect to `/categories` if `:name` isn't a valid group.
   - Items: the scan's images in this group that aren't binned.
   - Initial selection: `selectedByDefault` items only.
   - The amber "Review before deleting" banner appears only the first time the category is opened in this scan; opening the page calls `markReviewed`.
   - Toolbar: **Select all**, **Select none**, and "{k} of {n} selected ({size})".
   - Each row (text first): checkbox with a proper `<label>`, 64 px thumbnail, filename, relative path, then the OCR snippet (or the top 3 labels, or the error message with ⚠️), a confidence badge, and the size.
   - Clicking a thumbnail opens a preview modal with labels and text.
   - A fixed footer with **Move {k} to recycle bin**, disabled when k = 0.
   - On confirm: `makeBinItems` → `addToBin` → `setBinned(ids, true)` → refresh the bin store → toast "{k} moved to recycle bin" with **Undo** (which removes them from the bin and calls `setBinned(ids, false)`).

**Done when** (scan `semacare-delete-test`)
- [ ] The reminder shows on the first open of a category, and not on the second
- [ ] Untick 2 of 5 → the button says "Move 3 to recycle bin" → the modal says "You are about to delete 3 …"
- [ ] After confirming, the 3 disappear from the list, the header shows **Recycle bin (3)**, and the files are **still in Finder**
- [ ] **Undo** brings them back and the bin count returns to 0
- [ ] Esc closes the modal; Cancel has the default focus

---

## T40 · Recycle Bin page: restore and permanent delete

| Depends on | Time | Complexity |
|---|---|---|
| T39 | 45 min | High |

**Goal:** restore items, or delete them for real with `removeEntry()` after a second confirmation (design §3.7).

**Steps**
1. Build `src/pages/RecycleBin.tsx`:
   - List: thumbnail, filename, folder/path, category, "moved 3 h ago", "expires in 21 h", size, and a **Restore** button.
   - Restore: remove from the bin; if the item belongs to the current scan, call `setBinned([id], false)`.
   - Expiry banner when items are older than 24 h, with **Delete them permanently**.
   - A fixed footer with **Empty bin now ({n} files, {size})**.
   - Both delete actions open a confirm modal: "Permanently delete {n} files? … This cannot be undone."
   - Call `permanentlyDelete` **directly from the modal's confirm click**, because the browser only shows the permission prompt during a user click.
   - Afterwards, show a summary banner: space freed, files deleted, already gone, kept because changed, refused permission, failed.
2. Update the "minutes ago" display once a minute.

**Done when** (move 3 files to the bin first)
- [ ] `/bin` lists them with "moved just now · expires in 23 h"
- [ ] **Restore** returns one to its category; the file is untouched
- [ ] After a page **reload**, the bin still lists the other 2
- [ ] **Empty bin now** → confirm → allow the browser prompt → "Freed x MB (2 files deleted)" → the files are **gone from Finder**
- [ ] A binned file deleted by hand in Finder is reported as "already gone", with no crash
- [ ] Refusing the permission prompt leaves the items in the bin with a clear message

**Pitfalls**
- `removeEntry` deletes **permanently**; the file does not go to the macOS Trash. That's why the in-app bin and two confirmations exist.

---

## T41 · 24-hour expiry prompt

| Depends on | Time | Complexity |
|---|---|---|
| T40 | 20 min | Low |

**Goal:** items older than 24 h are flagged across the app, and the user confirms their permanent deletion. Browsers can't delete in the background, so the user has to click.

**Steps**
1. Create `src/lib/devtools.ts` with `installDevTools()`, which adds `window.__semacareAgeBin(hours = 25)`: it subtracts that many hours from every bin item's `binnedAt`.
2. In `src/main.tsx`, call `installDevTools()` only when `import.meta.env.DEV` is true.
3. Test: move 2 files to the bin, run `await __semacareAgeBin(25)` in the console, and reload.

**Done when**
- [ ] Every page except `/bin` shows the amber banner "2 items have passed the 24-hour undo window"
- [ ] `/bin` shows "Delete them permanently"; confirming deletes the files
- [ ] In a production build (`npm run build && npx vite preview`), `__semacareAgeBin` is not defined
