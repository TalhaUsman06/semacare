# Step 2: Project Scaffolding (T06–T13)

The frontend lives in `frontend/` (created in T06). Frontend commands run from `frontend/`; backend commands from `backend/`.
File purposes are listed in [design/02-architecture.md §7](../design/02-architecture.md).

---

## T06 · Scaffold the frontend (Vite + React + TypeScript)

| Depends on | Time | Complexity |
|---|---|---|
| T05 | 15 min | Low |

**Goal:** a running React app at `http://localhost:5173`.

**Steps**
1. From the project root:
   ```bash
   npm create vite@latest frontend -- --template react-ts --no-interactive
   cd frontend && npm install
   ```
2. Remove the demo files: `rm -rf src/App.css src/assets`.
3. Replace `src/App.tsx` with a component that returns `<h1>SEMACARE</h1>`.
4. `npm run dev`, then open http://localhost:5173 in Chrome.

**Done when**
- [ ] The browser shows "SEMACARE"
- [ ] `npm run build` finishes without errors

---

## T07 · Add Tailwind CSS

| Depends on | Time | Complexity |
|---|---|---|
| T06 | 10 min | Low |

**Goal:** Tailwind v4 classes work, and the dev server always uses port 5173 (the CORS rules depend on that exact origin).

**Steps**
1. `npm install tailwindcss @tailwindcss/vite`
2. In `vite.config.ts`: add `tailwindcss()` to `plugins`, and set `server: { port: 5173, strictPort: true }`.
3. Replace `src/index.css` with the single line `@import "tailwindcss";`
4. Test with `<h1 className="p-8 text-3xl font-bold text-indigo-700">`.

**Done when**
- [ ] The heading is large, bold and indigo
- [ ] The dev server reports `http://localhost:5173/` (with `strictPort`, it fails instead of moving to 5174)

---

## T08 · Install libraries and configure TypeScript

| Depends on | Time | Complexity |
|---|---|---|
| T07 | 10 min | Low |

**Goal:** routing, state, IndexedDB and File System Access API types are available.

**Steps**
1. Install:
   ```bash
   npm install react-router zustand idb-keyval
   npm install -D @types/wicg-file-system-access
   ```
2. In `tsconfig.app.json`, set `"types": ["vite/client", "wicg-file-system-access"]`.
   This adds types for `showDirectoryPicker`, `queryPermission`, `requestPermission` and folder iteration.
3. Run `npx tsc -b` (no output means success).

**Done when**
- [ ] `package.json` lists the four packages
- [ ] `npx tsc -b` prints nothing

**Pitfalls**
- The Vite template enables `erasableSyntaxOnly`. Don't use TypeScript `enum`s or constructor parameter properties (`constructor(public x: number)`); they won't compile.

---

## T09 · Frontend configuration and environment

| Depends on | Time | Complexity |
|---|---|---|
| T08 | 10 min | Low |

**Goal:** all tunable numbers in one file; the API URL comes from an env file.

**Steps**
1. Create `src/config.ts` exporting:

   | Constant | Value |
   |---|---|
   | `API_URL` | `import.meta.env.VITE_API_URL ?? ""` |
   | `SUPPORTED_EXTENSIONS` | `jpg, jpeg, png, webp` |
   | `UNSUPPORTED_IMAGE_EXTENSIONS` | `heic, heif, gif, tif, tiff, dng, cr2, nef, arw` |
   | `MAX_IMAGES_PER_SCAN` | `500` |
   | `UPLOAD_BATCH_SIZE` | `50` |
   | `UPLOAD_CONCURRENCY` | `6` |
   | `THUMB_MAX_EDGE` | `1024` |
   | `THUMB_QUALITY` | `0.75` |
   | `POLL_INTERVAL_MS` | `2000` |
   | `POLL_STALL_TIMEOUT_MS` | `180000` |
   | `BIN_TTL_MS` | 24 hours in ms |

2. Create `frontend/.env.example` (committed): `VITE_API_URL=https://xxxxxxxxxx.execute-api.eu-west-2.amazonaws.com`
3. Create `frontend/.env.local` (gitignored): `VITE_API_URL=` (filled in T27).

**Done when**
- [ ] `git status` shows `.env.example` but not `.env.local`
- [ ] `npx tsc -b` prints nothing

**Pitfalls**
- Vite reads `.env*` files only at start-up. Restart `npm run dev` after editing them.
- Never put a secret in a `VITE_` variable; it's visible to every visitor.

---

## T10 · Anonymous identity, consent, browser support and settings

| Depends on | Time | Complexity |
|---|---|---|
| T09 | 15 min | Low |

**Goal:** small helpers for decisions D2 (anonymous UUID) and D11 (auto-wipe ON by default), plus consent and browser checks. Storage keys are in [design/06-frontend.md §5](../design/06-frontend.md).

**Steps**
1. `src/lib/identity.ts`: `getUserId()` returns the UUID in `localStorage["semacare.userId"]`, creating it with `crypto.randomUUID()` on first use. `resetUserId()` removes it.
2. `src/lib/consent.ts`: `hasConsent()`, `giveConsent()` (stores an ISO timestamp under `semacare.consent.v1`), `clearConsent()`.
3. `src/lib/support.ts`: `isFsSupported()` returns `window.isSecureContext && "showDirectoryPicker" in window`.
4. `src/lib/settings.ts`: `Settings { autoWipe: boolean }` with default `true`; `getSettings()`, `saveSettings(patch)` under `semacare.settings`; export `LAST_SCAN_KEY = "semacare.lastScanId"`.
5. Quick test: log `getUserId()` and `isFsSupported()` from `App.tsx`, reload twice, then remove the log.

