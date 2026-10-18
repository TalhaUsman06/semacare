# Step 3: Folder Access and Thumbnails (T14–T18)

By the end of this step you can pick a folder in Chrome and watch thumbnails being made. Nothing is uploaded yet.

**Prepare a test folder first** (used in every later step):
```bash
mkdir -p ~/Pictures/semacare-test
```
Copy 20–30 of your own images into it: receipts, phone screenshots (PNG), a meme or two, people, landscapes, food/objects.
Add one `.txt` file and, if you have one, a `.heic` photo. Use only your own images or free-licence ones (Unsplash, Pexels).

---

## T14 · Folder picker and recursive image walk (`fs.ts`)

| Depends on | Time | Complexity |
|---|---|---|
| T13 | 30 min | Medium |

**Goal:** open a folder with read/write permission and list every image in it, without reading pixels yet.

**Steps**
1. Create `src/lib/fs.ts` with:
   - `interface FoundFile { id, name, relPath, size, lastModified, isPng, nameHint, supported, file: FileSystemFileHandle, parent: FileSystemDirectoryHandle }`
   - `pickFolder()`: calls `window.showDirectoryPicker({ id: "semacare", mode: "readwrite", startIn: "pictures" })`. Returns `null` when the user cancels (`AbortError`); rethrows anything else.
   - `walkFolder(root, includeSubfolders)`: returns `{ images: FoundFile[], skipped: number }`.
2. Rules for the walk:
   - Skip names starting with `.` (e.g. `.DS_Store`).
   - Recurse into sub-folders only when `includeSubfolders` is true; `relPath` is the path inside the picked folder.
   - Extension in `SUPPORTED_EXTENSIONS` → `supported: true`. In `UNSUPPORTED_IMAGE_EXTENSIONS` → `supported: false` (listed, never uploaded). Anything else → count in `skipped`.
   - `id` is `crypto.randomUUID()`; `isPng` comes from the extension.
   - `nameHint` is true when the filename matches a screenshot pattern (`screenshot`, `screen shot`, `screen_shot`, plus a few other languages). This boolean is the **only** thing derived from the filename that leaves the device (decision D10).
   - Sort the result by `relPath`.
3. Temporary test: a button on the placeholder Select Folder page that logs the walk result.

**Done when**
- [ ] Picking `~/Pictures/semacare-test` logs the images with correct `relPath`, `size` and `isPng`; the `.heic` has `supported: false`
- [ ] The `.txt` is counted in `skipped`
- [ ] Cancelling the picker gives `null`, with no error
- [ ] `npx tsc -b` prints nothing

**Pitfalls**
- Chrome refuses some folders themselves (home, Desktop, Documents, Downloads) with a `SecurityError`, but allows folders inside them. That's why the test folder is `~/Pictures/semacare-test`.
- macOS may ask whether Chrome can access your Pictures folder. Click OK. If you refused, fix it in System Preferences → Security & Privacy → Privacy → Files and Folders.

---

## T15 · Scan store (Zustand) and handles map

| Depends on | Time | Complexity |
|---|---|---|
| T14 | 20 min | Medium |

**Goal:** one place that holds the current scan. Types are specified in [design/06-frontend.md §4](../design/06-frontend.md).

**Steps**
1. Create `src/state/scanStore.ts` with the `Category`, `Stage`, `ImageItem` and `Scan` types from the design. Add to them: `ImageItem.binned?: boolean`, `Scan.finished: boolean`, `Scan.wipeError?: string`.
2. Export `handles`: a module-level `Map<string, { file, parent }>` kept **outside** React state. File handles are the keys to real files, so they must never be logged or sent anywhere.
3. Export `useScanStore` with these actions:

   | Action | Behaviour |
   |---|---|
   | `startScan(folderName, rootHandle, files)` | Frees old thumbnail URLs, clears and refills `handles`, creates a scan with a new UUID. Supported files start at stage `found`, others at `unsupported` |
   | `updateImage(id, patch)` / `updateMany(patches)` | Merge patches into images |
   | `setTiming(key, value)` | `thumbsDoneAt`, `uploadsDoneAt`, `allDoneAt` |
   | `patchScan(patch)` | `wiped`, `wipeError`, `cancelled`, `finished` |
   | `markReviewed(group)` | Records that a category was opened |
   | `setBinned(ids, binned)` | Hides or shows images in category lists |
   | `reset()` | Clears everything |

4. Every update must create new objects so React re-renders.

**Done when**
- [ ] `npx tsc -b` prints nothing

---

## T16 · Thumbnail Web Worker

| Depends on | Time | Complexity |
|---|---|---|
| T15 | 25 min | Medium |

**Goal:** turn one image `File` into a JPEG of at most 1024 px off the main thread (decision D7), and report the **original** width and height. The contract is in [design/06-frontend.md §6](../design/06-frontend.md).

