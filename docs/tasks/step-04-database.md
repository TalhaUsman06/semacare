# Step 4: Database (T19–T20)

---

## T19 · Create the Supabase schema

| Depends on | Time | Complexity |
|---|---|---|
| T18 | 15 min | Low |

**Goal:** the `scans` and `images` tables exist, locked with RLS (decision D3).

**Steps**
1. Create `supabase/schema.sql` by copying the SQL block from [design/04-database.md §1](../design/04-database.md) exactly.
2. Supabase dashboard → **SQL Editor** → New query → paste the whole file → **Run**. Confirm the "destructive operation" warning; the tables are empty.
3. In the **Table Editor**, check that both tables exist and show RLS as enabled.
4. Check that the columns of `images` match the table in `04-database.md` §2.

**Done when**
- [ ] Both tables exist, with RLS **enabled** and **no policies**
- [ ] `supabase/schema.sql` is committed

**Pitfalls**
- Supabase may warn "RLS enabled but no policies". That's intended: public keys can do nothing, and only our Lambdas (secret key) can.

---

## T20 · Verify Supabase REST access with curl

| Depends on | Time | Complexity |
|---|---|---|
| T19 | 20 min | Low |

**Goal:** prove the secret key can insert, update, count, read and cascade-delete, and the public key can read nothing. This is exactly what the Lambdas will do ([design/04-database.md §4](../design/04-database.md)).

**Steps**
1. Load the secrets (from the project root):
   ```bash
   set -a; source backend/.env; set +a
   H=(-H "apikey: $SUPABASE_SERVICE_KEY" -H "Content-Type: application/json")
   # Only for a legacy key starting with eyJ, also run:
   # H+=(-H "Authorization: Bearer $SUPABASE_SERVICE_KEY")
   R="$SUPABASE_URL/rest/v1"
   SCAN=11111111-1111-4111-8111-111111111111
   USER=22222222-2222-4222-8222-222222222222
   IMG=33333333-3333-4333-8333-333333333333
   ```
2. Insert a scan and an image:
   ```bash
   curl -s "$R/scans" "${H[@]}" -H "Prefer: return=representation" \
     -d "{\"id\":\"$SCAN\",\"user_id\":\"$USER\"}"; echo
   curl -s "$R/images" "${H[@]}" -H "Prefer: return=representation" \
     -d "[{\"id\":\"$IMG\",\"scan_id\":\"$SCAN\",\"user_id\":\"$USER\",\"width\":1170,\"height\":2532,\"is_png\":true,\"name_hint\":false}]"; echo
   ```
3. Update it as `process_image` will:
   ```bash
   curl -s -X PATCH "$R/images?id=eq.$IMG" "${H[@]}" -H "Prefer: return=representation" \
     -d '{"status":"done","category":"Screenshots","labels":["Text","Screenshot"],"confidence":91.5}'; echo
   ```
4. Count, as `get_upload_urls` will (look for `content-range: 0-0/1`):
   ```bash
   curl -s -i "$R/images?scan_id=eq.$SCAN&select=id&limit=1" "${H[@]}" -H "Prefer: count=exact" | grep -i content-range
   ```
5. Try the **publishable/anon** key. It must return `[]`:
   ```bash
   curl -s "$R/images?select=*" -H "apikey: <PUBLISHABLE_OR_ANON_KEY>"; echo
   ```
6. Delete the scan and confirm the image was cascade-deleted:
   ```bash
   curl -s -X DELETE "$R/scans?id=eq.$SCAN" "${H[@]}"
   curl -s "$R/images?id=eq.$IMG" "${H[@]}"; echo        # → []
   ```

**Done when**
- [ ] Steps 2–4 return rows or the content-range header, with no `"code"` errors
- [ ] Step 5 returns `[]`
- [ ] Step 6 returns `[]`

**Pitfalls**
- `401 Invalid API key` with an `sb_secret_` key usually means you also sent `Authorization: Bearer sb_secret…`. Only legacy `eyJ` keys use that header.
- Error `23514` (check constraint): a value is outside the allowed list, e.g. `screenshots` instead of `Screenshots`.