**Done when**
- [ ] The same UUID prints on both reloads
- [ ] `isFsSupported()` is `true` in Chrome and `false` in Safari/Firefox

---

## T11 · Shared UI components and helpers

| Depends on | Time | Complexity |
|---|---|---|
| T10 | 30 min | Low |

**Goal:** the building blocks every page uses. Visual style is in [design/06-frontend.md §8](../design/06-frontend.md).

**Steps: create these files**

| File | What it provides |
|---|---|
| `src/lib/format.ts` | `formatBytes`, `formatSeconds`, `timeAgo`, `timeLeft` |
| `src/components/Button.tsx` | Variants `primary`, `secondary`, `danger`, `ghost`; `type="button"` by default; visible focus ring; disabled style |
| `src/components/Card.tsx` | White rounded bordered box |
| `src/components/Banner.tsx` | Tones `info`, `warning`, `success`, `error`; optional Dismiss; `role="alert"` for errors |
| `src/components/ProgressBar.tsx` | Label, `value / max`, `role="progressbar"` |
| `src/components/Modal.tsx` | `role="dialog"`, focus moves inside, Tab is trapped, Esc and backdrop click close, focus returns on close |
| `src/components/BlobImage.tsx` | Shows a `Blob` as an image. Keep one object URL per Blob in a `WeakMap` (don't create URLs inside effects) |
| `src/state/toastStore.ts` | Zustand store: `show(message, action?)`, `hide()`, auto-hide after 6 s |
| `src/components/Toaster.tsx` | Renders the toast with its optional action button (used for **Undo**) |

**Done when**
- [ ] `npx tsc -b` prints nothing
- [ ] `npm run lint` shows no errors

**Pitfalls**
- Tailwind only finds complete class names in your source. Never build classes like `` `bg-${color}-100` ``; map each variant to a full string.

---

## T12 · Routing shell with placeholder pages

| Depends on | Time | Complexity |
|---|---|---|
| T11 | 20 min | Low |

**Goal:** every route from [design/06-frontend.md §2](../design/06-frontend.md) exists and the header navigation works.

**Steps**
1. Create eight placeholder pages in `src/pages/`, each showing its own name: `Consent`, `SelectFolder`, `ScanProgress`, `Categories`, `CategoryReview`, `RecycleBin`, `Settings`, `Unsupported`.
2. Create `src/components/Layout.tsx` (version 1): header with the SEMACARE logo link and nav links **New scan** (`/select`), **Recycle bin** (`/bin`), **Settings**; then `<Outlet />` in a `max-w-5xl` container; then `<Toaster />`.
3. Replace `src/App.tsx` with the routes: `/`, `/select`, `/scan`, `/categories`, `/categories/:name`, `/bin`, `/settings`, `/unsupported`, and `*` redirecting to `/`. No guards yet (T18).
4. In `src/main.tsx`, wrap `<App />` in `<BrowserRouter>` (import from `"react-router"`).

**Done when**
- [ ] Every header link shows the matching placeholder; unknown URLs redirect to `/`
- [ ] Reloading on `/settings` still shows Settings
- [ ] `npx tsc -b` prints nothing

---

## T13 · Backend skeleton, Python virtual environment and scripts

| Depends on | Time | Complexity |
|---|---|---|
| T12 | 25 min | Low |

**Goal:** the Python side is ready: a venv, the test runner, and scripts to zip, deploy and run Lambdas locally.

**Steps**
1. Create the venv:
   ```bash
   cd backend && python3 -m venv .venv && source .venv/bin/activate
   ```
   Activate it in every new terminal before backend work.
2. Create `requirements-dev.txt` with `boto3>=1.35` and `pytest>=8`, then `pip install -r requirements-dev.txt`.
   (Lambda already includes boto3. Nothing is bundled into the zips.)
3. `touch shared/__init__.py`
4. Create `backend/.env.example`: the same keys as `.env`, without real values.
5. Create `tests/conftest.py` that adds `backend/` and `backend/process_image/` to `sys.path`, so tests can `from categoriser import categorise`.
6. Create `scripts/package.sh`: for each function folder (all four by default, or the names passed as arguments), build `dist/<function>.zip` containing that folder's `*.py` files at the **top level** plus the `shared/` package. Fail clearly if `handler.py` is missing.
7. Create `scripts/deploy.sh`: run `package.sh`, then `aws lambda update-function-code` and `aws lambda wait function-updated` for each function. The AWS name is `semacare-` plus the folder name with underscores turned into dashes (`get_upload_urls` → `semacare-get-upload-urls`).
8. Create `scripts/run_local.py <function> <event.json>`: load `backend/.env` into the environment, put `backend/` and the function folder on `sys.path`, import `handler`, call `lambda_handler(event, None)` and print the result.
9. Check:
   ```bash
   chmod +x scripts/*.sh
   bash -n scripts/package.sh && bash -n scripts/deploy.sh && echo "scripts OK"
   pytest -q        # "no tests ran" is expected for now
   ```

**Done when**
- [ ] `scripts OK` is printed and `pytest -q` runs
- [ ] `git status` doesn't show `.venv/`

**Pitfalls**
- macOS ships bash 3.2. Don't use bash 4 features such as associative arrays in the scripts.
