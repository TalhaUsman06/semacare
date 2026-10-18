# Step 5: S3, IAM and AI Service Check (T21–T23)

AWS resources are created with copy-paste CLI commands, so they're exact and repeatable. Afterwards, open each one in the
console and take a screenshot for the dissertation's implementation chapter. Settings come from
[design/07-security-privacy.md](../design/07-security-privacy.md).

Before each task, in a terminal at the project root:
```bash
set -a; source backend/.env; set +a
```

---

## T21 · Create the S3 bucket (private, encrypted, lifecycle, CORS)

| Depends on | Time | Complexity |
|---|---|---|
| T20 | 30 min | Medium |

**Goal:** a private bucket for thumbnails that deletes anything older than 1 day and accepts browser uploads from `localhost:5173`.

**Steps**
1. Choose a globally unique bucket name and save it in `backend/.env`:
   ```bash
   B="semacare-thumbs-tu-$((RANDOM % 9000 + 1000))"; echo $B
   sed -i '' "s/^BUCKET_NAME=.*/BUCKET_NAME=$B/" backend/.env
   set -a; source backend/.env; set +a; echo "bucket = $BUCKET_NAME"
   ```
2. Create three config files in `infra/`:
   - `s3-cors.json`: the CORS rule from design §4, wrapped as `{ "CORSRules": [ … ] }` (the CLI needs that wrapper).
   - `s3-lifecycle.json`: `{ "Rules": [ { "ID": "expire-thumbnails", "Status": "Enabled", "Filter": {}, "Expiration": { "Days": 1 } } ] }`
   - `s3-policy.template.json`: the "DenyInsecureTransport" policy from design §4, with the placeholder `BUCKET`.
3. Create and configure the bucket:
   ```bash
   aws s3api create-bucket --bucket "$BUCKET_NAME" --region eu-west-2 \
     --create-bucket-configuration LocationConstraint=eu-west-2
   aws s3api put-public-access-block --bucket "$BUCKET_NAME" --public-access-block-configuration \
     BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
   aws s3api put-bucket-encryption --bucket "$BUCKET_NAME" --server-side-encryption-configuration \
     '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
   aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET_NAME" --lifecycle-configuration file://infra/s3-lifecycle.json
   aws s3api put-bucket-cors --bucket "$BUCKET_NAME" --cors-configuration file://infra/s3-cors.json
   sed "s/BUCKET/$BUCKET_NAME/g" infra/s3-policy.template.json > /tmp/s3-policy.json
   aws s3api put-bucket-policy --bucket "$BUCKET_NAME" --policy file:///tmp/s3-policy.json
   ```
4. Verify:
   ```bash
   aws s3api get-public-access-block --bucket "$BUCKET_NAME"
   aws s3api get-bucket-lifecycle-configuration --bucket "$BUCKET_NAME"
   aws s3api get-bucket-cors --bucket "$BUCKET_NAME"
   ```

**Done when**
- [ ] All four "Block public access" settings are `true`
- [ ] The lifecycle rule `expire-thumbnails` shows `Days: 1`
- [ ] CORS lists `http://localhost:5173` with method `PUT`
- [ ] `BUCKET_NAME` is set in `backend/.env`

**Pitfalls**
- `BucketAlreadyExists`: someone else has that name. Repeat step 1 for a new number.
- Leave versioning **off** (the default). With versioning on, "deleted" thumbnails would still exist as old versions.

---

## T22 · Create the IAM roles (least privilege)

| Depends on | Time | Complexity |
|---|---|---|
| T21 | 30 min | Medium |

**Goal:** three roles that let each Lambda do only its own job.

**Steps**
1. Create the policy files in `infra/iam/`:
   - `lambda-trust.json`: allows `lambda.amazonaws.com` to `sts:AssumeRole`.
   - `upload-urls-policy.template.json`, `process-image-policy.template.json`, `api-policy.template.json`: the three inline policies from design §3, with the placeholder `BUCKET`.
