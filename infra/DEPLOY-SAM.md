# Deploying the AWS test stack

This deploys one combined Lambda, IAM permissions, and an HTTP API for
SEMACARE using the existing temporary-thumbnail S3 bucket
`semacare-thumbs-tu-9822`.

The existing bucket is deliberately not created, replaced or deleted by the
stack.

## Prerequisites

- AWS CLI authenticated to the intended account.
- AWS SAM CLI installed.
- The Supabase schema and RLS scripts already applied.
- A Supabase service key available locally, but never committed or placed in
  `frontend/config.js`.

## Deploy

From the repository root, run:

```powershell
sam build --template-file infra/template.yaml
sam deploy --guided --template-file .aws-sam/build/template.yaml --capabilities CAPABILITY_IAM
```

During guided deployment, use:

- Region: `eu-west-2`
- `ExistingBucketName`: `semacare-thumbs-tu-9822`
- `SupabaseUrl`: the Supabase project URL
- `SupabasePublishableKey`: the publishable/anon key
- `SupabaseServiceKey`: the server-only service key
- `FrontendOrigin`: `http://localhost:5173` for local testing
- `UrlExpiry`: `300`

The stack output `ApiUrl` must be copied into `frontend/config.js` as `apiUrl`.
Keep the service key only in the Lambda parameter/environment configuration.

## Configure the existing S3 bucket

After deployment, add an S3 event notification on
`semacare-thumbs-tu-9822`:

- Event: `ObjectCreated`
- Suffix: `.jpg`
- Destination: the deployed `semacare-ai` Lambda

Apply [s3-cors.json](./s3-cors.json) to the bucket, adding the production
frontend origin if required. Confirm that the bucket remains private and that
[s3-lifecycle.json](./s3-lifecycle.json) is enabled.

## Test safely

1. Set an AWS budget alert before uploading images.
2. Start the frontend from `http://localhost:5173`.
3. Sign in to Supabase and enable both consent checkboxes.
4. Test one non-sensitive JPEG first.
5. Check the Lambda logs and the `images` row in Supabase.
6. Confirm that the S3 object is deleted after processing.
7. Test a small labelled set before uploading a full folder.

The application still limits scans to 500 images and upload-url requests to
50 images. The stack does not impose a billing cap; the AWS budget alert is
only a notification.
