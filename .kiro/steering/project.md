# Project Steering: LogScan

## Product Overview

LogScan is a serverless log file upload and threat detection web app. Users upload log files through a React frontend, files are stored privately in S3, S3 events trigger asynchronous scanning through SQS and Lambda, and scan results are stored in DynamoDB.

The project must prioritize a clean serverless AWS architecture suitable for a hackathon demo.

## Architecture Principles

- Use serverless AWS services by default.
- Keep the API stateless.
- Do not proxy file bytes through the API.
- Browser uploads must go directly to S3 using presigned PUT URLs.
- Scanning must be asynchronous.
- S3 ObjectCreated events must flow into SQS, then trigger Scanner Lambda.
- DynamoDB is the source of truth for file metadata and scan results.
- Terraform is the only infrastructure-as-code tool.

## Required Tech Stack

- Frontend: React 18, Vite 5, React Router 6.
- API: API Gateway HTTP API.
- Compute: Java 21 AWS Lambda.
- Storage: Amazon S3.
- Queue: Amazon SQS with DLQ.
- Database: DynamoDB on-demand.
- Infrastructure: Terraform.
- Default detector: MOCK.
- Default frontend domain: `http://log-scanner.cloudival.com`.

## Prohibited Architecture Choices

Do not use:

- Spring Boot
- `backend/` folder
- ECS
- ALB
- RDS
- PostgreSQL
- ECR
- NAT Gateway
- Docker deployment
- Lambda inside a VPC
- Required CloudFront
- Required Bedrock
- Required Cognito while frontend is HTTP-only

## AWS Deployment Rules

Default deployment flags:

```hcl
enable_cloudfront = false
enable_cognito    = false
detector_type     = "MOCK"