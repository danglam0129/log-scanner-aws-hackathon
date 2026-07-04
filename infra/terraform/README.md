# LogScan — Terraform Infrastructure

## Architecture

Fully serverless infrastructure provisioned via Terraform:

- S3 upload bucket (private, encrypted, CORS for browser PUT)
- S3 frontend bucket (static website hosting)
- SQS scan queue + dead-letter queue
- DynamoDB table (PAY_PER_REQUEST)
- Lambda API function (Java 21, 15s timeout)
- Lambda Scanner function (Java 21, 45s timeout)
- API Gateway HTTP API
- Route 53 A record (S3 website alias)
- CloudWatch Log Groups (7-day retention)

## Resources

| Resource | Name Pattern |
|----------|-------------|
| S3 Upload | `var.upload_bucket_name` |
| S3 Frontend | `var.frontend_domain` |
| SQS Queue | `{project}-{env}-scan-queue` |
| SQS DLQ | `{project}-{env}-scan-dlq` |
| DynamoDB | `{project}-{env}-files` |
| Lambda API | `{project}-{env}-api` |
| Lambda Scanner | `{project}-{env}-threat-detection` |
| API Gateway | `{project}-{env}-api` |

## Cost

Fully serverless — near-zero cost at rest:
- Lambda: $0 when not invoked
- DynamoDB: $0 with on-demand billing at zero traffic
- S3: ~$0.023/GB/month stored
- Route 53: $0.50/month hosted zone

## Prerequisites

- Terraform >= 1.5
- AWS CLI configured with appropriate credentials
- Java 21 + Maven
- Node.js + npm

## Configure

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:
- Set `upload_bucket_name` to a globally unique bucket name.
- Set `route53_zone_id` if you want a custom domain.
- Adjust other variables as needed.

## Deploy

Automated:

```bash
./deploy.sh
```

## Manual Deploy

```bash
# Build Lambda
cd ../../lambda && mvn clean package -DskipTests && cd -

# Terraform
terraform init
terraform apply

# Build & upload frontend
cd ../../frontend
VITE_API_BASE_URL="$(cd ../infra/terraform && terraform output -raw api_url)" npm run build
aws s3 sync dist/ s3://$(cd ../infra/terraform && terraform output -raw s3_frontend_bucket_name)/ --delete
```

## Verify

```bash
# Health check
curl "$(terraform output -raw api_url)/health"
# Expected: {"status":"UP"}

# Frontend
curl -I http://log-scanner.cloudival.com
# Expected: HTTP/1.1 200 OK, Server: AmazonS3

# CORS
curl -i -X OPTIONS "$(terraform output -raw api_url)/files" \
  -H "Origin: http://log-scanner.cloudival.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
```

## CloudFront Limitation

CloudFront is disabled by default. The AWS account may not be verified for CloudFront distributions. To enable:

```hcl
enable_cloudfront        = true
frontend_certificate_arn = "arn:aws:acm:us-east-1:...:certificate/..."
```

Requires an ACM certificate in us-east-1.

## Cognito Note

Cognito is disabled by default because the frontend is served over HTTP (S3 website). Cognito hosted UI requires HTTPS callback URLs. To enable:

1. Enable CloudFront (provides HTTPS).
2. Set `enable_cognito = true` and `cognito_domain_prefix`.

## Bedrock Limitation

Bedrock is disabled by default (`detector_type = "MOCK"`). The AWS account may not have model access approved. To enable:

1. Request model access in the AWS Console.
2. Set `detector_type = "BEDROCK"`.

## Outputs

| Output | Description |
|--------|-------------|
| `api_url` | API Gateway endpoint + /api |
| `frontend_url` | Frontend URL (http://...) |
| `s3_frontend_bucket_name` | Frontend S3 bucket |
| `s3_upload_bucket_name` | Upload S3 bucket |
| `aws_region` | Deployed region |
| `cloudfront_distribution_id` | CF distribution ID (empty if disabled) |
| `cognito_domain` | Cognito domain (empty if disabled) |
| `cognito_user_pool_client_id` | Cognito client ID (empty if disabled) |

## Destroy

```bash
terraform destroy
```

Note: Frontend bucket has `force_destroy = true` so it will be deleted even with objects inside.
