#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FUNCTIONS=("$@")

if [ "${#FUNCTIONS[@]}" -eq 0 ]; then
  FUNCTIONS=(get_upload_urls process_image get_results delete_scan)
fi

bash "$SCRIPT_DIR/package.sh" "${FUNCTIONS[@]}"
command -v aws >/dev/null 2>&1 || {
  echo "Error: AWS CLI is required to deploy Lambda functions." >&2
  exit 1
}

for function in "${FUNCTIONS[@]}"; do
  if [ ! -f "$BACKEND_DIR/dist/$function.zip" ]; then
    echo "Error: package for '$function' was not created." >&2
    exit 1
  fi
  aws_function="semacare-${function//_/-}"
  aws lambda update-function-code \
    --function-name "$aws_function" \
    --zip-file "fileb://$BACKEND_DIR/dist/$function.zip"
  aws lambda wait function-updated --function-name "$aws_function"
  echo "Deployed $aws_function"
done
