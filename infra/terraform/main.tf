locals {
  prefix               = "${var.project_name}-${var.environment}"
  frontend_bucket      = var.frontend_bucket_name != "" ? var.frontend_bucket_name : var.frontend_domain
  frontend_origin      = "http://${var.frontend_domain}"
  cors_allowed_origins = "${local.frontend_origin},http://localhost:5173"
  lambda_jar_path      = "${path.module}/../../lambda/target/logscan-lambda-1.0.0.jar"
}

# ─────────────────────────────────────────────────────────────────────────────
# S3: Upload Bucket
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "uploads" {
  bucket = var.upload_bucket_name
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT"]
    allowed_origins = [
      "http://localhost:5173",
      local.frontend_origin,
    ]
    max_age_seconds = 3600
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# S3: Frontend Bucket
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "frontend" {
  bucket        = local.frontend_bucket
  force_destroy = true
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = var.enable_cloudfront
  block_public_policy     = var.enable_cloudfront
  ignore_public_acls      = var.enable_cloudfront
  restrict_public_buckets = var.enable_cloudfront
}

resource "aws_s3_bucket_policy" "frontend_public" {
  count  = var.enable_cloudfront ? 0 : 1
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# ─────────────────────────────────────────────────────────────────────────────
# SQS: Scan Queue + DLQ
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_sqs_queue" "scan_dlq" {
  name                      = "${local.prefix}-scan-dlq"
  message_retention_seconds = 345600
}

resource "aws_sqs_queue" "scan_queue" {
  name                       = "${local.prefix}-scan-queue"
  visibility_timeout_seconds = var.scanner_lambda_timeout + 15
  message_retention_seconds  = 345600

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.scan_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue_policy" "scan_queue" {
  queue_url = aws_sqs_queue.scan_queue.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowS3SendMessage"
        Effect    = "Allow"
        Principal = { Service = "s3.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.scan_queue.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_s3_bucket.uploads.arn
          }
        }
      }
    ]
  })
}

# S3 → SQS notification
resource "aws_s3_bucket_notification" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  queue {
    queue_arn     = aws_sqs_queue.scan_queue.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "uploads/"
  }

  depends_on = [aws_sqs_queue_policy.scan_queue]
}

# ─────────────────────────────────────────────────────────────────────────────
# DynamoDB
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_dynamodb_table" "files" {
  name         = "${local.prefix}-files"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "ownerUserId"
  range_key    = "fileId"

  attribute {
    name = "ownerUserId"
    type = "S"
  }

  attribute {
    name = "fileId"
    type = "S"
  }

  attribute {
    name = "uploadedAt"
    type = "S"
  }

  global_secondary_index {
    name            = "ownerUploadedAtIndex"
    hash_key        = "ownerUserId"
    range_key       = "uploadedAt"
    projection_type = "ALL"
  }

  server_side_encryption {
    enabled = true
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# IAM: API Lambda Role
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "api_lambda" {
  name = "${local.prefix}-api-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy" "api_lambda" {
  name = "${local.prefix}-api-policy"
  role = aws_iam_role.api_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.api_lambda.arn}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query",
          "dynamodb:UpdateItem"
        ]
        Resource = [
          aws_dynamodb_table.files.arn,
          "${aws_dynamodb_table.files.arn}/index/*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.uploads.arn}/uploads/*"
      }
    ]
  })
}

