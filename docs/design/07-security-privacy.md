# 07: Security and Privacy

## 1. Principles

1. **No secret keys in the browser.** The Free-tier mode uses only a Supabase publishable/anon key with Auth and RLS. Supabase secret/service-role keys and AWS credentials stay server-side or in the gitignored local `backend/.env`.
2. **Least privilege.** Each Lambda role can do only what its function needs (§3).
3. **Minimal data.** No originals, filenames or paths leave the device. Thumbnails live for seconds. Metadata is auto-wiped by default.
4. **Consent first.** Nothing is uploaded before the consent checkbox.
5. **Nothing is deleted without confirmation.** The 24-hour bin belongs to the planned AWS mode; Free browser mode has a local-only bin.

## 2. Resource names (use exactly these)

| Resource | Name |
|---|---|
| AWS CLI profile | `semacare` |
| Region | `eu-west-2` |
| S3 bucket | `semacare-thumbs-<your-initials>-<4 random digits>`, e.g. `semacare-thumbs-tu-4821` |
| Lambda functions | `semacare-get-upload-urls`, `semacare-process-image`, `semacare-get-results`, `semacare-delete-scan` |
| IAM roles | `semacare-upload-urls-role`, `semacare-process-image-role`, `semacare-api-role` |
| HTTP API | `semacare-api` |

## 3. IAM policies

Every role also gets the AWS managed policy **`AWSLambdaBasicExecutionRole`** (CloudWatch logs).
Replace `BUCKET` with your bucket name.

### `semacare-upload-urls-role`: inline policy `semacare-upload-urls-s3`
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "s3:PutObject", "Resource": "arn:aws:s3:::BUCKET/*" }
  ]
}
```
(A presigned URL can only do what the signing role is allowed to do, so this role only needs PutObject.)

### `semacare-process-image-role`: inline policy `semacare-process-image`
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:GetObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::BUCKET/*" },
    { "Effect": "Allow", "Action": ["rekognition:DetectLabels", "textract:DetectDocumentText"], "Resource": "*" }
  ]
}
```
(Rekognition and Textract read the image from S3 **as the caller**, which is why `s3:GetObject` is required.)

### `semacare-api-role` (used by get_results and delete_scan): inline policy `semacare-api-s3`
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::BUCKET" },
    { "Effect": "Allow", "Action": "s3:DeleteObject", "Resource": "arn:aws:s3:::BUCKET/*" }
  ]
}
```

## 4. S3 bucket settings

| Setting | Value |
|---|---|
| Block all public access | **On** (all four boxes) |
| Default encryption | SSE-S3 (AES-256) |
| Versioning | Off (so deleted means deleted) |
| Object ownership | Bucket owner enforced (ACLs disabled) |
| Lifecycle rule `expire-thumbnails` | Whole bucket, expire current versions after **1 day** |
| Bucket policy | Deny non-TLS requests (below) |

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyInsecureTransport",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": ["arn:aws:s3:::BUCKET", "arn:aws:s3:::BUCKET/*"],
    "Condition": { "Bool": { "aws:SecureTransport": "false" } }
  }]
}
```

### S3 CORS configuration
```json
[
  {
    "AllowedOrigins": ["http://localhost:5173"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```
In T52, add your Vercel URL (e.g. `https://semacare.vercel.app`) to `AllowedOrigins`.

## 5. API Gateway CORS

| Setting | Value |
|---|---|
| Allow origins | `http://localhost:5173` (+ Vercel URL in T52) |
| Allow methods | `GET, POST, DELETE, OPTIONS` |
| Allow headers | `content-type, authorization` |
| Max age | `3600` |
| Allow credentials | No |

Throttling (stage `$default`): rate **20 req/s**, burst **40**. This protects the bill.

## 6. Threats and mitigations (for the dissertation)

| Threat | Mitigation in the MVP | Remaining risk / future work |
|---|---|---|
| Someone reads another user's results | AWS API verifies the Supabase bearer token and checks scan ownership; Free browser mode enforces `auth.uid()` through RLS | Supabase Auth availability is required for AWS API requests |
| Someone uploads junk/huge files | Presigned URL: 5-minute expiry, fixed key and content type; 500 images per scan; API throttling | PUT can't limit size → presigned POST with `content-length-range` (future) |
| Keys leaked from the frontend | The browser contains only the Supabase publishable/anon key; secret/service-role keys are prohibited | RLS must remain enabled for every exposed table |
| Thumbnails kept in the cloud | Deleted in `finally`; 1-day lifecycle; privacy wipe | |
| Accidental deletion | Free browser mode only hides items in a local bin and never removes originals | Local bin is lost if the page is refreshed |
| Bill shock | $5 budget alert; throttling; image caps | |
| Data in transit | HTTPS only; S3 bucket policy denies non-TLS | AWS negotiates TLS 1.2 or 1.3; the proposal's "TLS 1.3" wording is corrected to "TLS 1.2+" |

## 7. GDPR notes

- Lawful basis: **consent** (explicit checkbox before Free-mode cloud metadata sync; its state is not saved).
- Data minimisation: AWS mode sends thumbnails, deleted immediately; Free browser mode sends metadata only, never filenames, paths, or images.
- Storage limitation: AWS mode uses auto-wipe and a 1-day S3 lifecycle; Free mode retains metadata until the user erases it.
- Right to erasure: Free mode provides an account-wide metadata erase action; AWS mode has its cloud wipe and auto-wipe.
- Processor: AWS (London) and Supabase (London). Mention the data processing terms in the dissertation.
- Testing with other people's images requires the ethics approval (ER1). Participants use their own devices and folders; no data is collected beyond the SUS form (T51).

## 8. Free-tier browser mode

The browser can use Supabase Auth and `supabase/client-rls.sql` to save scan and image
metadata. The user must tick the metadata-consent checkbox before metadata is written.
AWS AI processing additionally requires the user to sign in and separately consent to
upload temporary, resized JPEG thumbnails. The browser sends a Supabase access token to
the API; the backend validates it with Supabase Auth and derives the user ID from the
verified response, never from a caller-supplied ID. Originals, filenames, and paths are
not sent. Both checkboxes are off by default.

Without the optional AWS API URL and explicit image-upload consent, the browser uses
filename guesses and manual categories only. In AWS mode, a resized temporary thumbnail
is uploaded to private S3 and processed by Rekognition, with Textract used for likely
text images. The thumbnail is deleted after processing and also expires through the
one-day lifecycle rule. AWS services can incur charges. The local bin changes only the
current page, and the original files remain untouched.
