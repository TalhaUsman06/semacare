# Step 13: Deployment and Submission (T52–T54)

---

## T52 · Deploy the frontend to Vercel

| Depends on | Time | Complexity |
|---|---|---|
| T50 (T51 is optional) | 40 min | Medium |

**Goal:** a public HTTPS URL. HTTPS is required: the File System Access API only works in a secure context.

**Steps**
1. Create `frontend/vercel.json` so reloads on `/bin`, `/settings` etc. work:
   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
   ```
2. Deploy from `frontend/`:
   ```bash
   npx vercel login
   npx vercel                                   # create/link the project "semacare"
   npx vercel env add VITE_API_URL production   # paste the API URL, no trailing slash
   npx vercel --prod
   ```
   Note the production URL, e.g. `https://semacare.vercel.app`.
3. Allow that origin in **S3 CORS**: add it to `AllowedOrigins` in `infra/s3-cors.json`, then:
   ```bash
   aws s3api put-bucket-cors --bucket "$BUCKET_NAME" --cors-configuration file://infra/s3-cors.json
   ```
4. Allow it in **API Gateway**: console → `semacare-api` → CORS → add the same origin → Save.
5. Commit `vercel.json` and the updated `infra/s3-cors.json`.

**Done when**
- [ ] The production URL loads the Consent page
- [ ] Reloading `https://…/settings` works (no 404)
- [ ] Both CORS configurations list the Vercel origin exactly (https, no trailing slash)

**Pitfalls**
- `VITE_` variables are baked in at build time. After adding or changing one, deploy again with `npx vercel --prod`.
- Vercel preview URLs (random sub-domains) aren't in the CORS lists. Test on the production URL.

---

## T53 · Production smoke test

| Depends on | Time | Complexity |
|---|---|---|
| T52 | 30 min | Low |

**Goal:** the deployed app works end to end.

**Steps**
1. On the production URL in Chrome, run E1, E5, E6, E7, E8, E11, E13 and E14 from the E2E checklist, using a **copy** of a test folder.
2. Repeat the main path in Edge.
3. Check AWS: the bucket is empty, no rows are left (auto-wipe ON), and there are no errors in
   `aws logs tail /aws/lambda/semacare-process-image --since 30m`.
4. Check Billing → Budgets: still within the free tier or credits.

**Done when**
- [ ] All eight scenarios pass on production in Chrome, and the main path passes in Edge

---

## T54 · Demo recording, README, tag v1.0, submission

| Depends on | Time | Complexity |
|---|---|---|
| T53 | 60–90 min | Low |

**Goal:** everything needed for the 5 October submission.

**Steps**
1. **Demo video (3–5 min)** with QuickTime → New Screen Recording:
   1. The problem in one sentence; open the site.
   2. Consent → choose a folder → scan progress.
   3. Categories → open Receipts → the reminder → untick one → confirm modal → move to bin → Undo.
   4. Recycle bin → restore one → empty the bin → show Finder.
   5. Settings → the privacy toggle → show the empty S3 bucket and the empty Supabase table.
   6. One sentence each on accuracy, speed, cost and limitations.
2. **Update the root `README.md`:** the live URL, how to run locally, how to deploy, the architecture diagram, and known limitations (link to `docs/design/09-limitations-future-work.md`).
3. **Correct the proposal inconsistencies in the write-up:** web-first scope (the title says mobile), six phases not five, the supervisor is assigned, the cost claim, and "TLS 1.2+".
4. **Final checks:**
   ```bash
   (cd frontend && npm run lint && npm run build)
   (cd backend && source .venv/bin/activate && pytest -q)
   git status            # no .env, no test images
   ```
5. **Tag and package:**
   ```bash
   git add . && git commit -m "T54: release v1.0"
   git tag v1.0 && git push --follow-tags
   git archive --format=zip -o ~/Desktop/semacare-v1.0.zip v1.0
   ```
   The archive contains no secrets and no `node_modules`.
6. **Submit:** the zip (or repository link), the live URL, the demo video and the evaluation reports.
7. **After marking:** delete the AWS resources to avoid charges (the bucket, 4 Lambdas, the API, 3 roles, the log groups) and pause the Supabase project.

**Done when**
- [ ] The video is recorded and plays
- [ ] The tag `v1.0` exists, and the zip opens and contains no `.env`
- [ ] Everything is submitted before the deadline
