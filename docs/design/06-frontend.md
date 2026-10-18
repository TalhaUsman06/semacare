# 06: Frontend Design

## 1. Stack and versions

| Package | Purpose |
|---|---|
| `vite` (react-ts template) | Build/dev server (needs Node 20.19+ or 22.12+; you have 22.18) |
| `react`, `react-dom` | UI |
| `react-router` (v7) | Routes (import from `"react-router"`) |
| `tailwindcss`, `@tailwindcss/vite` (v4) | Styling (`@import "tailwindcss";`) |
| `zustand` | App state store |
| `idb-keyval` | IndexedDB for the recycle bin |
| `@types/wicg-file-system-access` (dev) | TypeScript types for `showDirectoryPicker`, `queryPermission`, `requestPermission` |

## 2. Routes and guards

| Path | Page file | Guard |
|---|---|---|
| `/` | `pages/Consent.tsx` | If already consented, redirect to `/select` |
| `/select` | `pages/SelectFolder.tsx` | Needs consent. If unsupported, redirect to `/unsupported` |
| `/scan` | `pages/ScanProgress.tsx` | Needs an active scan in the store, else `/select` |
| `/categories` | `pages/Categories.tsx` | Needs a scan with results, else `/select` |
| `/categories/:name` | `pages/CategoryReview.tsx` | Same; `:name` must be one of the six (or `Unsupported`) |
| `/bin` | `pages/RecycleBin.tsx` | Needs consent |
| `/settings` | `pages/Settings.tsx` | None |
| `/unsupported` | `pages/Unsupported.tsx` | None |

The header (in `App.tsx` layout) always shows: **SEMACARE** logo text · "New scan" · "Recycle bin (n)" · "Settings".

## 3. Screens: content and behaviour

