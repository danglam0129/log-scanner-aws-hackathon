output "api_url" {
  description = "API Gateway endpoint URL"
  value       = "${aws_apigatewayv2_api.api.api_endpoint}/api"
}

output "frontend_url" {
  description = "Frontend URL"
  value       = "http://${var.frontend_domain}"
}

output "s3_frontend_bucket_name" {
  description = "S3 bucket name for frontend"
  value       = aws_s3_bucket.frontend.id
}

output "s3_upload_bucket_name" {
  description = "S3 bucket name for uploads"
  value       = aws_s3_bucket.uploads.id
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (empty if disabled)"
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.cdn[0].id : ""
}

output "cognito_domain" {
  description = "Cognito hosted UI domain (empty if disabled)"
  value       = var.enable_cognito && var.cognito_domain_prefix != "" ? "https://${aws_cognito_user_pool_domain.main[0].domain}.auth.${var.aws_region}.amazoncognito.com" : ""
}

output "cognito_user_pool_client_id" {
  description = "Cognito user pool client ID (empty if disabled)"
  value       = var.enable_cognito ? aws_cognito_user_pool_client.app[0].id : ""
}
