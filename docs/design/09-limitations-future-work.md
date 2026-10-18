# 09: Limitations and Future Work (dissertation material)

## Limitations of the web MVP

| # | Limitation | Why | Mitigation in the MVP |
|---|---|---|---|
| L1 | Works only in Chrome and Edge on desktop | Only they implement the File System Access API with write access | Unsupported page |
| L2 | Can't open a phone gallery | Browsers have no gallery access | The user picks a folder |
| L3 | Folder permission may be asked again each session | Browser security model | Permission is requested when emptying the bin |
| L4 | Internet required | AI runs in the cloud | Clear error counts |
| L5 | AI can mis-categorise | Rule-based categoriser over generic labels | Review mode, confirm, bin |
| L6 | AI sees only 1024 px copies | Privacy and upload size | Size chosen for OCR (D7) |
| L7 | Six fixed categories | MVP scope | "Other" catches the rest |
| L8 | Images only (JPG/PNG/WebP); no HEIC or video | Browser decoding support | "Unsupported" group |
| L9 | Speed depends on network/CPU/AWS limits | New-account Lambda/Rekognition limits | Parallelism + adaptive retries |
| L10 | Recycle bin frees space only when emptied; lost if browser data is cleared | Browsers can't delete in the background or use the OS trash | Expiry prompt; clear wording |
| L11 | OCR is weaker on handwriting, stylised fonts and non-Latin scripts | Textract limits | Receipts can also be found by label |
| L12 | Cloud cost grows with use | Pay-per-image AI | 500-image cap, throttling |
| L13 | Users must trust the brief upload | Cloud AI | Consent notice, auto-wipe |
| L14 | Anonymous ID header, not real authentication | Scope (D2) | Random UUIDs; owner check |
| L15 | Presigned PUT can't enforce a maximum size | S3 PUT signing | Short expiry, fixed key/type |
| L16 | A scan is lost on page reload | Handles and results are kept in memory | The bin persists |
| L17 | Small evaluation (50/100 images, few users) | Time | Stated honestly |

## Future work

1. **React Native mobile app** reusing the same API. It gets real gallery access and the OS "Recently Deleted".
2. **Supabase Auth** (anonymous → email) with JWT verification in Lambda and RLS policies.
3. **OPFS recycle bin**: copy to the Origin Private File System, then delete the original, for a true undo that frees folder space immediately.
4. **Learned categoriser**: a small classifier on Rekognition labels + OCR features, or an on-device model (e.g. ONNX/TF.js) to avoid uploads entirely.
5. **Custom categories** and user feedback ("this isn't a receipt") to improve rules.
6. **Duplicate / near-duplicate detection** (perceptual hashing) as an extra category.
7. **Presigned POST** with size limits; a WAF on the API.
8. **Supabase Realtime** instead of polling.
9. **Persist scans** in IndexedDB so a reload doesn't lose results.
10. **HEIC and video** support (server-side conversion or keyframes).
11. **Cost controls**: per-user quotas, batching, Rekognition `DetectText` as a cheaper OCR where good enough.