**Steps**
1. Create `src/workers/thumbnail.worker.ts`. On each message `{ id, file }`:
   1. `createImageBitmap(file)` (this applies EXIF rotation).
   2. `scale = min(1, THUMB_MAX_EDGE / max(width, height))`: shrink only, never enlarge.
   3. Draw onto an `OffscreenCanvas`, after filling it **white** (transparent PNG areas would otherwise turn black in JPEG).
   4. `convertToBlob({ type: "image/jpeg", quality: THUMB_QUALITY })`, then `bitmap.close()`.
   5. Post `{ id, ok: true, blob, width, height }`.
2. On any error, post `{ id, ok: false, error }`. Such images become `unsupported`.
3. Export the `ThumbRequest` and `ThumbResponse` types from the worker file.

**Done when**
- [ ] `npx tsc -b` prints nothing (tested for real in T18)

---

## T17 · Worker pool with progress (`pool.ts`, `thumbnails.ts`)

| Depends on | Time | Complexity |
|---|---|---|
| T16 | 20 min | Medium |

**Goal:** make thumbnails with up to 4 workers in parallel, reporting each result as it finishes.

**Steps**
1. Create `src/lib/pool.ts`:
   - `sleep(ms)`
   - `runPool(items, concurrency, fn)`: runs `fn` over the items with at most `concurrency` at once.
   - `withRetry(fn, attempts = 3, baseDelayMs = 500)`: exponential backoff; errors with an HTTP status of 400–499 fail immediately without retrying.
2. Create `src/lib/thumbnails.ts` with `makeThumbnails(jobs, onResult, isCancelled)`:
   - Pool size: `min(4, navigator.hardwareConcurrency || 2, jobs.length)`.
   - Create each worker with `new Worker(new URL("../workers/thumbnail.worker.ts", import.meta.url), { type: "module" })`. Vite needs it written exactly this way to bundle the worker.
   - Each worker takes jobs from a shared queue one at a time, calls `onResult` for each, and is terminated at the end.

**Done when**
- [ ] `npx tsc -b` prints nothing

---

## T18 · Folder → thumbnails flow (Select Folder and Scan Progress pages)

| Depends on | Time | Complexity |
|---|---|---|
| T17 | 45 min | Medium |

**Goal:** the first real user flow: choose a folder → **Start scan** → progress bars → thumbnails ready. Page specs: [design/06-frontend.md §3.2 and §3.3](../design/06-frontend.md).

**Steps**
1. Create `src/lib/scanRunner.ts` (**version 1**) with `runScan()`:
   - Store the scan ID under `LAST_SCAN_KEY`.
   - Mark all `found` images `thumbnailing`, run `makeThumbnails`, and for each result set `thumb_ready` (with `thumbBlob`, `thumbUrl`, `width`, `height`) or `unsupported`.
   - `isCancelled()` is true when the store's scan ID changed or `cancelled` is set.
   - Set `thumbsDoneAt`. Until T28, also set `allDoneAt` and `finished: true` so the progress page completes.
2. Create `src/components/Guards.tsx`: `RequireConsent` (else `/`), `RequireSupport` (else `/unsupported`), `RequireScan` (else `/select`).
3. Update `src/App.tsx` to wrap the routes with the guards as listed in design §2.
4. Build the final `src/pages/SelectFolder.tsx`:
   - **Choose folder** button and an **Include sub-folders** checkbox (re-walks when changed).
   - Summary: folder name, image count, total size, skipped files, unsupported count.
   - Warning above 500 images; message for an empty folder.
   - Friendly messages for `SecurityError` (blocked folder: "choose a sub-folder") and `NotAllowedError`.
   - **Start scan**: `startScan(...)` with the first 500 supported files plus the unsupported ones, call `runScan()`, navigate to `/scan`.
5. Build the final `src/pages/ScanProgress.tsx`:
   - Three bars: Preparing thumbnails, Uploading, Analysing (the last two count only analysable images).
   - Elapsed timer (updates every 200 ms), error count, **Cancel** button.
   - A `beforeunload` warning while the scan runs.
   - When `finished`: "Done in x s", a **View results** button, and auto-navigation to `/categories` after 1.5 s.
6. The Consent page is still a placeholder, so give consent by hand in the DevTools console:
   ```js
   localStorage.setItem("semacare.consent.v1", new Date().toISOString())
   ```
7. Test with `semacare-test`.

**Done when**
- [ ] "Preparing thumbnails" reaches n/n and the page says "Done in x s", then moves to `/categories` (still a placeholder)
- [ ] The page stays responsive while thumbnails are made (the timer keeps ticking)
- [ ] The image count matches Finder; unticking *Include sub-folders* re-counts
- [ ] Opening `/scan` after a reload redirects to `/select` (the scan lives in memory; limitation L16)
- [ ] The thumbnail time for 30 images is written in the tracker notes

**Pitfalls**
- If the thumbnail bar stays at 0, check DevTools → Sources → Threads to see whether the worker started. A wrong path in `new URL(...)` is the usual cause.
