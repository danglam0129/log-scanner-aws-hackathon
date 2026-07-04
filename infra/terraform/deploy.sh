#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== LogScan Deploy Script ==="

# 1. Check prerequisites
for cmd in terraform aws npm mvn; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' is not installed or not in PATH."
    exit 1
  fi
done
echo "✓ All prerequisites found."

# 2. Verify terraform.tfvars exists
if [ ! -f "$SCRIPT_DIR/terraform.tfvars" ]; then
  echo "ERROR: terraform.tfvars not found in $SCRIPT_DIR"
  echo "Copy terraform.tfvars.example to terraform.tfvars and fill in values."
  exit 1
fi
echo "✓ terraform.tfvars found."

# 3. Build Lambda JAR
echo ""
echo "=== Building Lambda ==="
cd "$ROOT_DIR/lambda"
mvn clean package -DskipTests
echo "✓ Lambda JAR built."

# 4. Terraform init + apply
echo ""
echo "=== Terraform Apply ==="
cd "$SCRIPT_DIR"
terraform init
terraform apply

# 5. Read Terraform outputs
echo ""
echo "=== Reading Outputs ==="
AWS_REGION=$(terraform output -raw aws_region)
API_URL=$(terraform output -raw api_url)
FRONTEND_URL=$(terraform output -raw frontend_url)
FRONTEND_BUCKET=$(terraform output -raw s3_frontend_bucket_name)
CF_DIST_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")
COGNITO_DOMAIN=$(terraform output -raw cognito_domain 2>/dev/null || echo "")
COGNITO_CLIENT_ID=$(terraform output -raw cognito_user_pool_client_id 2>/dev/null || echo "")

echo "  Region:   $AWS_REGION"
echo "  API URL:  $API_URL"
echo "  Frontend: $FRONTEND_URL"
echo "  Bucket:   $FRONTEND_BUCKET"

# 6. Build frontend
echo ""
echo "=== Building Frontend ==="
cd "$ROOT_DIR/frontend"

export VITE_API_BASE_URL="$API_URL"
export VITE_COGNITO_DOMAIN="$COGNITO_DOMAIN"
export VITE_COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID"
export VITE_COGNITO_REDIRECT_URI="$FRONTEND_URL"
export VITE_COGNITO_LOGOUT_URI="$FRONTEND_URL"

npm ci
npm run build
echo "✓ Frontend built."

# 7. Upload frontend to S3
echo ""
echo "=== Uploading Frontend ==="
aws s3 sync dist/ "s3://$FRONTEND_BUCKET/" --delete --region "$AWS_REGION"
echo "✓ Frontend uploaded to s3://$FRONTEND_BUCKET/"

# 8. Invalidate CloudFront if enabled
if [ -n "$CF_DIST_ID" ]; then
  echo ""
  echo "=== Invalidating CloudFront ==="
  aws cloudfront create-invalidation --distribution-id "$CF_DIST_ID" --paths "/*"
  echo "✓ CloudFront invalidation created."
fi

# 9. Done
echo ""
echo "==============================="
echo "Deployment complete."
echo "Frontend: $FRONTEND_URL"
echo "API:      $API_URL"
echo "==============================="