2. Create the roles, attach CloudWatch logging, and add each inline policy:
   ```bash
   for pair in "semacare-upload-urls-role:upload-urls-policy" \
               "semacare-process-image-role:process-image-policy" \
               "semacare-api-role:api-policy"; do
     role="${pair%%:*}"; policy="${pair##*:}"
     aws iam create-role --role-name "$role" \
       --assume-role-policy-document file://infra/iam/lambda-trust.json --query Role.Arn --output text
     aws iam attach-role-policy --role-name "$role" \
       --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
     sed "s/BUCKET/$BUCKET_NAME/g" "infra/iam/$policy.template.json" > "/tmp/$policy.json"
     aws iam put-role-policy --role-name "$role" --policy-name "$policy" --policy-document "file:///tmp/$policy.json"
   done
   ```
3. Verify:
   ```bash
   for r in semacare-upload-urls-role semacare-process-image-role semacare-api-role; do
     echo "== $r"; aws iam list-attached-role-policies --role-name $r --query 'AttachedPolicies[].PolicyName'
     aws iam list-role-policies --role-name $r --query PolicyNames
   done
   ```

**Done when**
- [ ] Each role has `AWSLambdaBasicExecutionRole` plus exactly one inline policy
- [ ] In the console, the inline policy of `semacare-process-image-role` shows your bucket name, not `BUCKET`

**Pitfalls**
- A new role takes about 10 seconds to become usable. If creating a Lambda in T26 says the role "cannot be assumed", wait and retry.

---

## T23 · Test Rekognition and Textract from the CLI

| Depends on | Time | Complexity |
|---|---|---|
| T22 | 20 min | Low |

**Goal:** prove both AI services work in `eu-west-2` for your account, and save real label responses as test fixtures.

**Steps**
1. Upload one receipt photo and one landscape photo:
   ```bash
   aws s3 cp ~/Pictures/semacare-test/<receipt>.jpg   "s3://$BUCKET_NAME/cli-test/receipt.jpg"
   aws s3 cp ~/Pictures/semacare-test/<landscape>.jpg "s3://$BUCKET_NAME/cli-test/landscape.jpg"
   ```
2. Get labels and save them:
   ```bash
   for f in receipt landscape; do
     aws rekognition detect-labels --region eu-west-2 --max-labels 25 --min-confidence 60 \
       --image "S3Object={Bucket=$BUCKET_NAME,Name=cli-test/$f.jpg}" > backend/tests/fixtures/labels_$f.json
     python3 -c "import json;d=json.load(open('backend/tests/fixtures/labels_$f.json'));print('$f:',[(l['Name'],round(l['Confidence'])) for l in d['Labels']])"
   done
   ```
3. Run OCR on the receipt:
   ```bash
   aws textract detect-document-text --region eu-west-2 \
     --document "S3Object={Bucket=$BUCKET_NAME,Name=cli-test/receipt.jpg}" \
     --query "Blocks[?BlockType=='LINE'].Text" --output text
   ```
4. Clean up: `aws s3 rm "s3://$BUCKET_NAME/cli-test/" --recursive`
5. Compare the label names with the sets in [design/05-ai-pipeline.md §2](../design/05-ai-pipeline.md). Note any surprises for T32.

**Done when**
- [ ] Both label calls return labels (the landscape gets e.g. *Nature*, *Outdoors*)
- [ ] Textract prints the receipt's text lines
- [ ] The two fixture files exist
- [ ] The bucket is empty again

**Pitfalls**
- `AccessDeniedException` or `SubscriptionRequiredException`: the account is still activating. Wait 15–30 minutes.
- Textract rejects images over 10 MB. Use a smaller copy; the app itself only ever sends 1024 px thumbnails.
- The fixture files contain only labels, so they're fine to commit. Don't commit OCR output from real receipts.