# ─────────────────────────────────────────────────────────────────────────────
# IAM: Scanner Lambda Role
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "scanner_lambda" {
  name = "${local.prefix}-scanner-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy" "scanner_lambda" {
  name = "${local.prefix}-scanner-policy"
  role = aws_iam_role.scanner_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.scanner_lambda.arn}:*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.uploads.arn}/uploads/*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:UpdateItem"
        ]
        Resource = aws_dynamodb_table.files.arn
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.scan_queue.arn
      },
      {
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = "arn:aws:bedrock:*::foundation-model/*"
      }
    ]
  })
}

# ─────────────────────────────────────────────────────────────────────────────
# CloudWatch Log Groups
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "api_lambda" {
  name              = "/aws/lambda/${local.prefix}-api"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "scanner_lambda" {
  name              = "/aws/lambda/${local.prefix}-threat-detection"
  retention_in_days = 7
}

# ─────────────────────────────────────────────────────────────────────────────
# Lambda: API
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_lambda_function" "api" {
  function_name    = "${local.prefix}-api"
  role             = aws_iam_role.api_lambda.arn
  handler          = "com.logscan.lambda.ApiHandler::handleRequest"
  runtime          = "java21"
  memory_size      = var.lambda_memory
  timeout          = var.api_lambda_timeout
  filename         = local.lambda_jar_path
  source_code_hash = filebase64sha256(local.lambda_jar_path)

  reserved_concurrent_executions = var.lambda_reserved_concurrency

  environment {
    variables = {
      FILES_TABLE_NAME     = aws_dynamodb_table.files.name
      S3_BUCKET_NAME       = aws_s3_bucket.uploads.id
      CORS_ALLOWED_ORIGINS = local.cors_allowed_origins
    }
  }

  depends_on = [aws_cloudwatch_log_group.api_lambda]
}

# ─────────────────────────────────────────────────────────────────────────────
# Lambda: Scanner (Threat Detection)
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_lambda_function" "scanner" {
  function_name    = "${local.prefix}-threat-detection"
  role             = aws_iam_role.scanner_lambda.arn
  handler          = "com.logscan.lambda.ThreatDetectionHandler::handleRequest"
  runtime          = "java21"
  memory_size      = var.lambda_memory
  timeout          = var.scanner_lambda_timeout
  filename         = local.lambda_jar_path
  source_code_hash = filebase64sha256(local.lambda_jar_path)

  reserved_concurrent_executions = var.lambda_reserved_concurrency

  environment {
    variables = {
      FILES_TABLE_NAME = aws_dynamodb_table.files.name
      DETECTOR_TYPE    = var.detector_type
      BEDROCK_MODEL_ID = var.bedrock_model_id
    }
  }

  depends_on = [aws_cloudwatch_log_group.scanner_lambda]
}

# SQS → Scanner event source mapping
resource "aws_lambda_event_source_mapping" "scanner_sqs" {
  event_source_arn = aws_sqs_queue.scan_queue.arn
  function_name    = aws_lambda_function.scanner.arn
  batch_size       = 1
  enabled          = true
}

# ─────────────────────────────────────────────────────────────────────────────
# API Gateway HTTP API
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "api" {
  name          = "${local.prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["http://localhost:5173", local.frontend_origin]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["content-type", "authorization"]
  }
}

resource "aws_apigatewayv2_integration" "api_lambda" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "health_legacy" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /api/health"
  target    = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
}

resource "aws_apigatewayv2_route" "health_v1" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /api/v1/health"
  target    = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
}

resource "aws_apigatewayv2_route" "create_file" {
  api_id             = aws_apigatewayv2_api.api.id
  route_key          = "POST /api/v1/files"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = var.enable_cognito ? "JWT" : "NONE"
  authorizer_id      = var.enable_cognito ? aws_apigatewayv2_authorizer.cognito[0].id : null
}

resource "aws_apigatewayv2_route" "confirm_file" {
  api_id             = aws_apigatewayv2_api.api.id
  route_key          = "POST /api/v1/files/{fileId}/confirm"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = var.enable_cognito ? "JWT" : "NONE"
  authorizer_id      = var.enable_cognito ? aws_apigatewayv2_authorizer.cognito[0].id : null
}

resource "aws_apigatewayv2_route" "list_files" {
  api_id             = aws_apigatewayv2_api.api.id
  route_key          = "GET /api/v1/files"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = var.enable_cognito ? "JWT" : "NONE"
  authorizer_id      = var.enable_cognito ? aws_apigatewayv2_authorizer.cognito[0].id : null
}

resource "aws_apigatewayv2_route" "get_result" {
  api_id             = aws_apigatewayv2_api.api.id
  route_key          = "GET /api/v1/files/{fileId}/result"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = var.enable_cognito ? "JWT" : "NONE"
  authorizer_id      = var.enable_cognito ? aws_apigatewayv2_authorizer.cognito[0].id : null
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

# ─────────────────────────────────────────────────────────────────────────────
# Route 53 (when CloudFront is disabled and domain is configured)
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_route53_record" "frontend_s3" {
  count   = var.enable_cloudfront == false && var.frontend_domain != "" && var.route53_zone_id != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.frontend_domain
  type    = "A"

  alias {
    name                   = aws_s3_bucket_website_configuration.frontend.website_domain
    zone_id                = "Z3O0J2DXBE1FTB" # S3 website hosted zone ID for ap-southeast-1
    evaluate_target_health = false
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Cognito (optional, disabled by default)
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_cognito_user_pool" "main" {
  count = var.enable_cognito ? 1 : 0
  name  = "${local.prefix}-users"

  auto_verified_attributes = ["email"]

  schema {
    attribute_data_type = "String"
    name                = "email"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }
}

resource "aws_cognito_user_pool_client" "app" {
  count        = var.enable_cognito ? 1 : 0
  name         = "${local.prefix}-app"
  user_pool_id = aws_cognito_user_pool.main[0].id

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = [local.frontend_origin, "http://localhost:5173"]
  logout_urls   = [local.frontend_origin, "http://localhost:5173"]
}

resource "aws_cognito_user_pool_domain" "main" {
  count        = var.enable_cognito && var.cognito_domain_prefix != "" ? 1 : 0
  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.main[0].id
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  count            = var.enable_cognito ? 1 : 0
  api_id           = aws_apigatewayv2_api.api.id
  authorizer_type  = "JWT"
  name             = "cognito"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.app[0].id]
    issuer   = "https://${aws_cognito_user_pool.main[0].endpoint}"
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# CloudFront (optional, disabled by default) - uses OAC
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_cloudfront_origin_access_control" "frontend" {
  count                             = var.enable_cloudfront ? 1 : 0
  name                              = "${local.prefix}-frontend-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "cdn" {
  count   = var.enable_cloudfront ? 1 : 0
  enabled = true

  aliases             = var.frontend_domain != "" ? [var.frontend_domain] : []
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend[0].id
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "s3-frontend"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  viewer_certificate {
    acm_certificate_arn            = var.frontend_certificate_arn != "" ? var.frontend_certificate_arn : null
    ssl_support_method             = var.frontend_certificate_arn != "" ? "sni-only" : null
    cloudfront_default_certificate = var.frontend_certificate_arn == "" ? true : false
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}

# CloudFront bucket policy (private, only CF can access)
resource "aws_s3_bucket_policy" "frontend_cloudfront" {
  count  = var.enable_cloudfront ? 1 : 0
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipal"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.cdn[0].arn
          }
        }
      }
    ]
  })
}

# Route 53 → CloudFront
resource "aws_route53_record" "frontend_cf" {
  count   = var.enable_cloudfront && var.frontend_domain != "" && var.route53_zone_id != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.frontend_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.cdn[0].domain_name
    zone_id                = aws_cloudfront_distribution.cdn[0].hosted_zone_id
    evaluate_target_health = false
  }
}
