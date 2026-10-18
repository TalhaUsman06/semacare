# Step 11: Privacy Settings and Hardening (T42–T45)

---

## T42 · Settings page (privacy toggle)

| Depends on | Time | Complexity |
|---|---|---|
| T41 | 30 min | Low |

**Goal:** the proposal's **privacy toggle** ([design/06-frontend.md §3.8](../design/06-frontend.md)): auto-erase on/off, "erase now", and a browser reset.

**Steps**
1. Build `src/pages/Settings.tsx`:
   - **Privacy** card: a checkbox "Erase cloud data automatically after each scan" (saved with `saveSettings`), with a one-line explanation.
   - Button **Erase cloud data for the last scan now** (disabled when there's no `semacare.lastScanId`). It calls `deleteScan`; a 404 shows "Nothing to erase". If the last scan is the one on screen, mark it `wiped`.
   - **This browser** card: the anonymous ID shown as the first 4 and last 4 characters, and a **Reset this browser** button.
   - Reset (behind a confirm modal): clear the bin list, the scan store, the user ID, consent, settings and last scan ID, then go to `/`. Say clearly that files in the bin are **not** deleted; they stay in their folders.
2. Test each control (the auto-erase itself is switched on in T43).

**Done when**
- [ ] The toggle state survives a reload
- [ ] After a scan, "Erase … now" empties that scan's rows in Supabase; pressing it again says "Nothing to erase"
- [ ] Reset returns you to the Consent page with a new anonymous ID, and files that were in the bin are still on disk

---

## T43 · Automatic privacy wipe after a scan

| Depends on | Time | Complexity |
|---|---|---|
| T42 | 15 min | Low |

**Goal:** decision D11. When results have reached the browser, the scan's cloud data is erased automatically (default ON).

**Steps**
1. In `src/lib/scanRunner.ts` (final version), add as the last step of `runScan()`:
   if `getSettings().autoWipe` is true, `await wipeCloudData(scanId)`.
2. Test with the toggle ON, then OFF.

**Done when**
- [ ] Toggle **ON**: after a scan the Categories page shows the green "erased ✓" banner, and Supabase has no rows for the scan
- [ ] Toggle **OFF**: the rows remain and the page shows "still stored. Erase now"
- [ ] The results stay visible in the browser after the wipe (they live in memory)
- [ ] S3 is empty in both cases

---

## T44 · Error handling and edge cases

| Depends on | Time | Complexity |
|---|---|---|
| T43 | 60 min | Medium |

**Goal:** the app fails politely. Test every row below and fix what doesn't behave as described.

| # | Situation | Expected behaviour | Where it's handled |
|---|---|---|---|
| 1 | User cancels the folder picker | Nothing happens | `pickFolder` returns `null` |
| 2 | Blocked folder (Desktop, Downloads) | Red banner: "choose a sub-folder" | `SelectFolder.tsx` |
| 3 | Empty folder / no images | "No JPG, PNG or WebP images in this folder." | `SelectFolder.tsx` |
| 4 | More than 500 images | Amber warning; only the first 500 are analysed | `MAX_IMAGES_PER_SCAN` |
| 5 | HEIC / GIF / corrupt image | Listed under **Unsupported**, never uploaded, unticked by default | `walkFolder`, worker |
| 6 | Wi-Fi off during upload | After 3 tries the images become errors; the scan still finishes | `withRetry`, `uploadAll` |
| 7 | Wi-Fi off during analysis | Polling keeps retrying; after 180 s without progress → "Timed out" | `poll.ts` |
| 8 | AI error for one image | Row `error`; shown in **Other** with ⚠️ and unticked | `process_image`, `groupOf` |
| 9 | User closes the tab mid-scan | Browser "Leave site?" warning | `ScanProgress.tsx` |
| 10 | Second scan started mid-scan | The old run stops quietly | `isCancelled` in `scanRunner.ts` |
| 11 | Cancel pressed | Uploads stop; not-started images become "Cancelled" errors | `scanRunner.ts` |
| 12 | Permission refused when emptying the bin | Items stay in the bin, with a clear message | `permanentlyDelete` |
| 13 | File changed or removed since the scan | Not deleted / reported as already gone | `deleteFile` |
| 14 | Auto-wipe fails (network) | Red banner with an "Erase now" retry | `wipeCloudData` |
| 15 | API URL missing or wrong | Images show "Could not start upload: Network error…" | `api.ts` |

**Steps**
1. Test rows 1–15. Use DevTools → Network → *Offline* for rows 6, 7 and 14.
2. Fix any row that misbehaves. Keep fixes small.
3. Record pass/fail per row in the tracker notes.

**Done when**
- [ ] All 15 rows behave as described, or the difference is written down as a known limitation
- [ ] No uncaught errors in the console during the tests
- [ ] `npm run build` and `npm run lint` are clean

---

## T45 · Security check

| Depends on | Time | Complexity |
|---|---|---|
| T44 | 30 min | Low |

**Goal:** evidence for the dissertation that the privacy and security claims in [design/07-security-privacy.md](../design/07-security-privacy.md) hold.

**Steps** (project root, after `set -a; source backend/.env; set +a`)
1. **No secrets in the frontend bundle:**
   ```bash
   (cd frontend && npm run build)
   grep -rEl "sb_secret|service_role|AKIA|SUPABASE" frontend/dist || echo "clean"
   ```
2. **The bucket is private:**
   ```bash
   aws s3api get-public-access-block --bucket "$BUCKET_NAME"
   curl -s -o /dev/null -w "%{http_code}\n" "https://$BUCKET_NAME.s3.eu-west-2.amazonaws.com/"      # 403
   ```
3. **Another user can't read or wipe a scan** (auto-wipe OFF, scan, set `U` and `S` as in Step 8):
   ```bash
   OTHER=22222222-2222-4222-8222-222222222222
   curl -s -o /dev/null -w "%{http_code}\n" "$API_URL/results?scan_id=$S" -H "x-user-id: $OTHER"     # 404
   curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$API_URL/scans/$S" -H "x-user-id: $OTHER"     # 404
   ```
4. **CORS refuses other websites:**
   ```bash
   curl -s -i -X OPTIONS "$API_URL/upload-urls" -H "Origin: https://evil.example" \
     -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin || echo "blocked"
   ```
5. **No filenames or OCR text in the cloud logs:**
   ```bash
   aws logs tail /aws/lambda/semacare-process-image --since 1h | head -20
   ```
6. **No filenames in the database:** check the `images` columns in Supabase.
7. **Least privilege:** `aws iam get-role-policy --role-name semacare-process-image-role --policy-name process-image-policy`
8. **Log retention is 7 days** on all four groups:
   ```bash
   aws logs describe-log-groups --log-group-name-prefix /aws/lambda/semacare \
     --query 'logGroups[].[logGroupName,retentionInDays]' --output table
   ```
9. Save the outputs (text or screenshots) in `docs/evidence/`.

**Done when**
- [ ] Every check gives the expected result
- [ ] The evidence is saved
