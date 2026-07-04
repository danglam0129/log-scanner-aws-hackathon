variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "ap-southeast-1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "log-threat-detection"
}

variable "upload_bucket_name" {
  description = "Globally unique S3 bucket name for log file uploads"
  type        = string
}

variable "frontend_bucket_name" {
  description = "S3 bucket name for frontend. If empty, uses frontend_domain value"
  type        = string
  default     = ""
}

variable "frontend_domain" {
  description = "Custom domain for the frontend"
  type        = string
  default     = "log-scanner.cloudival.com"
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for the frontend domain"
  type        = string
  default     = ""
}

variable "enable_cloudfront" {
  description = "Enable CloudFront distribution for frontend"
  type        = bool
  default     = false
}

variable "enable_cognito" {
  description = "Enable Cognito user pool authentication"
  type        = bool
  default     = false
}

variable "cognito_domain_prefix" {
  description = "Cognito hosted UI domain prefix"
  type        = string
  default     = ""
}

variable "detector_type" {
  description = "Threat detector type: MOCK or BEDROCK"
  type        = string
  default     = "MOCK"
}

variable "bedrock_model_id" {
  description = "Bedrock model ID for threat detection"
  type        = string
  default     = "anthropic.claude-3-haiku-20240307-v1:0"
}

variable "lambda_memory" {
  description = "Lambda function memory in MB"
  type        = number
  default     = 512
}

variable "api_lambda_timeout" {
  description = "API Lambda timeout in seconds"
  type        = number
  default     = 15
}

variable "scanner_lambda_timeout" {
  description = "Scanner Lambda timeout in seconds"
  type        = number
  default     = 45
}

variable "lambda_reserved_concurrency" {
  description = "Reserved concurrency for Lambda functions. Null means unreserved."
  type        = number
  default     = null
}

variable "frontend_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 for CloudFront HTTPS"
  type        = string
  default     = ""
}