### 3.1 Consent (`/`)
- Title: **"Clean your image folders by what's in them"**
- Body copy (use exactly, it's the privacy notice):
  > SEMACARE sorts the images in a folder you choose into Receipts, Screenshots, Landscapes,
  > People, Memes and Other.
  >
  > **What leaves your computer:** a small, low-resolution copy of each image (about 1024 pixels)
  > is sent over an encrypted connection to Amazon Web Services (London region) to be analysed.
  > Each copy is deleted as soon as it has been analysed, and never kept longer than 24 hours.
  >
  > **What never leaves your computer:** your original images, their file names and folder paths.
  >
  > **What is stored:** a short text description (detected labels and up to 200 characters of
  > text read from the image), linked to a random ID, not your name. By default this is erased
  > automatically after each scan. You can change this in Settings.
  >
  > **Nothing is deleted without your confirmation.** Deleted files go to a recycle bin for 24 hours first.
- Checkbox: "I understand and agree to my images being analysed as described above."
- Button **Continue** (disabled until ticked): save consent and go to `/select`.
- Small link: "Browser support: Chrome or Edge on a desktop computer."

### 3.2 Select Folder (`/select`)
- Button **Choose folder**: `showDirectoryPicker({ mode: "readwrite", id: "semacare", startIn: "pictures" })`.
- After picking: show "**{folderName}**: {n} images found ({size} MB). {u} files skipped (not images)."
  Also: checkbox "Include sub-folders" (default on; re-walk if changed).
- If `n > 500`: warning "The MVP analyses up to 500 images per scan. The first 500 will be analysed." (sorted by name).
- If `n == 0`: "No JPG, PNG or WebP images in this folder." with a Choose again button.
- Button **Start scan**: creates the scan in the store and navigates to `/scan`.
- If the user cancels the picker (`AbortError`), do nothing (no error message).

### 3.3 Scan Progress (`/scan`)
- Three progress bars with counts: **Preparing thumbnails** x/n · **Uploading** x/n · **Analysing** x/n.
- Timer: "Elapsed 12.4 s".
- Errors so far: "{e} images couldn't be analysed" (link opens the list later in Categories).
- When everything is done or errored, or a 180 s timeout passes: show "Done in {t} s" and a **View results** button (also auto-navigate after 1.5 s).
- Leaving the page doesn't cancel the scan (it runs in the store); a **Cancel** button stops new uploads.

### 3.4 Categories Overview (`/categories`)
- Grid of six cards (plus an "Unsupported" card if any): icon, name, **count**, total size (MB), "Reviewed ✓" badge if opened.
- Empty categories are shown greyed out with count 0 (not clickable).
- Top summary: "{n} images analysed in {t} s · {d} MB could be freed".
- Buttons: **Export CSV** (see §7) · **New scan**.
- Banner if auto-wipe is on: "Cloud data for this scan has been erased ✓". If it's off: "Cloud data kept. Erase now" (button).

### 3.5 Category Review (`/categories/:name`)
- First-open reminder (Banner, amber): **"Review before deleting: AI can make mistakes. Untick anything you want to keep."** Dismissible; marks the category reviewed.
- Toolbar: "Select all" · "Select none" · "{k} of {n} selected ({mb} MB)".
- List rows (text-first): checkbox · 64 px thumbnail (local object URL) · **filename** (local only) · relative path (small grey) · OCR snippet (1 line, ellipsis) or top 3 labels · confidence badge (e.g. 91%) · size.
- Click the thumbnail to see a larger preview in a modal.
- Successfully analysed rows are **ticked by default**. Rows that failed analysis or are unsupported start **unticked**.
- Sticky footer: **Move {k} to recycle bin** (disabled if k = 0) → opens the Confirm modal.

### 3.6 Confirm Delete modal
- Title: **"Move {k} {Category} to the recycle bin?"**
- Body: "You are about to delete **{k} {Category}** ({mb} MB). They will stay in the recycle bin for 24 hours, and you can restore them until you empty the bin."
- Buttons: **Cancel** (default focus, Esc closes) · **Move to bin** (red).
- On confirm: items go to the bin (IndexedDB), are removed from the category list, and a toast shows "{k} moved to recycle bin · Undo". Undo restores them straight away.

### 3.7 Recycle Bin (`/bin`)
- Expiry banner (if any items are over 24 h old): "**{x} items** have passed the 24-hour undo window." → **Delete them permanently** button.
- List: thumbnail (stored blob) · filename · category · "moved 3 h ago" · "expires in 21 h" · **Restore** button.
- Footer: **Empty bin now ({n} files, {mb} MB)**, with its own confirm modal: "Permanently delete {n} files from '{folder}'? This cannot be undone."
- After deleting: "Freed {mb} MB. {f} files could not be deleted" (with reasons).

### 3.8 Settings (`/settings`)
- Toggle: **Erase cloud data automatically after each scan** (default ON).
- Button: **Erase cloud data for the last scan now**. Shows the result.
- Button: **Reset this browser**: clears the user ID, consent, settings and bin (the bin contents are only *forgotten*; files aren't deleted), with a confirm modal.
- Info: "Your anonymous ID: 6f1c…9c11" (first 4 + last 4 characters).

### 3.9 Unsupported (`/unsupported`)
- "SEMACARE needs **Google Chrome or Microsoft Edge on a desktop computer** to open and clean folders. Your browser doesn't support the File System Access API." Links to download Chrome/Edge (as text links).

## 4. State (`src/state/scanStore.ts`)

```ts
export type Category = "Receipts" | "Screenshots" | "Landscapes" | "People" | "Memes" | "Other";
export type Stage = "found" | "thumbnailing" | "thumb_ready" | "uploading" | "uploaded"
                  | "done" | "error" | "unsupported";

export interface ImageItem {
  id: string;            // image_id (uuid)
  name: string;          // local only
  relPath: string;       // local only, e.g. "2024/trip/IMG_001.jpg"
  size: number;          // bytes
  lastModified: number;
  isPng: boolean;
  nameHint: boolean;
  width?: number;        // original, from worker
  height?: number;
  thumbUrl?: string;     // object URL for preview
  thumbBlob?: Blob;      // kept until upload + for the bin preview
  stage: Stage;
  category?: Category;
  labels?: string[];
  ocrSummary?: string | null;
  confidence?: number | null;
  textractUsed?: boolean;
  processingMs?: number | null;
  error?: string | null;
}

export interface Scan {
  id: string;            // scan_id
  folderName: string;
  rootHandle: FileSystemDirectoryHandle;
  order: string[];       // image ids in display order
  images: Record<string, ImageItem>;
  timings: { startedAt: number; thumbsDoneAt?: number; uploadsDoneAt?: number; allDoneAt?: number };
  reviewed: Partial<Record<Category, boolean>>;
  wiped: boolean;
  cancelled: boolean;
}
```
- The **handles** are kept in a separate module-level `Map<string, { file: FileSystemFileHandle; parent: FileSystemDirectoryHandle }>` in `scanStore.ts`, exported as `handles`.
- Store actions: `startScan`, `updateImage(id, patch)`, `updateMany(patches)`, `setTiming`, `markReviewed`, `removeFromScan(ids)`, `restoreToScan(items)`, `setWiped`, `cancel`, `reset`.

## 5. Local storage keys

| Key | Where | Value |
|---|---|---|
| `semacare.userId` | localStorage | uuid |
| `semacare.consent.v1` | localStorage | ISO timestamp of consent |
| `semacare.settings` | localStorage | `{"autoWipe": true}` |
| `semacare.lastScanId` | localStorage | uuid (for "Erase now" in Settings) |
| IndexedDB db `semacare`, store `bin` | IndexedDB | key = image id, value = `BinItem` (see T38) |

## 6. Thumbnail worker contract

- In: `{ id: string, file: File }`
- Out (success): `{ id, ok: true, blob: Blob, width: number, height: number }`: width/height of the **original** after EXIF orientation.
- Out (failure): `{ id, ok: false, error: string }`: the image is marked `unsupported`.
- Algorithm: `createImageBitmap(file)` → `scale = min(1, 1024 / max(w, h))` → `OffscreenCanvas(round(w×scale), round(h×scale))` → fill **white** (for PNG transparency) → `drawImage` → `convertToBlob({ type: "image/jpeg", quality: 0.75 })` → `bitmap.close()`.
- Pool size: `Math.min(4, navigator.hardwareConcurrency || 2)`.

## 7. CSV export (`src/lib/csv.ts`)

A local file download (`semacare-results-{scanId8}.csv`). Columns:

```
filename,rel_path,category,confidence,labels,ocr_summary,textract_used,processing_ms,status,size_bytes
```
Labels are joined with `|`. Every field is quoted, and `"` is escaped as `""`.
Timings are not in the CSV; they are shown on screen and written to `console.table`.
This file is the input for `evaluation/metrics.py` (T47).

## 8. Visual style

- Text-first, calm: `bg-slate-50`, cards `bg-white rounded-xl border border-slate-200 shadow-sm`, text `text-slate-800`, secondary `text-slate-500`.
- Primary button `bg-indigo-600 hover:bg-indigo-700 text-white`; danger `bg-red-600`; secondary `bg-white border`.
- Category colours (badges/icons): Receipts `emerald`, Screenshots `sky`, Landscapes `lime`, People `amber`, Memes `fuchsia`, Other `slate`, Unsupported `zinc`.
- Category icons: plain emoji inside the card are fine for the MVP (🧾 📱 🏞️ 🧑 😂 📁 ⚠️).
- Max content width `max-w-5xl mx-auto px-4`. Must work from 1024 px wide upwards (desktop only).
- Accessibility: every button has a visible label; checkboxes have `<label>`s; modals trap focus and close with Esc; colour is never the only signal.
